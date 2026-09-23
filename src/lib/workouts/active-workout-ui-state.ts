/**
 * Screen state for a live workout that is not part of the saved session
 * (queue position, rest timer, which cells the lifter typed). Stored per
 * session in localStorage so an iOS PWA that gets killed in the background
 * reopens exactly where the lifter left off.
 */
export interface ActiveWorkoutUiState {
  skipped: string[]
  acked: string[]
  pinned: string | null
  restEndsAt: number | null
  restTotalSec: number | null
  touched: string[]
  ghost: string[]
}

const PREFIX = "theGRID_activeWorkoutUi:"

export function activeWorkoutUiKey(sessionId: string): string {
  return `${PREFIX}${sessionId}`
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.length > 0)
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function parseActiveWorkoutUiState(raw: string | null): ActiveWorkoutUiState | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  const input = parsed as Record<string, unknown>
  const restTotalSec = finiteOrNull(input.restTotalSec)
  return {
    skipped: stringList(input.skipped),
    acked: stringList(input.acked),
    pinned: typeof input.pinned === "string" && input.pinned ? input.pinned : null,
    restEndsAt: finiteOrNull(input.restEndsAt),
    restTotalSec: restTotalSec != null && restTotalSec > 0 ? restTotalSec : null,
    touched: stringList(input.touched),
    ghost: stringList(input.ghost),
  }
}

export function loadActiveWorkoutUiState(sessionId: string): ActiveWorkoutUiState | null {
  if (typeof window === "undefined") return null
  try {
    return parseActiveWorkoutUiState(localStorage.getItem(activeWorkoutUiKey(sessionId)))
  } catch {
    return null
  }
}

export function saveActiveWorkoutUiState(sessionId: string, state: ActiveWorkoutUiState): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(activeWorkoutUiKey(sessionId), JSON.stringify(state))
  } catch {
    /* storage full or private mode */
  }
}

export function clearActiveWorkoutUiState(sessionId: string): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(activeWorkoutUiKey(sessionId))
  } catch {
    /* private mode */
  }
}
