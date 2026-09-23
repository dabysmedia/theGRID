import "server-only"

import { NextRequest } from "next/server"
import { GET as searchFoodsRoute } from "@/app/api/food-search/route"
import { updateHiddenFoods } from "@/lib/calories/hidden-foods"
import { normalizeFoodImageUrl } from "@/lib/calories/food-image"
import { foodPortionMultiplier, isFoodMeasurementUnit } from "@/lib/calories/measurements"
import {
  inferSavedFoodCategory,
  isSavedFoodCategory,
} from "@/lib/calories/saved-food-category"
import { parseRecipeIngredients, recipeNutritionTotals } from "@/lib/calories/recipes"
import type { FoodSearchItem } from "@/lib/calories/open-food-facts"
import { parseYyyyMmDdToStoredDate, utcCalendarDayKeyFromIso, utcRangeWhereForCalendarDay } from "@/lib/dateStorage"
import { prisma } from "@/lib/prisma"
import { assertNotVacationBlocked } from "@/lib/vacation-block-server"
import {
  ActError,
  foodUnit,
  num,
  pick,
  requireIds,
  resolveDayKey,
  resolveLogSlot,
  scaleMacros,
  scalePortion,
  str,
} from "@/lib/agent/act/parse"
import type { ActContext, ActFn } from "@/lib/agent/act/types"

const MEAL_TAGS = new Set(["breakfast", "lunch", "dinner", "snack"])
const TAG_FROM_SLOT: Record<string, string> = {
  morning: "breakfast",
  afternoon: "lunch",
  evening: "dinner",
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  snack: "snack",
}

function userOf(ctx: ActContext | null): ActContext {
  if (!ctx) throw new ActError("This op needs a user.")
  return ctx
}

function mealTags(value: unknown, fallback: string[] | null): string[] {
  if (value == null || value === "") {
    if (fallback && fallback.length > 0) return fallback
    return ["snack"]
  }
  const list = Array.isArray(value) ? value : [value]
  const tags = [
    ...new Set(list.map((tag) => TAG_FROM_SLOT[str(tag).toLowerCase()]).filter((tag) => MEAL_TAGS.has(tag))),
  ]
  if (tags.length === 0) {
    throw new ActError("tags must include breakfast, lunch, dinner, or snack.")
  }
  return tags
}

function limitOf(value: unknown, fallback: number, max: number): number {
  const parsed = num(value)
  if (parsed == null) return fallback
  return Math.max(1, Math.min(max, Math.round(parsed)))
}

function compactFood(food: FoodSearchItem): Record<string, unknown> {
  return pick({
    name: food.food_name,
    brand: food.brand_name,
    kcal: food.calories,
    p: food.protein,
    c: food.carbs,
    f: food.fat,
    serving: food.serving_description,
    g: food.serving_size_g,
    src: food.source,
  })
}

async function foodSearch(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const query = str(args.q ?? args.query ?? args.name)
  const barcode = str(args.barcode ?? args.code)
  const n = limitOf(args.n ?? args.limit, 6, 12)
  if (!barcode && query.length < 2) throw new ActError("food.search needs q (2+ characters) or barcode.")
  const url = barcode
    ? `http://agent.local/api/food-search?barcode=${encodeURIComponent(barcode)}`
    : `http://agent.local/api/food-search?q=${encodeURIComponent(query)}`
  const res = await searchFoodsRoute(new NextRequest(url))
  const data = (await res.json()) as { foods?: FoodSearchItem[]; error?: string }
  const items = (data.foods ?? []).slice(0, n).map(compactFood)
  if (!res.ok && items.length === 0) throw new ActError(data.error || "Food search failed.")
  return pick({ n: items.length, items, note: items.length === 0 ? data.error : null })
}

function logRow(entry: {
  id: string
  date: Date
  mealSlot: string | null
  mealType: string
  description: string | null
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  portionAmount: number | null
  portionUnit: string | null
}): Record<string, unknown> {
  return pick({
    id: entry.id,
    date: utcCalendarDayKeyFromIso(entry.date),
    slot: entry.mealSlot,
    meal: entry.mealType,
    name: entry.description,
    kcal: entry.calories,
    p: entry.protein,
    c: entry.carbs,
    f: entry.fat,
    amt: entry.portionAmount,
    unit: entry.portionUnit,
  })
}

