/** Distance (px) the finger must pull before a refresh arms. */
export const PULL_REFRESH_THRESHOLD_PX = 64
/** Rubber-banded travel cap so the sheet cannot be dragged off-screen. */
export const PULL_REFRESH_MAX_PX = 112
/** How far content stays offset while the refresh is in flight. */
export const PULL_REFRESH_HOLD_PX = 52
/** Ignore tiny movement until the gesture is clearly vertical. */
export const PULL_REFRESH_AXIS_LOCK_PX = 10
/** Trailing days fetched on a pull — enough for last night's sleep + today's steps. */
export const PULL_REFRESH_SYNC_DAYS = 3

const SCROLLABLE_OVERFLOW = new Set(["auto", "scroll", "overlay"])

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

export function isDocumentVerticallyAtTop(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return true
  const scrolling = document.scrollingElement
  if (scrolling && scrolling.scrollTop > 1) return false
  return window.scrollY <= 1
}

function elementCanScrollY(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (typeof window === "undefined") return false
  const style = window.getComputedStyle(el)
  if (!SCROLLABLE_OVERFLOW.has(style.overflowY)) return false
  return el.scrollHeight - el.clientHeight > 1
}

function isVerticallyAtTop(el: Element): boolean {
  return el instanceof HTMLElement ? el.scrollTop <= 1 : true
}

/** True when the page and every overflow-y scroller between the touch and root are at top. */
export function areScrollAncestorsAtTop(
  target: EventTarget | null,
  root: Element | null,
): boolean {
  if (!isDocumentVerticallyAtTop()) return false
  if (!(target instanceof Node) || !root) return false

  let node: Node | null = target instanceof Element ? target : target.parentNode
  while (node) {
    if (node instanceof Element && elementCanScrollY(node) && !isVerticallyAtTop(node)) {
      return false
    }
    if (node === root) break
    node = node.parentNode
  }
  return true
}
