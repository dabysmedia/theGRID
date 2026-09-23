import { parseYyyyMmDdToStoredDate } from "@/lib/dateStorage"
import {
  LEGACY_MEAL_TYPE_FOR_SLOT,
  currentMealSlot,
  type MealSlot,
} from "@/lib/calories/meal-slots"
import { isFoodMeasurementUnit, type FoodMeasurementUnit } from "@/lib/calories/measurements"
import { addDaysToYmd } from "@/lib/steps-day"

export class ActError extends Error {
  status: number
  users?: { id: string; name: string }[]

  constructor(
    message: string,
    status = 400,
    users?: { id: string; name: string }[],
  ) {
    super(message)
    this.name = "ActError"
    this.status = status
    this.users = users
  }
}

export interface ActOp {
  op: string
  args: Record<string, unknown>
}

const ALIASES: Record<string, string> = {
  "foods.search": "food.search",
  search: "food.search",
  "meal.add": "log.add",
  "calories.add": "log.add",
  "log.import": "log.add",
  "meal.move": "log.move",
  "meal.del": "log.del",
  "meal.delete": "log.del",
  "log.delete": "log.del",
  "foods.save": "foods.add",
  "foods.create": "foods.add",
  "food.add": "foods.add",
  "foods.delete": "foods.del",
  "food.del": "foods.del",
  "food.delete": "foods.del",
  "recipe.add": "recipes.add",
  "recipe.update": "recipes.update",
  "recipe.del": "recipes.del",
  "recipe.delete": "recipes.del",
  "recipe.log": "recipes.log",
  "recipes.delete": "recipes.del",
  "workout.delete": "workout.del",
  "workouts.add": "workout.add",
  "workouts.update": "workout.update",
  "workouts.del": "workout.del",
  "workouts.list": "workout.list",
  "workouts.move": "workout.move",
  "water.log": "water.add",
  "water.delete": "water.del",
  "weight.add": "weight.set",
  "weight.delete": "weight.del",
  "steps.add": "steps.set",
  "steps.delete": "steps.del",
  "sleep.add": "sleep.set",
  "sleep.delete": "sleep.del",
  "run.delete": "run.del",
  "cardio.delete": "cardio.del",
  "alcohol.delete": "alcohol.del",
  "bowel.delete": "bowel.del",
  "journal.delete": "journal.del",
  "habit.done": "habits.done",
  "habit.add": "habits.add",
  "habit.del": "habits.del",
  "habits.delete": "habits.del",
  "peptide.delete": "peptide.del",
  catalog: "help",
  docs: "help",
}

const NO_USER = new Set(["help", "users", "food.search"])

const ENVELOPE = new Set(["user", "profile", "userid", "op", "cmd", "ops"])

export function canonicalOp(op: string): string {
  const key = op.trim().toLowerCase()
  return ALIASES[key] ?? key
}

export function opsNeedUser(ops: ActOp[]): boolean {
  return ops.some((item) => !NO_USER.has(item.op))
}

export function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function pick(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value == null || value === "") continue
    out[key] = value
  }
  return out
}

export function idsOf(args: Record<string, unknown>): string[] {
  const single = str(args.id)
  const many = Array.isArray(args.ids) ? args.ids.map((id) => str(id)).filter(Boolean) : []
  return [...new Set([...(single ? [single] : []), ...many])]
}

export function requireIds(args: Record<string, unknown>): string[] {
  const ids = idsOf(args)
  if (ids.length === 0) throw new ActError("id is required.")
  if (ids.length > 50) throw new ActError("At most 50 ids per op.")
  return ids
}

export function resolveDayKey(value: unknown, today: string): string {
  const raw = str(value).toLowerCase()
  if (!raw || raw === "today") return today
  if (raw === "yesterday") return addDaysToYmd(today, -1)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new ActError("date must be YYYY-MM-DD, today, or yesterday.")
  }
  try {
    parseYyyyMmDdToStoredDate(raw)
  } catch {
    throw new ActError("date must be YYYY-MM-DD, today, or yesterday.")
  }
  return raw
}

const SLOT_ALIASES: Record<string, { mealSlot: MealSlot; mealType: string }> = {
  morning: { mealSlot: "morning", mealType: "breakfast" },
  breakfast: { mealSlot: "morning", mealType: "breakfast" },
  afternoon: { mealSlot: "afternoon", mealType: "lunch" },
  lunch: { mealSlot: "afternoon", mealType: "lunch" },
  evening: { mealSlot: "evening", mealType: "dinner" },
  dinner: { mealSlot: "evening", mealType: "dinner" },
  supper: { mealSlot: "evening", mealType: "dinner" },
  snack: { mealSlot: "evening", mealType: "snack" },
}

