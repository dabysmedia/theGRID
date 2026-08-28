export interface AgentRangePreset {
  key: string
  label: string
  /** One-line description surfaced in llms.txt and the range index. */
  description: string
}

/**
 * Crawlable presets, in the order they are listed to agents. Every key here
 * resolves without query parameters so a crawler can walk them as plain links.
 */
export const AGENT_RANGE_PRESETS: readonly AgentRangePreset[] = [
  { key: "today", label: "TODAY", description: "Everything logged so far today." },
  { key: "yesterday", label: "YESTERDAY", description: "The previous full day." },
  { key: "7d", label: "LAST 7 DAYS", description: "Rolling 7-day window ending today." },
  { key: "week", label: "THIS WEEK", description: "Current ISO week (Monday → today)." },
  { key: "last-week", label: "LAST WEEK", description: "The previous full Monday→Sunday week." },
  { key: "14d", label: "LAST 14 DAYS", description: "Rolling 14-day window ending today." },
  { key: "30d", label: "LAST 30 DAYS", description: "Rolling 30-day window ending today." },
  { key: "month", label: "THIS MONTH", description: "Calendar month to date." },
  { key: "last-month", label: "LAST MONTH", description: "The previous full calendar month." },
  { key: "90d", label: "LAST 90 DAYS", description: "Rolling 90-day window ending today." },
  { key: "180d", label: "LAST 180 DAYS", description: "Rolling 180-day window ending today." },
  { key: "365d", label: "LAST 365 DAYS", description: "Rolling 365-day window ending today." },
  { key: "ytd", label: "YEAR TO DATE", description: "January 1 of the current year → today." },
  { key: "all", label: "ALL TIME", description: "Every record ever logged." },
] as const

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export function isDayKey(value: string | null | undefined): value is string {
  return typeof value === "string" && DAY_KEY_RE.test(value) && !Number.isNaN(Date.parse(value))
}

/**
 * Syntactic check only — does this slug look like a window we serve? Used by
 * middleware to bounce junk URLs before rendering, so crawlers never see a
 * soft-404. Resolving the actual dates still happens server-side.
 */
export function isAgentRangeSlug(slug: string | null | undefined): boolean {
  const raw = (slug ?? "").trim().toLowerCase()
  if (!raw) return false
  if (AGENT_RANGE_PRESETS.some((p) => p.key === raw)) return true

  const rollingMatch = /^(\d{1,4})d$/.exec(raw)
  if (rollingMatch) {
    const n = Number(rollingMatch[1])
    return n >= 1 && n <= 1825
  }

  const [from, to] = raw.split("..")
  if (!isDayKey(from)) return false
  if (to === undefined) return true
  return isDayKey(to) && to >= from
}
