/**
 * Food is logged into three time blocks rather than named meals.
 *
 * The timeline shows Morning / Afternoon / Evening for the whole day, always,
 * so an empty block is still a place to tap. `CalorieEntry.mealSlot` stores the
 * block; `mealType` keeps receiving a breakfast/lunch/dinner equivalent so the
 * agent export, coach context, and notification evaluators keep reading what
 * they always have.
 *
 * Pure and isomorphic — the API route, the timeline, and the composer all
 * resolve slots the same way.
 */

export const MEAL_SLOTS = ["morning", "afternoon", "evening"] as const

export type MealSlot = (typeof MEAL_SLOTS)[number]

const MEAL_SLOT_SET = new Set<string>(MEAL_SLOTS)

/**
 * Local hour a block opens. Evening runs past midnight — anything from 17:00
 * through 03:59 is still "evening", so a 1am snack lands on the night it
 * belongs to rather than opening the next morning.
 */
export const MEAL_SLOT_START_HOUR: Record<MealSlot, number> = {
  morning: 4,
  afternoon: 12,
  evening: 17,
}

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
}

/** Short clock range shown beside the block heading. */
export const MEAL_SLOT_RANGE_LABEL: Record<MealSlot, string> = {
  morning: "4a – 12p",
  afternoon: "12p – 5p",
  evening: "5p – 4a",
}

/** Sunrise → midday → dusk, staying inside the hub's warm/steel calorie family. */
export const MEAL_SLOT_ACCENT: Record<MealSlot, string> = {
  morning: "#f59e0b",
  afternoon: "#38bdf8",
  evening: "#f87171",
}

/** Legacy meal name written to `mealType` so older readers keep working. */
export const LEGACY_MEAL_TYPE_FOR_SLOT: Record<MealSlot, string> = {
  morning: "breakfast",
  afternoon: "lunch",
  evening: "dinner",
}

/** Named meals that map onto a block without ambiguity. */
const SLOT_FOR_LEGACY_MEAL_TYPE: Record<string, MealSlot> = {
  breakfast: "morning",
  brunch: "morning",
  lunch: "afternoon",
  dinner: "evening",
  supper: "evening",
}

export function isMealSlot(value: unknown): value is MealSlot {
  return typeof value === "string" && MEAL_SLOT_SET.has(value.trim().toLowerCase())
}

export function asMealSlot(value: unknown): MealSlot | null {
  if (typeof value !== "string") return null
  const key = value.trim().toLowerCase()
  return MEAL_SLOT_SET.has(key) ? (key as MealSlot) : null
}

/** Which block a local hour (0-23) falls in. */
export function slotForHour(hour: number): MealSlot {
  const h = Number.isFinite(hour) ? Math.floor(hour) : 0
  if (h >= MEAL_SLOT_START_HOUR.evening || h < MEAL_SLOT_START_HOUR.morning) return "evening"
  if (h >= MEAL_SLOT_START_HOUR.afternoon) return "afternoon"
  return "morning"
}

/** Local hour of `date`, in `timeZone` when given, otherwise the runtime's zone. */
export function localHourIn(date: Date, timeZone?: string | null): number {
  if (!timeZone) return date.getHours()
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).format(date)
    const hour = Number(formatted)
    return Number.isFinite(hour) ? hour % 24 : date.getHours()
  } catch {
    return date.getHours()
  }
}

/** The block the user is living in right now — the default target for a quick add. */
export function currentMealSlot(now: Date = new Date(), timeZone?: string | null): MealSlot {
  return slotForHour(localHourIn(now, timeZone))
}

export type MealSlotSource = {
  /** Set on everything logged since the timeline shipped. */
  mealSlot?: string | null
  /** Legacy breakfast/lunch/dinner/snack. */
  mealType?: string | null
  /** When the row was written — the only clue a legacy snack leaves behind. */
  createdAt?: Date | string | null
}

/**
 * Best block for a row.
 *
 * Rows written by the timeline carry `mealSlot` and answer directly. Older rows
 * fall back to their meal name, and a legacy `snack` — which could have been
 * eaten at any hour — is placed by the clock time it was logged at.
 */
export function resolveMealSlot(row: MealSlotSource, timeZone?: string | null): MealSlot {
  const explicit = asMealSlot(row.mealSlot)
  if (explicit) return explicit

  const legacy = row.mealType?.trim().toLowerCase() ?? ""
  const mapped = SLOT_FOR_LEGACY_MEAL_TYPE[legacy]
  if (mapped) return mapped

  if (row.createdAt != null) {
    const created = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)
    if (!Number.isNaN(created.getTime())) {
      return slotForHour(localHourIn(created, timeZone))
    }
  }

  return "afternoon"
}

/**
 * Legacy meal tags a block should match when filtering saved meals and recipes,
 * which are still tagged breakfast/lunch/dinner/snack. Snacks belong to every
 * block — they are eaten at all hours.
 */
export function legacyMealTagsForSlot(slot: MealSlot): string[] {
  return [LEGACY_MEAL_TYPE_FOR_SLOT[slot], "snack"]
}

/** Order two slots by where they fall in the day. */
export function compareMealSlots(a: MealSlot, b: MealSlot): number {
  return MEAL_SLOTS.indexOf(a) - MEAL_SLOTS.indexOf(b)
}
