import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"
import { normalizeFoodImageUrl } from "@/lib/calories/food-image"
import {
  parseRecipeIngredients,
  recipeNutritionTotals,
  type RecipeIngredientInput,
} from "@/lib/calories/recipes"

const ALLOWED_MEAL_TAGS = new Set(["breakfast", "lunch", "dinner", "snack"])

function normalizeMealTags(body: Record<string, unknown>): string[] | null {
  const raw = Array.isArray(body.mealTags) ? body.mealTags : [body.mealType]
  const tags = [
    ...new Set(
      raw
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => ALLOWED_MEAL_TAGS.has(tag)),
    ),
  ]
  return tags.length > 0 ? tags : null
}

function ingredientCreateData(items: RecipeIngredientInput[]) {
  return items.map((item, sortOrder) => ({
    ...item,
    imageUrl: normalizeFoodImageUrl(item.imageUrl),
    sortOrder,
  }))
}

async function parseRecipeBody(req: NextRequest) {
  const body = (await req.json()) as Record<string, unknown>
  const name = typeof body.name === "string" ? body.name.trim() : ""
  const mealTags = normalizeMealTags(body)
  const ingredients = parseRecipeIngredients(body.ingredients)
  if (!name || name.length > 120 || !mealTags || !ingredients) return null
  return {
    name,
    mealType: mealTags.join(","),
    imageUrl: normalizeFoodImageUrl(body.imageUrl),
    ingredients,
    totals: recipeNutritionTotals(ingredients),
  }
}

const recipeInclude = {
  ingredients: { orderBy: { sortOrder: "asc" as const } },
}

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const recipes = await prisma.recipe.findMany({
      where: { userId },
      include: recipeInclude,
      orderBy: [{ useCount: "desc" }, { updatedAt: "desc" }],
    })
    return NextResponse.json(recipes)
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[recipes GET]", error)
    return NextResponse.json({ error: "Could not load recipes." }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const parsed = await parseRecipeBody(req)
    if (!parsed) {
      return NextResponse.json(
        { error: "A name, meal type, and at least one valid ingredient are required." },
        { status: 400 },
      )
    }

    const recipe = await prisma.recipe.create({
      data: {
        name: parsed.name,
        mealType: parsed.mealType,
        imageUrl: parsed.imageUrl,
        ...parsed.totals,
        userId,
        ingredients: { create: ingredientCreateData(parsed.ingredients) },
      },
      include: recipeInclude,
    })
    return NextResponse.json(recipe, { status: 201 })
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[recipes POST]", error)
    return NextResponse.json({ error: "Could not save recipe." }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 })
    const existing = await prisma.recipe.findFirst({ where: { id, userId } })
    if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 })

    const parsed = await parseRecipeBody(req)
    if (!parsed) {
      return NextResponse.json(
        { error: "A name, meal type, and at least one valid ingredient are required." },
        { status: 400 },
      )
    }

    const recipe = await prisma.recipe.update({
      where: { id },
      data: {
        name: parsed.name,
        mealType: parsed.mealType,
        imageUrl: parsed.imageUrl,
        ...parsed.totals,
        ingredients: {
          deleteMany: {},
          create: ingredientCreateData(parsed.ingredients),
        },
      },
      include: recipeInclude,
    })
    return NextResponse.json(recipe)
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[recipes PUT]", error)
    return NextResponse.json({ error: "Could not update recipe." }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 })
    const existing = await prisma.recipe.findFirst({ where: { id, userId } })
    if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 })

    const recipe = await prisma.recipe.update({
      where: { id },
      data: { useCount: { increment: 1 } },
      include: recipeInclude,
    })
    return NextResponse.json(recipe)
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Could not update recipe." }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 })
    const { count } = await prisma.recipe.deleteMany({ where: { id, userId } })
    if (!count) return NextResponse.json({ error: "Not found." }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Could not delete recipe." }, { status: 500 })
  }
}