async function logList(args: Record<string, unknown>, ctx: ActContext | null) {
  const { user, today } = userOf(ctx)
  const date = resolveDayKey(args.date, today)
  const entries = await prisma.calorieEntry.findMany({
    where: { userId: user.id, date: utcRangeWhereForCalendarDay(date) },
    orderBy: { createdAt: "asc" },
  })
  return { date, items: entries.map(logRow) }
}

interface PreparedLog {
  data: {
    date: Date
    mealType: string
    mealSlot: string
    description: string | null
    calories: number
    protein: number | null
    carbs: number | null
    fat: number | null
    imageUrl: string | null
    portionAmount: number | null
    portionUnit: "serving" | "g" | "oz" | "piece" | null
    userId: string
  }
  savedMealId?: string
  recipeId?: string
}

async function prepareLogItem(
  item: Record<string, unknown>,
  ctx: ActContext,
  defaults: { date: string; mealSlot: string; mealType: string },
): Promise<PreparedLog> {
  const date = resolveDayKey(item.date ?? defaults.date, ctx.today)
  const slot = item.slot != null || item.meal != null
    ? resolveLogSlot(item.slot ?? item.meal, ctx.now, ctx.user.timeZone)
    : { mealSlot: defaults.mealSlot, mealType: defaults.mealType }
  const foodId = str(item.foodId ?? item.savedId)
  const recipeId = str(item.recipeId)
  let name = str(item.name ?? item.description)
  let kcal = num(item.kcal ?? item.calories)
  let protein = num(item.p ?? item.protein)
  let carbs = num(item.c ?? item.carbs)
  let fat = num(item.f ?? item.fat)
  let amount = num(item.amt ?? item.amount ?? item.portionAmount)
  let unit = item.unit ?? item.portionUnit
  let image: string | null = normalizeFoodImageUrl(item.image)
  let savedMealId: string | undefined
  let loggedRecipeId: string | undefined
  let factor = num(item.servings ?? item.qty ?? item.scale) ?? 1

  if (foodId) {
    const meal = await prisma.savedMeal.findFirst({ where: { id: foodId, userId: ctx.user.id } })
    if (!meal) throw new ActError("Saved food not found.", 404)
    const basisUnit = isFoodMeasurementUnit(meal.servingUnit) ? meal.servingUnit : "serving"
    if (item.amt != null || item.unit != null || item.amount != null) {
      const chosen = foodUnit(unit, basisUnit)
      const chosenAmount = amount ?? meal.servingAmount
      const multiplier = foodPortionMultiplier({
        amount: chosenAmount,
        unit: chosen,
        basisAmount: meal.servingAmount,
        basisUnit,
        servingWeightG: meal.servingWeightG,
      })
      if (multiplier == null) {
        throw new ActError("Can't convert that portion. Pass servings, or amt in the food's unit.")
      }
      factor = multiplier
      amount = chosenAmount
      unit = chosen
    } else if (factor <= 0) {
      throw new ActError("servings must be greater than 0.")
    } else {
      amount = scalePortion(meal.servingAmount, factor)
      unit = basisUnit
    }
    const scaled = scaleMacros(
      { kcal: meal.calories, p: meal.protein, c: meal.carbs, f: meal.fat },
      factor,
    )
    name = name || meal.name
    kcal = scaled.kcal
    protein = scaled.p
    carbs = scaled.c
    fat = scaled.f
    image = image ?? meal.imageUrl
    savedMealId = meal.id
  } else if (recipeId) {
    const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, userId: ctx.user.id } })
    if (!recipe) throw new ActError("Recipe not found.", 404)
    if (factor <= 0) throw new ActError("servings must be greater than 0.")
    const scaled = scaleMacros(
      { kcal: recipe.calories, p: recipe.protein, c: recipe.carbs, f: recipe.fat },
      factor,
    )
    name = name || recipe.name
    kcal = scaled.kcal
    protein = scaled.p
    carbs = scaled.c
    fat = scaled.f
    loggedRecipeId = recipe.id
  } else if (factor !== 1) {
    if (kcal == null) throw new ActError("log.add needs kcal, foodId, or recipeId.")
    const scaled = scaleMacros({ kcal, p: protein, c: carbs, f: fat }, factor)
    kcal = scaled.kcal
    protein = scaled.p
    carbs = scaled.c
    fat = scaled.f
    amount = scalePortion(amount, factor)
  }

  if (!name) throw new ActError("log.add needs a name.")
  if (kcal == null || kcal < 0 || kcal > 20000) throw new ActError("kcal must be between 0 and 20000.")
  const portionUnit = amount != null && amount > 0 ? foodUnit(unit, "serving") : null

  return {
    savedMealId,
    recipeId: loggedRecipeId,
    data: {
      date: parseYyyyMmDdToStoredDate(date),
      mealType: slot.mealType,
      mealSlot: slot.mealSlot,
      description: name.slice(0, 180),
      calories: Math.round(kcal),
      protein,
      carbs,
      fat,
      imageUrl: image,
      portionAmount: amount != null && amount > 0 ? amount : null,
      portionUnit,
      userId: ctx.user.id,
    },
  }
}

