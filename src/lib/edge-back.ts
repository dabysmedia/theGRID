import { HUB_RESET_OVERVIEW_EVENT } from "@/lib/hub-tile-prefs"

/** How close to the screen's left edge a swipe must start. */
export const EDGE_BACK_ZONE_PX = 28
/** Extra room after iOS landscape safe-area inset. */
export const EDGE_BACK_ZONE_PAD_PX = 16
/** Ignore jitter until the swipe is clearly horizontal. */
export const EDGE_BACK_AXIS_LOCK_PX = 8
/** Finger travel that commits a back even on a narrow screen. */
export const EDGE_BACK_THRESHOLD_PX = 72
/** Finger travel as a fraction of viewport width (Safari-like). */
export const EDGE_BACK_THRESHOLD_RATIO = 0.28
/** Fast flick: commit with less travel. */
export const EDGE_BACK_FLICK_PX = 36
export const EDGE_BACK_FLICK_MS = 240

let hubPanelOpen = false

export function setHubPanelOpen(open: boolean): void {
  hubPanelOpen = open
}

export function isHubPanelOpen(): boolean {
  return hubPanelOpen
}

export function edgeBackZonePx(safeInsetLeft = 0): number {
  return EDGE_BACK_ZONE_PX + Math.max(0, Number.isFinite(safeInsetLeft) ? safeInsetLeft : 0)
}

/** Left-edge start, including the phone's safe-area inset. */
export function isEdgeBackStart(clientX: number, safeInsetLeft = 0): boolean {
  if (!Number.isFinite(clientX) || clientX < 0) return false
  return clientX <= edgeBackZonePx(safeInsetLeft)
}

export function shouldArmEdgeBack(input: {
  fromEdge: boolean
  deltaX: number
  deltaY: number
  axisLockPx?: number
}): boolean {
  if (!input.fromEdge) return false
  if (!Number.isFinite(input.deltaX) || !Number.isFinite(input.deltaY)) return false
  if (input.deltaX <= 0) return false
  const axisLock = input.axisLockPx ?? EDGE_BACK_AXIS_LOCK_PX
  if (input.deltaX < axisLock && Math.abs(input.deltaY) < axisLock) return false
  return input.deltaX >= Math.abs(input.deltaY)
}

export function shouldTriggerEdgeBack(input: {
  travelPx: number
  widthPx: number
  durationMs: number
  thresholdPx?: number
  ratio?: number
}): boolean {
  if (!Number.isFinite(input.travelPx) || input.travelPx <= 0) return false
  const threshold = input.thresholdPx ?? EDGE_BACK_THRESHOLD_PX
  const ratio = input.ratio ?? EDGE_BACK_THRESHOLD_RATIO
  if (input.travelPx >= threshold) return true
  if (Number.isFinite(input.widthPx) && input.widthPx > 0 && input.travelPx >= input.widthPx * ratio) {
    return true
  }
  return (
    Number.isFinite(input.durationMs) &&
    input.durationMs > 0 &&
    input.durationMs <= EDGE_BACK_FLICK_MS &&
    input.travelPx >= EDGE_BACK_FLICK_PX
  )
}

export type EdgeBackTarget = "hub" | "history" | null

export function resolveEdgeBackTarget(
  pathname: string,
  panelOpen = isHubPanelOpen(),
): EdgeBackTarget {
  if (pathname === "/") return panelOpen ? "hub" : null
  return "history"
}

export function performEdgeBack(
  pathname: string,
  router: { back: () => void; push: (href: string) => void },
  historyDepth = 1,
): EdgeBackTarget {
  const target = resolveEdgeBackTarget(pathname)
  if (target === "hub") {
    window.dispatchEvent(new CustomEvent(HUB_RESET_OVERVIEW_EVENT))
    return target
  }
  if (target === "history") {
    if (historyDepth > 1) router.back()
    else router.push("/")
    return target
  }
  return null
}
