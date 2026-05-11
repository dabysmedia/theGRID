import "server-only"

/**
 * Helpers for converting between a UTC Date and a user's local wall-clock time
 * using only stdlib `Intl` — no extra dependency required for IANA tz support.
 */

/** Returns "yyyy-MM-dd" in the given IANA timezone. */
export function localDayKey(date: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const parts = fmt.formatToParts(date)
  const y = parts.find((p) => p.type === "year")?.value ?? "1970"
  const m = parts.find((p) => p.type === "month")?.value ?? "01"
  const d = parts.find((p) => p.type === "day")?.value ?? "01"
  return `${y}-${m}-${d}`
}

export interface LocalTimeParts {
  hour: number
  minute: number
  /** 0 = Sunday … 6 = Saturday in the local timezone */
  weekday: number
  /** Total minutes since local midnight */
  minutesFromMidnight: number
  /** "yyyy-MM-dd" local date */
  dayKey: string
}

/** Returns wall-clock fields in the given IANA timezone. */
export function localTimeParts(date: Date, timeZone: string): LocalTimeParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  })
  const parts = fmt.formatToParts(date)
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "1970")
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1")
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "1")
  // "2-digit" hour in en-US returns "24" at midnight on Node — normalise to 0.
  const hourRaw = Number(parts.find((p) => p.type === "hour")?.value ?? "0")
  const hour = hourRaw === 24 ? 0 : hourRaw
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0")
  const weekdayShort = parts.find((p) => p.type === "weekday")?.value ?? "Sun"
  const weekday =
    { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekdayShort] ?? 0
  return {
    hour,
    minute,
    weekday,
    minutesFromMidnight: hour * 60 + minute,
    dayKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  }
}

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || typeof tz !== "string") return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * Converts a yyyy-MM-dd local day key + minutes-from-midnight into a UTC Date.
 * Implemented via binary-style search using Intl so we don't pull in date-fns-tz.
 */
export function localTimeToUtc(
  dayKey: string,
  minutesFromMidnight: number,
  timeZone: string
): Date {
  const targetH = Math.floor(minutesFromMidnight / 60)
  const targetM = minutesFromMidnight % 60
  // Start by guessing UTC == local, then refine using the actual offset twice
  // (handles DST + most ambiguous moments). Two passes is enough for civil time.
  const [y, m, d] = dayKey.split("-").map(Number)
  let guess = Date.UTC(y, m - 1, d, targetH, targetM, 0)
  for (let i = 0; i < 2; i++) {
    const parts = localTimeParts(new Date(guess), timeZone)
    const local = Date.UTC(
      Number(parts.dayKey.slice(0, 4)),
      Number(parts.dayKey.slice(5, 7)) - 1,
      Number(parts.dayKey.slice(8, 10)),
      parts.hour,
      parts.minute,
      0
    )
    const drift =
      local -
      Date.UTC(y, m - 1, d, targetH, targetM, 0)
    guess -= drift
  }
  return new Date(guess)
}