async function logAdd(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const defaults = {
    date: resolveDayKey(args.date, context.today),
    ...resolveLogSlot(args.slot ?? args.meal, context.now, context.user.timeZone),
  }
  const rawItems = Array.isArray(args.items) ? args.items : [args]
  if (rawItems.length === 0 || rawItems.length > 30) throw new ActError("Log between 1 and 30 foods.")
  const prepared: PreparedLog[] = []
  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ActError("Each logged food must be an object.")
    prepared.push(await prepareLogItem(raw as Record<string, unknown>, context, defaults))
  }
  const dates = [...new Set(prepared.map((item) => utcCalendarDayKeyFromIso(item.data.date)))]
  for (const date of dates) await assertNotVacationBlocked(context.user.id, date)

  const ids: string[] = []
  await prisma.$transaction(async (tx) => {
    for (const item of prepared) {
      const row = await tx.calorieEntry.create({ data: item.data })
      ids.push(row.id)
      if (item.savedMealId) {
        await tx.savedMeal.update({
          where: { id: item.savedMealId },
          data: { useCount: { increment: 1 } },
        })
      }
      if (item.recipeId) {
        await tx.recipe.update({
          where: { id: item.recipeId },
          data: { useCount: { increment: 1 } },
        })
      }
    }
  })
  return ids.length === 1 ? { id: ids[0], ids } : { ids }
}

async function logUpdate(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const id = str(args.id)
  if (!id) throw new ActError("id is required.")
  const existing = await prisma.calorieEntry.findFirst({ where: { id, userId: context.user.id } })
  if (!existing) throw new ActError("Food log not found.", 404)
  const date = args.date != null
    ? resolveDayKey(args.date, context.today)
    : utcCalendarDayKeyFromIso(existing.date)
  const slot = args.slot != null || args.meal != null
    ? resolveLogSlot(args.slot ?? args.meal, context.now, context.user.timeZone)
    : {
        mealSlot: (existing.mealSlot as "morning" | "afternoon" | "evening" | null) ?? "afternoon",
        mealType: existing.mealType,
      }
  await assertNotVacationBlocked(context.user.id, date)
  const kcal = num(args.kcal ?? args.calories)
  if ((args.kcal != null || args.calories != null) && (kcal == null || kcal < 0 || kcal > 20000)) {
    throw new ActError("kcal must be between 0 and 20000.")
  }
  const entry = await prisma.calorieEntry.update({
    where: { id },
    data: {
      date: parseYyyyMmDdToStoredDate(date),
      mealSlot: slot.mealSlot,
      mealType: slot.mealType,
      description: args.name != null || args.description != null
        ? str(args.name ?? args.description).slice(0, 180) || null
        : existing.description,
      calories: kcal == null ? existing.calories : Math.round(kcal),
      protein: args.p != null || args.protein != null ? num(args.p ?? args.protein) : existing.protein,
      carbs: args.c != null || args.carbs != null ? num(args.c ?? args.carbs) : existing.carbs,
      fat: args.f != null || args.fat != null ? num(args.f ?? args.fat) : existing.fat,
      portionAmount: args.amt != null || args.amount != null
        ? num(args.amt ?? args.amount)
        : existing.portionAmount,
      portionUnit: args.unit != null ? foodUnit(args.unit, "serving") : existing.portionUnit,
    },
  })
  return logRow(entry)
}

