/**
 * Steps day = local 07:00 → next local 07:00.
 * Early-morning steps (before 7am) belong to the previous day's total
 * (the day the user was still "up").
 *
 * Stored StepEntry.date uses the steps-day key as UTC noon (same as other
 * calendar-day fields) — e.g. Mon 7am–Tue 7am → "YYYY-MM-DD" for Monday.
 *
 * Pure helpers (no server-only) so hub/client and sync can share one definition.
 */

/** Local hour when a new steps day begins. */
export const STEPS_DAY_BOUNDARY_HOUR = 7
/** @deprecated use STEPS_DAY_BOUNDARY_HOUR */
export const STEPS_DAY_START_HOUR = STEPS_DAY_BOUNDARY_HOUR

export const DEFAULT_STEPS_TIMEZONE = "America/New_York"

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/** Add (possibly negative) whole days to a YYYY-MM-DD key. */
export function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`
}

/** Alias used by sync/dashboard (same as {@link addDaysToYmd}). */
export const addDaysYmd = addDaysToYmd

export function isValidStepsTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || typeof tz !== "string") return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Best-effort IANA zone: explicit → Intl → Eastern default. */
export function resolveStepsTimezone(timeZone?: string | null): string {
  if (isValidStepsTimeZone(timeZone)) return timeZone
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (isValidStepsTimeZone(detected)) return detected
  } catch {
    /* ignore */
  }
  return DEFAULT_STEPS_TIMEZONE
}

interface LocalParts {
  hour: number
  minute: number
  dayKey: string
}

function localParts(date: Date, timeZone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  const parts = fmt.formatToParts(date)
  const year = parts.find((p) => p.type === "year")?.value ?? "1970"
  const month = parts.find((p) => p.type === "month")?.value ?? "01"
  const day = parts.find((p) => p.type === "day")?.value ?? "01"
  const hourRaw = Number(parts.find((p) => p.type === "hour")?.value ?? "0")
  const hour = hourRaw === 24 ? 0 : hourRaw
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0")
  return {
    hour,
    minute,
    dayKey: `${year}-${month}-${day}`,
  }
}

/** Calendar YYYY-MM-DD in an IANA timezone. */
export function localCalendarDayKey(date: Date, timeZone?: string | null): string {
  return localParts(date, resolveStepsTimezone(timeZone)).dayKey
}

/**
 * Converts a yyyy-MM-dd local day + minutes-from-midnight into a UTC Date
 * (same approach as notifications/server/local-time).
 */
export function localTimeToUtc(
  dayKey: string,
  minutesFromMidnight: number,
  timeZone: string,
): Date {
  const targetH = Math.floor(minutesFromMidnight / 60)
  const targetM = minutesFromMidnight % 60
  const [y, m, d] = dayKey.split("-").map(Number)
  let guess = Date.UTC(y, m - 1, d, targetH, targetM, 0)
  for (let i = 0; i < 2; i++) {
    const parts = localParts(new Date(guess), timeZone)
    const local = Date.UTC(
      Number(parts.dayKey.slice(0, 4)),
      Number(parts.dayKey.slice(5, 7)) - 1,
      Number(parts.dayKey.slice(8, 10)),
      parts.hour,
      parts.minute,
      0,
    )
    const drift = local - Date.UTC(y, m - 1, d, targetH, targetM, 0)
    guess -= drift
  }
  return new Date(guess)
}

/**
 * Steps-day key (YYYY-MM-DD) for an instant.
 * Before local 07:00, returns the previous calendar date.
 */
export function stepsDayKey(date: Date = new Date(), timeZone?: string | null): string {
  const tz = resolveStepsTimezone(timeZone)
  const parts = localParts(date, tz)
  if (parts.hour < STEPS_DAY_BOUNDARY_HOUR) {
    return addDaysToYmd(parts.dayKey, -1)
  }
  return parts.dayKey
}

export type StepsDayRange = {
  /** Steps-day key this range represents */
  dayKey: string
  /** Inclusive start: local 07:00 on dayKey */
  start: Date
  /** Exclusive end: local 07:00 on the next calendar day */
  end: Date
}

/** Physical-time half-open range [07:00, next 07:00) for a steps-day key. */
export function getStepsDayRange(dayKey: string, timeZone?: string | null): StepsDayRange {
  const tz = resolveStepsTimezone(timeZone)
  const start = localTimeToUtc(dayKey, STEPS_DAY_BOUNDARY_HOUR * 60, tz)
  const end = localTimeToUtc(addDaysToYmd(dayKey, 1), STEPS_DAY_BOUNDARY_HOUR * 60, tz)
  return { dayKey, start, end }
}

/**
 * When browsing the calendar "today", map to the active steps day.
 * Historical dates are treated as steps-day keys as-is.
 */
export function stepsRefDayKey(
  calendarDayKey: string,
  now: Date = new Date(),
  timeZone?: string | null,
): string {
  const tz = resolveStepsTimezone(timeZone)
  if (calendarDayKey === localCalendarDayKey(now, tz)) {
    return stepsDayKey(now, tz)
  }
  return calendarDayKey
}

/** Last `count` steps-day keys ending at `endDayKey` (inclusive), oldest → newest. */
export function stepsDayKeysEndingAt(endDayKey: string, count: number): string[] {
  const n = Math.max(1, count)
  return Array.from({ length: n }, (_, i) => addDaysToYmd(endDayKey, -(n - 1 - i)))
}

/**
 * Sum step samples into steps-day buckets using each sample's start time
 * (hourly rollups: 06:00–07:00 starts at 6 → previous steps day).
 */
export function bucketStepsByStepsDay(
  samples: Array<{ startTime: Date | string; count: number; endTime?: Date | string }>,
  timeZone?: string | null,
): Map<string, number> {
  const tz = resolveStepsTimezone(timeZone)
  const out = new Map<string, number>()
  for (const sample of samples) {
    const count = Number(sample.count)
    if (!Number.isFinite(count) || count <= 0) continue
    const t = typeof sample.startTime === "string" ? new Date(sample.startTime) : sample.startTime
    if (Number.isNaN(t.getTime())) continue
    const key = stepsDayKey(t, tz)
    out.set(key, (out.get(key) ?? 0) + Math.round(count))
  }
  return out
}
