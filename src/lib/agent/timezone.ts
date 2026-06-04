import "server-only"

import { isValidTimeZone, localDayKey } from "@/lib/notifications/server/local-time"
import { utcCalendarDayKeyFromIso } from "@/lib/dateStorage"

/** Fallback when profile has no IANA zone (UTC makes "today" wrong for US evenings). */
const DEFAULT_AGENT_TIMEZONE = "America/New_York"

/**
 * IANA timezone for agent exports — matches the app wall clock when possible.
 * Order: profile → AGENT_TIMEZONE env → US Eastern default.
 */
export function resolveAgentTimezone(profileTz: string | null | undefined): string {
  if (isValidTimeZone(profileTz)) return profileTz
  const env = process.env.AGENT_TIMEZONE?.trim()
  if (isValidTimeZone(env)) return env!
  return DEFAULT_AGENT_TIMEZONE
}

/** Calendar day the user considers "right now" in their timezone. */
export function agentTodayKey(now: Date, profileTz: string | null | undefined): string {
  return localDayKey(now, resolveAgentTimezone(profileTz))
}

/**
 * Calendar day key for a stored DB date (UTC-noon calendar storage — see dateStorage.ts).
 * Use this when filtering rows against today/week/month bounds.
 */
export function storedEntryDayKey(date: Date): string {
  return utcCalendarDayKeyFromIso(date)
}