async function logMove(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const ids = requireIds(args)
  if (args.date == null && args.slot == null && args.meal == null) {
    throw new ActError("log.move needs a date, a slot, or both.")
  }
  const owned = await prisma.calorieEntry.findMany({
    where: { id: { in: ids }, userId: context.user.id },
  })
  if (owned.length !== ids.length) throw new ActError("One or more foods were not found.", 404)
  const date = args.date != null ? resolveDayKey(args.date, context.today) : null
  const slot = args.slot != null || args.meal != null
    ? resolveLogSlot(args.slot ?? args.meal, context.now, context.user.timeZone)
    : null
  if (date) await assertNotVacationBlocked(context.user.id, date)
  await prisma.$transaction(
    owned.map((entry) =>
      prisma.calorieEntry.update({
        where: { id: entry.id },
        data: {
          ...(date ? { date: parseYyyyMmDdToStoredDate(date) } : {}),
          ...(slot ? { mealSlot: slot.mealSlot, mealType: slot.mealType } : {}),
        },
      }),
    ),
  )
  return { moved: ids.length, ...(date ? { date } : {}), ...(slot ? { slot: slot.mealSlot } : {}) }
}

async function logDel(args: Record<string, unknown>, ctx: ActContext | null) {
  const { user } = userOf(ctx)
  const ids = requireIds(args)
  const result = await prisma.calorieEntry.deleteMany({ where: { id: { in: ids }, userId: user.id } })
  if (result.count === 0) throw new ActError("Food log not found.", 404)
  return { deleted: result.count }
}

function savedRow(meal: {
  id: string
  name: string
  mealType: string
  foodCategory: string | null
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  servingAmount: number
  servingUnit: string
  servingWeightG: number | null
}): Record<string, unknown> {
  return pick({
    id: meal.id,
    name: meal.name,
    kcal: meal.calories,
    p: meal.protein,
    c: meal.carbs,
    f: meal.fat,
    tags: meal.mealType,
    category: isSavedFoodCategory(meal.foodCategory)
      ? meal.foodCategory
      : inferSavedFoodCategory(meal),
    amt: meal.servingAmount,
    unit: meal.servingUnit,
    grams: meal.servingWeightG,
  })
}

async function foodsList(args: Record<string, unknown>, ctx: ActContext | null) {
  const { user } = userOf(ctx)
  const q = str(args.q ?? args.query).toLowerCase()
  const n = limitOf(args.n ?? args.limit, 25, 50)
  const meals = await prisma.savedMeal.findMany({
    where: { userId: user.id },
    orderBy: { useCount: "desc" },
  })
  const items = meals
    .filter((meal) => !q || meal.name.toLowerCase().includes(q))
    .slice(0, n)
    .map(savedRow)
  return { n: items.length, items }
}

async function foodsAdd(args: Record<string, unknown>, ctx: ActContext | null) {
  const { user } = userOf(ctx)
  const name = str(args.name)
  const kcal = num(args.kcal ?? args.calories)
  if (!name) throw new ActError("foods.add needs a name.")
  if (kcal == null || kcal < 0) throw new ActError("foods.add needs kcal.")
  const tags = mealTags(args.tags ?? args.tag ?? args.meal, null)
  const mealType = tags.join(",")
  const calories = Math.round(kcal)
  const servingAmount = num(args.amt ?? args.amount)
  const meal = await prisma.savedMeal.create({
    data: {
      name: name.slice(0, 120),
      mealType,
      foodCategory: isSavedFoodCategory(args.category)
        ? args.category
        : inferSavedFoodCategory({ name, mealType, calories }),
      calories,
      protein: num(args.p ?? args.protein),
      carbs: num(args.c ?? args.carbs),
      fat: num(args.f ?? args.fat),
      imageUrl: normalizeFoodImageUrl(args.image),
      servingAmount: servingAmount != null && servingAmount > 0 ? servingAmount : 1,
      servingUnit: foodUnit(args.unit, "serving"),
      servingWeightG: num(args.grams ?? args.servingWeightG),
      userId: user.id,
    },
  })
  return savedRow(meal)
}

