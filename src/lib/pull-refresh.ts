/** Distance (px) the finger must pull before a refresh arms. */
export const PULL_REFRESH_THRESHOLD_PX = 52
/** Rubber-banded travel cap so the sheet cannot be dragged off-screen. */
export const PULL_REFRESH_MAX_PX = 120
/** How far content stays offset while the refresh is in flight. */
export const PULL_REFRESH_HOLD_PX = 64
/** Ignore tiny movement until the gesture is clearly vertical. */
export const PULL_REFRESH_AXIS_LOCK_PX = 6
/** iOS rubber-bands the document by a few pixels even when the hub is locked. */
export const PULL_REFRESH_AT_TOP_EPSILON_PX = 24
/** Trailing days fetched on a pull — enough for last night's sleep + today's steps. */
export const PULL_REFRESH_SYNC_DAYS = 3
/** Keep the loading circle on screen long enough to read as a spinner, even if sync is instant. */
export const PULL_REFRESH_MIN_SPINNER_MS = 480
/** SVG spinner radius used for stroke-dasharray. */
export const PULL_REFRESH_ARC_RADIUS = 10

const SCROLLABLE_OVERFLOW = new Set(["auto", "scroll", "overlay"])

export function pullRefreshArcLength(radius = PULL_REFRESH_ARC_RADIUS): number {
  return 2 * Math.PI * radius
}

/** Fraction of the circle drawn: grows with the pull, then a tail while spinning. */
export function pullRefreshArcFraction(progress: number, spinning: boolean): number {
  if (spinning) return 0.28
  if (!Number.isFinite(progress) || progress <= 0) return 0.08
  return Math.max(0.08, Math.min(1, progress))
}

export function remainingSpinnerMs(
  startedAt: number,
  minMs = PULL_REFRESH_MIN_SPINNER_MS,
  now = Date.now(),
): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(minMs) || !Number.isFinite(now)) return 0
  return Math.max(0, minMs - (now - startedAt))
}

export function dampenPullDistance(
  rawPx: number,
  maxPx = PULL_REFRESH_MAX_PX,
): number {
  if (!Number.isFinite(rawPx) || rawPx <= 0) return 0
  const dampened = rawPx * (1 - rawPx / (rawPx + 220))
  return Math.min(maxPx, dampened)
}

export function pullRefreshProgress(
  dampenedPx: number,
  thresholdPx = PULL_REFRESH_THRESHOLD_PX,
): number {
  if (!Number.isFinite(dampenedPx) || dampenedPx <= 0) return 0
  if (!Number.isFinite(thresholdPx) || thresholdPx <= 0) return 1
  return Math.max(0, Math.min(1, dampenedPx / thresholdPx))
}

export function shouldTriggerPullRefresh(
  dampenedPx: number,
  thresholdPx = PULL_REFRESH_THRESHOLD_PX,
): boolean {
  return Number.isFinite(dampenedPx) && dampenedPx >= thresholdPx
}

/**
 * Arm only for a downward vertical pull that starts at the top of the scroller.
 * Horizontal swipes and mid-list scrolls stay with the page.
 */
export function shouldArmPullRefresh(input: {
  atTop: boolean
  deltaX: number
  deltaY: number
  axisLockPx?: number
}): boolean {
  if (!input.atTop) return false
  if (!Number.isFinite(input.deltaX) || !Number.isFinite(input.deltaY)) return false
  if (input.deltaY <= 0) return false
  const axisLock = input.axisLockPx ?? PULL_REFRESH_AXIS_LOCK_PX
  if (input.deltaY < axisLock && Math.abs(input.deltaX) < axisLock) return false
  return input.deltaY >= Math.abs(input.deltaX)
}

export function isPullRefreshBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(
      "[data-no-pull-refresh], [role='dialog'], [role='alertdialog'], [data-slot='dialog-overlay'], [aria-modal='true']",
    ),
  )
}

export function isScrollOffsetAtTop(
  offset: number,
  epsilon = PULL_REFRESH_AT_TOP_EPSILON_PX,
): boolean {
  return Number.isFinite(offset) && offset <= epsilon
}

export function isDocumentVerticallyAtTop(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return true
  const scrolling = document.scrollingElement
  const offset = Math.max(
    scrolling?.scrollTop ?? 0,
    window.scrollY || 0,
    window.pageYOffset || 0,
  )
  return isScrollOffsetAtTop(offset)
}

function elementCanScrollY(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (typeof window === "undefined") return false
  const style = window.getComputedStyle(el)
  if (!SCROLLABLE_OVERFLOW.has(style.overflowY)) return false
  return el.scrollHeight - el.clientHeight > 1
}

function isVerticallyAtTop(el: Element): boolean {
  return el instanceof HTMLElement ? isScrollOffsetAtTop(el.scrollTop) : true
}

/** True when the page and every overflow-y scroller between the touch and root are at top. */
export function areScrollAncestorsAtTop(
  target: EventTarget | null,
  root: Element | null,
): boolean {
  if (!isDocumentVerticallyAtTop()) return false
  if (!root) return false

  let node: Node | null =
    target instanceof Element ? target : target instanceof Node ? target.parentNode : root
  if (!node) node = root

  while (node) {
    if (node instanceof Element && elementCanScrollY(node) && !isVerticallyAtTop(node)) {
      return false
    }
    if (node === root) break
    node = node.parentNode
  }
  return true
}
