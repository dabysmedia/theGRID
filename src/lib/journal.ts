export const JOURNAL_CONTENT_MAX = 600
export const JOURNAL_MAX_IMAGES = 5

export interface AttachedStats {
  run?: { distance: number; duration: number; environment: string }
  calories?: { total: number; protein: number }
  steps?: { count: number }
  weight?: { value: number; unit: "lb" | "lbs" | "kg" }
  sleep?: { durationMins: number; quality: number }
  water?: { amountOz: number; goalOz?: number }
  workouts?: { count: number }
  recovery?: { score: number }
  readiness?: { score: number; hrvMs?: number; restingHeartRate?: number }
}

export type JournalPayload = {
  date: string
  content: string
  mood: number | null
  images: string[]
  attachedStats: AttachedStats
}

export class JournalValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "JournalValidationError"
  }
}

function finiteIn(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function normalizeAttachedStats(raw: unknown): AttachedStats {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const input = raw as Record<string, unknown>
  const out: AttachedStats = {}

  if (input.run && typeof input.run === "object") {
    const v = input.run as Record<string, unknown>
    const distance = finiteIn(v.distance, 0, 1000)
    const duration = finiteIn(v.duration, 0, 7 * 24 * 60 * 60)
    if (distance != null && duration != null) {
      out.run = {
        distance,
        duration,
        environment: typeof v.environment === "string" ? v.environment.slice(0, 40) : "",
      }
    }
  }
  if (input.calories && typeof input.calories === "object") {
    const v = input.calories as Record<string, unknown>
    const total = finiteIn(v.total, 0, 50_000)
    const protein = finiteIn(v.protein, 0, 2_000)
    if (total != null && protein != null) out.calories = { total, protein }
  }
  if (input.steps && typeof input.steps === "object") {
    const count = finiteIn((input.steps as Record<string, unknown>).count, 0, 500_000)
    if (count != null) out.steps = { count: Math.round(count) }
  }
  if (input.weight && typeof input.weight === "object") {
    const v = input.weight as Record<string, unknown>
    const value = finiteIn(v.value, 20, 2_000)
    const unit = v.unit === "kg" ? "kg" : v.unit === "lb" || v.unit === "lbs" ? "lb" : null
    if (value != null && unit) out.weight = { value, unit }
  }
  if (input.sleep && typeof input.sleep === "object") {
    const v = input.sleep as Record<string, unknown>
    const durationMins = finiteIn(v.durationMins, 0, 24 * 60)
    const quality = finiteIn(v.quality, 1, 5)
    if (durationMins != null && quality != null) {
      out.sleep = { durationMins: Math.round(durationMins), quality: Math.round(quality) }
    }
  }
  if (input.water && typeof input.water === "object") {
    const v = input.water as Record<string, unknown>
    const amountOz = finiteIn(v.amountOz, 0, 512)
    const goalOz = finiteIn(v.goalOz, 1, 512)
    if (amountOz != null) out.water = { amountOz, ...(goalOz != null ? { goalOz } : {}) }
  }
  if (input.workouts && typeof input.workouts === "object") {
    const count = finiteIn((input.workouts as Record<string, unknown>).count, 0, 20)
    if (count != null) out.workouts = { count: Math.round(count) }
  }
  if (input.recovery && typeof input.recovery === "object") {
    const score = finiteIn((input.recovery as Record<string, unknown>).score, 0, 10)
    if (score != null) out.recovery = { score }
  }
  if (input.readiness && typeof input.readiness === "object") {
    const v = input.readiness as Record<string, unknown>
    const score = finiteIn(v.score, 0, 100)
    const hrvMs = finiteIn(v.hrvMs, 0, 1_000)
    const restingHeartRate = finiteIn(v.restingHeartRate, 20, 300)
    if (score != null) {
      out.readiness = {
        score,
        ...(hrvMs != null ? { hrvMs } : {}),
        ...(restingHeartRate != null ? { restingHeartRate } : {}),
      }
    }
  }

  return out
}

export function normalizeJournalPayload(raw: unknown): JournalPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new JournalValidationError("Invalid post data.")
  }
  const input = raw as Record<string, unknown>
  if (!validDate(input.date)) throw new JournalValidationError("Choose a valid post date.")

  const content = typeof input.content === "string" ? input.content.trim() : ""
  if (content.length > JOURNAL_CONTENT_MAX) {
    throw new JournalValidationError(`Keep the blurb under ${JOURNAL_CONTENT_MAX} characters.`)
  }

  let mood: number | null = null
  if (input.mood != null) {
    if (!Number.isInteger(input.mood) || Number(input.mood) < 1 || Number(input.mood) > 5) {
      throw new JournalValidationError("Mood must be between 1 and 5.")
    }
    mood = Number(input.mood)
  }

  if (!Array.isArray(input.images) || input.images.length > JOURNAL_MAX_IMAGES) {
    throw new JournalValidationError(`Attach no more than ${JOURNAL_MAX_IMAGES} photos.`)
  }
  const images = [...new Set(input.images.filter((value): value is string => typeof value === "string"))]
  if (images.length !== input.images.length || images.some((value) => value.length > 240)) {
    throw new JournalValidationError("One or more photo references are invalid.")
  }

  const attachedStats = normalizeAttachedStats(input.attachedStats)
  if (!content && images.length === 0 && Object.keys(attachedStats).length === 0) {
    throw new JournalValidationError("Add a photo, a short blurb, or at least one metric.")
  }

  return { date: input.date, content, mood, images, attachedStats }
}

export function journalPhotoIdFromUrl(value: string): string | null {
  const match = /^\/uploads\/journal\/([a-z0-9]+)$/i.exec(value)
  return match?.[1] ?? null
}
