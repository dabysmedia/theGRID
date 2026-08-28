import "server-only"

import { localTimeParts } from "@/lib/notifications/server/local-time"
import { AGENT_RANGE_PRESETS, isDayKey } from "@/lib/agent/range-presets"

export { AGENT_RANGE_PRESETS, isDayKey, isAgentRangeSlug } from "@/lib/agent/range-presets"
export type { AgentRangePreset } from "@/lib/agent/range-presets"

/** Far enough back to cover any real history while keeping string compares valid. */
const ALL_TIME_START = "1970-01-01"

/** A resolved crawl window: inclusive calendar-day keys in the profile timezone. */
export interface AgentRange {
  /** URL slug, e.g. "today", "7d", "2026-01-01..2026-01-31". */
  key: string
  /** Human/LLM label used as the narrative section heading. */
  label: string
  from: string
  to: string
  /** Inclusive day count, or null for "all" (unbounded start). */
  days: number | null
}

export function shiftDayKey(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const x = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0) + days * 86_400_000)
  const yy = x.getUTCFullYear()
  const mm = String(x.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(x.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

/** Monday of the ISO week containing `todayKey`, in the profile's timezone. */
export function weekStartKey(todayKey: string, timeZone: string): string {
  const [y, m, d] = todayKey.split("-").map(Number)
  const anchor = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0))
  const { weekday } = localTimeParts(anchor, timeZone)
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1
  return shiftDayKey(todayKey, -daysSinceMonday)
}

function monthStartKey(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`
}


function inclusiveDays(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`)
  const b = Date.parse(`${to}T12:00:00Z`)
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1)
}

function rolling(key: string, label: string, todayKey: string, days: number): AgentRange {
  return { key, label, from: shiftDayKey(todayKey, -(days - 1)), to: todayKey, days }
}

/**
 * Resolves a preset slug (or an explicit `from..to` / `from` pair) into a
 * concrete day-key window. Returns null when the slug is not recognised.
 */
export function resolveAgentRange(
  slug: string | null | undefined,
  todayKey: string,
  timeZone: string
): AgentRange | null {
  const raw = (slug ?? "").trim().toLowerCase()
  if (!raw) return null

  switch (raw) {
    case "today":
      return { key: "today", label: "TODAY", from: todayKey, to: todayKey, days: 1 }
    case "yesterday": {
      const y = shiftDayKey(todayKey, -1)
      return { key: "yesterday", label: "YESTERDAY", from: y, to: y, days: 1 }
    }
    case "week": {
      const from = weekStartKey(todayKey, timeZone)
      return { key: "week", label: "THIS WEEK", from, to: todayKey, days: inclusiveDays(from, todayKey) }
    }
    case "last-week": {
      const thisMonday = weekStartKey(todayKey, timeZone)
      const from = shiftDayKey(thisMonday, -7)
      const to = shiftDayKey(thisMonday, -1)
      return { key: "last-week", label: "LAST WEEK", from, to, days: 7 }
    }
    case "month": {
      const from = monthStartKey(todayKey)
      return { key: "month", label: "THIS MONTH", from, to: todayKey, days: inclusiveDays(from, todayKey) }
    }
    case "last-month": {
      const to = shiftDayKey(monthStartKey(todayKey), -1)
      const from = monthStartKey(to)
      return { key: "last-month", label: "LAST MONTH", from, to, days: inclusiveDays(from, to) }
    }
    case "ytd": {
      const from = `${todayKey.slice(0, 4)}-01-01`
      return { key: "ytd", label: "YEAR TO DATE", from, to: todayKey, days: inclusiveDays(from, todayKey) }
    }
    case "all":
      return { key: "all", label: "ALL TIME", from: ALL_TIME_START, to: todayKey, days: null }
  }

  // Rolling windows: 7d, 14d, 30d, 90d, 180d, 365d, … capped at 5 years.
  const rollingMatch = /^(\d{1,4})d$/.exec(raw)
  if (rollingMatch) {
    const n = Number(rollingMatch[1])
    if (n >= 1 && n <= 1825) {
      const preset = AGENT_RANGE_PRESETS.find((p) => p.key === raw)
      return rolling(raw, preset?.label ?? `LAST ${n} DAYS`, todayKey, n)
    }
    return null
  }

  // Explicit windows: "2026-01-01..2026-01-31" or a single "2026-01-15".
  const [fromRaw, toRaw] = raw.split("..")
  if (isDayKey(fromRaw)) {
    const to = isDayKey(toRaw) ? toRaw : fromRaw
    if (to < fromRaw) return null
    return {
      key: toRaw ? `${fromRaw}..${to}` : fromRaw,
      label: fromRaw === to ? `DAY ${fromRaw}` : `${fromRaw} → ${to}`,
      from: fromRaw,
      to,
      days: inclusiveDays(fromRaw, to),
    }
  }

  return null
}

/**
 * Range from `?range=` / `?from=` / `?to=` query params, defaulting to today.
 * Explicit from/to wins over a preset slug.
 */
export function resolveAgentRangeFromParams(
  params: URLSearchParams,
  todayKey: string,
  timeZone: string
): AgentRange | null {
  const from = params.get("from")?.trim()
  const to = params.get("to")?.trim()
  if (isDayKey(from)) {
    return resolveAgentRange(isDayKey(to) ? `${from}..${to}` : from, todayKey, timeZone)
  }
  const slug = params.get("range")?.trim() || params.get("period")?.trim()
  if (!slug) return resolveAgentRange("today", todayKey, timeZone)
  return resolveAgentRange(slug, todayKey, timeZone)
}

/** Heart-rate samples are ~288 rows/day — only inline them for short windows. */
export const HR_SAMPLE_MAX_DAYS = 8

export function shouldIncludeHeartRateSamples(range: AgentRange): boolean {
  return range.days != null && range.days <= HR_SAMPLE_MAX_DAYS
}
