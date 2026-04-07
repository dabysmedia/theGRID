/**
 * Calendar dates (YYYY-MM-DD) stored as Prisma DateTime must not use local/UTC midnight
 * alone — that shifts the calendar day when serialized (e.g. US users see “yesterday”).
 * Store as UTC noon on that calendar day; group/compare with UTC date parts.
 */

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseYyyyMmDdToStoredDate(dateStr: string): Date {
  const m = YMD.exec(dateStr.trim())
  if (!m) throw new Error("Invalid date")
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) throw new Error("Invalid date")
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0))
}

/** Inclusive UTC range for one calendar day (works with UTC-noon–stored rows). */
export function utcRangeWhereForCalendarDay(dateStr: string): { gte: Date; lte: Date } {
  const m = YMD.exec(dateStr.trim())
  if (!m) throw new Error("Invalid date")
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  return {
    gte: new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0)),
    lte: new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999)),
  }
}

/** Inclusive UTC range from first calendar day through last (YYYY-MM-DD, first ≤ last). */
export function utcCalendarDayRangeInclusive(
  firstYmd: string,
  lastYmd: string
): { gte: Date; lte: Date } {
  const r1 = utcRangeWhereForCalendarDay(firstYmd)
  const r2 = utcRangeWhereForCalendarDay(lastYmd)
  return { gte: r1.gte, lte: r2.lte }
}

/** YYYY-MM-DD from a DB/ISO date (use for grouping & comparing to activeDate). */
export function utcCalendarDayKeyFromIso(iso: string | Date): string {
  const x = typeof iso === "string" ? new Date(iso) : iso
  if (Number.isNaN(x.getTime())) return ""
  const y = x.getUTCFullYear()
  const m = String(x.getUTCMonth() + 1).padStart(2, "0")
  const d = String(x.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