async function foodsUpdate(args: Record<string, unknown>, ctx: ActContext | null) {
  const { user } = userOf(ctx)
  const id = str(args.id)
  if (!id) throw new ActError("id is required.")
  const existing = await prisma.savedMeal.findFirst({ where: { id, userId: user.id } })
  if (!existing) throw new ActError("Saved food not found.", 404)
  const name = args.name != null ? str(args.name) : existing.name
  if (!name) throw new ActError("name cannot be empty.")
  const kcal = args.kcal != null || args.calories != null ? num(args.kcal ?? args.calories) : existing.calories
  if (kcal == null || kcal < 0) throw new ActError("kcal must be 0 or more.")
  const tags = mealTags(
    args.tags ?? args.tag ?? args.meal,
    existing.mealType.split(",").map((tag) => tag.trim()).filter((tag) => MEAL_TAGS.has(tag)),
  )
  const mealType = tags.join(",")
  const calories = Math.round(kcal)
  const meal = await prisma.savedMeal.update({
    where: { id },
    data: {
      name: name.slice(0, 120),
      mealType,
      foodCategory: args.category != null && isSavedFoodCategory(args.category)
        ? args.category
        : existing.foodCategory ?? inferSavedFoodCategory({ name, mealType, calories }),
      calories,
      protein: args.p != null || args.protein != null ? num(args.p ?? args.protein) : existing.protein,
      carbs: args.c != null || args.carbs != null ? num(args.c ?? args.carbs) : existing.carbs,
      fat: args.f != null || args.fat != null ? num(args.f ?? args.fat) : existing.fat,
      ...(args.image != null ? { imageUrl: normalizeFoodImageUrl(args.image) } : {}),
      servingAmount: num(args.amt ?? args.amount) ?? existing.servingAmount,
      servingUnit: args.unit != null ? foodUnit(args.unit, "serving") : existing.servingUnit,
      servingWeightG: args.grams != null || args.servingWeightG != null
        ? num(args.grams ?? args.servingWeightG)
        : existing.servingWeightG,
    },
  })
  return savedRow(meal)
}

async function foodsDel(args: Record<string, unknown>, ctx: ActContext | null) {
  const { user } = userOf(ctx)
  const id = str(args.id)
  if (!id) throw new ActError("id is required.")
  const deleted = await prisma.$transaction(async (tx) => {
    const meal = await tx.savedMeal.findFirst({ where: { id, userId: user.id } })
    if (!meal) return false
    const owner = await tx.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { hiddenFoodNamesJson: true },
    })
    await tx.user.update({
      where: { id: user.id },
      data: { hiddenFoodNamesJson: updateHiddenFoods(owner.hiddenFoodNamesJson, meal.name, true) },
    })
    await tx.savedMeal.delete({ where: { id: meal.id } })
    return true
  })
  if (!deleted) throw new ActError("Saved food not found.", 404)
  return { deleted: 1 }
}

function recipeItems(value: unknown) {
  if (!Array.isArray(value)) return null
  return parseRecipeIngredients(
    value.map((item) => {
      if (!item || typeof item !== "object") return item
      const row = item as Record<string, unknown>
      return {
        name: row.name,
        calories: row.kcal ?? row.calories,
        protein: row.p ?? row.protein,
        carbs: row.c ?? row.carbs,
        fat: row.f ?? row.fat,
        portionAmount: row.amt ?? row.amount ?? row.portionAmount ?? 1,
        portionUnit: row.unit ?? row.portionUnit ?? "serving",
      }
    }),
  )
}

function recipeRow(recipe: {
  id: string
  name: string
  mealType: string
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  ingredients?: { name: string; calories: number; protein: number | null; carbs: number | null; fat: number | null; portionAmount: number; portionUnit: string }[]
}): Record<string, unknown> {
  return pick({
    id: recipe.id,
    name: recipe.name,
    tags: recipe.mealType,
    kcal: recipe.calories,
    p: recipe.protein,
    c: recipe.carbs,
    f: recipe.fat,
    items: recipe.ingredients?.map((item) =>
      pick({
        name: item.name,
        kcal: item.calories,
        p: item.protein,
        c: item.carbs,
        f: item.fat,
        amt: item.portionAmount,
        unit: item.portionUnit,
      }),
    ),
  })
}