export function resolveLogSlot(
  value: unknown,
  now: Date,
  timeZone: string | null,
): { mealSlot: MealSlot; mealType: string } {
  const raw = str(value).toLowerCase()
  if (!raw) {
    const mealSlot = currentMealSlot(now, timeZone)
    return { mealSlot, mealType: LEGACY_MEAL_TYPE_FOR_SLOT[mealSlot] }
  }
  const hit = SLOT_ALIASES[raw]
  if (!hit) {
    throw new ActError("slot must be morning, afternoon, evening, breakfast, lunch, dinner, or snack.")
  }
  return hit
}

export function foodUnit(value: unknown, fallback: FoodMeasurementUnit): FoodMeasurementUnit {
  if (value == null || value === "") return fallback
  const raw = str(value).toLowerCase()
  const mapped =
    raw === "gram" || raw === "grams" ? "g"
    : raw === "ounce" || raw === "ounces" ? "oz"
    : raw === "servings" ? "serving"
    : raw === "pieces" ? "piece"
    : raw
  if (!isFoodMeasurementUnit(mapped)) {
    throw new ActError("unit must be serving, g, oz, or piece.")
  }
  return mapped
}

export function scaleMacros(
  base: { kcal: number; p: number | null; c: number | null; f: number | null },
  factor: number,
): { kcal: number; p: number | null; c: number | null; f: number | null } {
  const round1 = (value: number) => Math.round(value * factor * 10) / 10
  return {
    kcal: Math.max(0, Math.round(base.kcal * factor)),
    p: base.p == null ? null : round1(base.p),
    c: base.c == null ? null : round1(base.c),
    f: base.f == null ? null : round1(base.f),
  }
}

export function scalePortion(amount: number | null, factor: number): number | null {
  if (amount == null) return null
  return Math.round(amount * factor * 100) / 100
}

function argsFrom(obj: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (ENVELOPE.has(key.toLowerCase())) continue
    args[key] = value
  }
  return args
}

function stringArg(op: string, value: string): Record<string, unknown> {
  if (op === "food.search") return { q: value }
  if (op.endsWith(".del")) return { id: value }
  if (op === "day" || op === "log.list" || op === "workout.list") return { date: value }
  if (op === "users" || op === "help" || op === "habits.list") return {}
  return { name: value }
}

function parseOne(item: unknown, index: number): ActOp {
  if (Array.isArray(item)) {
    const op = canonicalOp(str(item[0]))
    if (!op) throw new ActError(`ops[${index}] is missing an op name.`)
    const second = item[1]
    if (second == null) return { op, args: {} }
    if (typeof second === "string") return { op, args: stringArg(op, second) }
    if (typeof second === "object" && !Array.isArray(second)) {
      return { op, args: second as Record<string, unknown> }
    }
    throw new ActError(`ops[${index}] must be {"op":"..."} or ["op", { ... }].`)
  }
  if (item && typeof item === "object") {
    const obj = item as Record<string, unknown>
    const op = canonicalOp(str(obj.op ?? obj.cmd))
    if (!op) throw new ActError(`ops[${index}] is missing op.`)
    return { op, args: argsFrom(obj) }
  }
  throw new ActError(`ops[${index}] is not an object.`)
}

export function parseActRequest(body: unknown): { user: string | null; ops: ActOp[] } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ActError('Body must be a JSON object, e.g. {"user":"Carlos","op":"day"}.')
  }
  const root = body as Record<string, unknown>
  const user = str(root.user ?? root.profile ?? root.userId) || null
  let ops: ActOp[]
  if (root.ops == null) {
    const op = canonicalOp(str(root.op ?? root.cmd))
    if (!op) {
      throw new ActError('Missing op. Example: {"user":"Carlos","op":"day"}. GET /api/agent/act lists ops.')
    }
    ops = [{ op, args: argsFrom(root) }]
  } else if (!Array.isArray(root.ops)) {
    throw new ActError("ops must be an array.")
  } else {
    ops = root.ops.map((item, index) => parseOne(item, index))
  }
  if (ops.length === 0) throw new ActError("ops is empty.")
  if (ops.length > 30) throw new ActError("Send at most 30 ops per request.")
  const searches = ops.filter((item) => item.op === "food.search").length
  if (searches > 5) throw new ActError("At most 5 food.search ops per request.")
  return { user, ops }
}
