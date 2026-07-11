import { CALORIES_LOG_FOOD_QUERY } from "@/lib/calories-log-deep-link"

/** Query param that opens a hub expand panel on `/`. */
export const HUB_EXPAND_QUERY = "expand" as const

export type HubExpandPanelKey =
  | "calories"
  | "steps"
  | "sleep"
  | "weight"
  | "vitals"
  | "peptides"
  | "workouts"

const HUB_EXPAND_PANELS = new Set<string>([
  "calories",
  "steps",
  "sleep",
  "weight",
  "vitals",
  "peptides",
  "workouts",
])

export function parseHubExpandPanel(
  raw: string | null | undefined,
): HubExpandPanelKey | null {
  const key = raw?.trim().toLowerCase()
  if (!key || !HUB_EXPAND_PANELS.has(key)) return null
  return key as HubExpandPanelKey
}

/** Build a hub URL that opens an expand panel (and optionally the log-food dialog). */
export function hubExpandHref(
  panel: HubExpandPanelKey,
  opts?: { logFood?: boolean },
): string {
  const params = new URLSearchParams()
  params.set(HUB_EXPAND_QUERY, panel)
  if (opts?.logFood) params.set(CALORIES_LOG_FOOD_QUERY, "1")
  return `/?${params.toString()}`
}

export function shouldOpenLogFood(searchParams: {
  get(name: string): string | null
}): boolean {
  const v = searchParams.get(CALORIES_LOG_FOOD_QUERY)?.trim()
  return v === "1" || v === "true"
}