async function recipesList(args: Record<string, unknown>, ctx: ActContext | null) {
  const { user } = userOf(ctx)
  const q = str(args.q ?? args.query).toLowerCase()
  const recipes = await prisma.recipe.findMany({
    where: { userId: user.id },
    include: { ingredients: { orderBy: { sortOrder: "asc" } } },
    orderBy: [{ useCount: "desc" }, { updatedAt: "desc" }],
    take: 30,
  })
  const items = recipes.filter((recipe) => !q || recipe.name.toLowerCase().includes(q)).map(recipeRow)
  return { n: items.length, items }
}

async function recipesAdd(args: Record<string, unknown>, ctx: ActContext | null) {
  const { user } = userOf(ctx)
  const name = str(args.name)
  const tags = mealTags(args.tags ?? args.tag ?? args.meal, null)
  const ingredients = recipeItems(args.items ?? args.ingredients)
  if (!name || !ingredients) {
    throw new ActError("recipes.add needs a name and items:[{name,kcal}].")
  }
  const totals = recipeNutritionTotals(ingredients)
  const recipe = await prisma.recipe.create({
    data: {
      name: name.slice(0, 120),
      mealType: tags.join(","),
      imageUrl: normalizeFoodImageUrl(args.image),
      ...totals,
      userId: user.id,
      ingredients: {
        create: ingredients.map((item, sortOrder) => ({ ...item, sortOrder })),
      },
    },
    include: { ingredients: { orderBy: { sortOrder: "asc" } } },
  })
  return recipeRow(recipe)
}

async function recipesUpdate(args: Record<string, unknown>, ctx: ActContext | null) {
  const { user } = userOf(ctx)
  const id = str(args.id)
  if (!id) throw new ActError("id is required.")
  const existing = await prisma.recipe.findFirst({
    where: { id, userId: user.id },
    include: { ingredients: { orderBy: { sortOrder: "asc" } } },
  })
  if (!existing) throw new ActError("Recipe not found.", 404)
  const name = args.name != null ? str(args.name) : existing.name
  const tags = mealTags(
    args.tags ?? args.tag ?? args.meal,
    existing.mealType.split(",").filter((tag) => MEAL_TAGS.has(tag)),
  )
  const ingredients = args.items != null || args.ingredients != null
    ? recipeItems(args.items ?? args.ingredients)
    : existing.ingredients.map((item) => ({
        name: item.name,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        portionAmount: item.portionAmount,
        portionUnit: isFoodMeasurementUnit(item.portionUnit) ? item.portionUnit : "serving" as const,
        imageUrl: item.imageUrl,
      }))
  if (!name || !ingredients) throw new ActError("Recipe needs a name and at least one ingredient.")
  const totals = recipeNutritionTotals(ingredients)
  const recipe = await prisma.recipe.update({
    where: { id },
    data: {
      name: name.slice(0, 120),
      mealType: tags.join(","),
      ...(args.image != null ? { imageUrl: normalizeFoodImageUrl(args.image) } : {}),
      ...totals,
      ingredients: {
        deleteMany: {},
        create: ingredients.map((item, sortOrder) => ({
          ...item,
          imageUrl: normalizeFoodImageUrl(item.imageUrl),
          sortOrder,
        })),
      },
    },
    include: { ingredients: { orderBy: { sortOrder: "asc" } } },
  })
  return recipeRow(recipe)
}

async function recipesDel(args: Record<string, unknown>, ctx: ActContext | null) {
  const { user } = userOf(ctx)
  const ids = requireIds(args)
  const result = await prisma.recipe.deleteMany({ where: { id: { in: ids }, userId: user.id } })
  if (result.count === 0) throw new ActError("Recipe not found.", 404)
  return { deleted: result.count }
}

async function recipesLog(args: Record<string, unknown>, ctx: ActContext | null) {
  const id = str(args.id)
  if (!id) throw new ActError("id is required.")
  return logAdd({ ...args, recipeId: id, items: undefined }, ctx)
}

export const nutritionHandlers: Record<string, ActFn> = {
  "food.search": (args) => foodSearch(args),
  "log.list": logList,
  "log.add": logAdd,
  "log.update": logUpdate,
  "log.move": logMove,
  "log.del": logDel,
  "foods.list": foodsList,
  "foods.add": foodsAdd,
  "foods.update": foodsUpdate,
  "foods.del": foodsDel,
  "recipes.list": recipesList,
  "recipes.add": recipesAdd,
  "recipes.update": recipesUpdate,
  "recipes.del": recipesDel,
  "recipes.log": recipesLog,
}
