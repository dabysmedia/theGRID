"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { cn } from "@/lib/utils"
import {
  PULL_REFRESH_ARC_RADIUS,
  PULL_REFRESH_HOLD_PX,
  areScrollAncestorsAtTop,
  dampenPullDistance,
  isPullRefreshBlockedTarget,
  pullRefreshArcFraction,
  pullRefreshArcLength,
  pullRefreshProgress,
  remainingSpinnerMs,
  shouldArmPullRefresh,
  shouldTriggerPullRefresh,
} from "@/lib/pull-refresh"
import { refreshAppData } from "@/lib/google-health-client-sync"

const ARC_LENGTH = pullRefreshArcLength()

type GestureState = {
  id: number | null
  startX: number
  startY: number
  atTop: boolean
  pulling: boolean
  raw: number
}

function touchById(touches: TouchList, id: number | null): Touch | null {
  if (id == null) return null
  for (let i = 0; i < touches.length; i += 1) {
    const touch = touches.item(i)
    if (touch && touch.identifier === id) return touch
  }
  return null
}

function applyArcFraction(arc: SVGCircleElement | null, fraction: number) {
  if (!arc) return
  arc.setAttribute("stroke-dasharray", `${ARC_LENGTH * fraction} ${ARC_LENGTH}`)
}

export function PullToRefresh({
  children,
  className,
  disabled = false,
}: {
  children: ReactNode
  className?: string
  disabled?: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const arcRef = useRef<SVGCircleElement>(null)
  const hideTimerRef = useRef(0)
  const refreshingRef = useRef(false)
  const gestureRef = useRef<GestureState>({
    id: null,
    startX: 0,
    startY: 0,
    atTop: false,
    pulling: false,
    raw: 0,
  })
  const [refreshing, setRefreshing] = useState(false)

  const applyPull = useCallback((dampenedPx: number, withTransition: boolean) => {
    const content = contentRef.current
    const indicator = indicatorRef.current
    const progress = pullRefreshProgress(dampenedPx)
    const spinning = refreshingRef.current
    if (content) {
      const offset = dampenedPx > 0.5 ? dampenedPx : 0
      content.style.transition = withTransition
        ? "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)"
        : "none"
      content.style.transform = offset > 0 ? `translate3d(0, ${offset}px, 0)` : ""
      content.style.willChange = offset > 0 || spinning ? "transform" : "auto"
    }
    if (indicator) {
      indicator.style.transition = withTransition
        ? "opacity 280ms ease, transform 280ms ease"
        : "none"
      indicator.style.opacity = spinning ? "1" : String(Math.min(1, progress * 1.25))
      indicator.style.transform = spinning
        ? "scale(1)"
        : `scale(${0.62 + progress * 0.38})`
    }
    applyArcFraction(arcRef.current, pullRefreshArcFraction(progress, spinning))
  }, [])

  const resetGesture = useCallback(() => {
    gestureRef.current = {
      id: null,
      startX: 0,
      startY: 0,
      atTop: false,
      pulling: false,
      raw: 0,
    }
  }, [])

  const finishRefresh = useCallback(() => {
    refreshingRef.current = false
    applyPull(0, true)
    window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => {
      setRefreshing(false)
      resetGesture()
    }, 300)
  }, [applyPull, resetGesture])

  useEffect(() => {
    const root = rootRef.current
    if (!root || disabled) return
    let cancelled = false

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current) return
      if (event.touches.length !== 1) {
        resetGesture()
        return
      }
      if (isPullRefreshBlockedTarget(event.target)) return
      const touch = event.touches[0]
      if (!touch) return

      gestureRef.current = {
        id: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        // Snapshot now — iOS retargets event.target after the first move.
        atTop: areScrollAncestorsAtTop(event.target, root),
        pulling: false,
        raw: 0,
      }
    }

    const onTouchMove = (event: TouchEvent) => {
      const gesture = gestureRef.current
      if (gesture.id == null || refreshingRef.current) return
      const touch = touchById(event.touches, gesture.id)
      if (!touch) return

      const deltaX = touch.clientX - gesture.startX
      const deltaY = touch.clientY - gesture.startY

      // Steal the gesture from iOS before it treats a top-of-hub pull as a no-op scroll.
      if (gesture.atTop && deltaY > 2 && deltaY >= Math.abs(deltaX) && event.cancelable) {
        event.preventDefault()
      }

      if (!gesture.pulling) {
        if (
          !shouldArmPullRefresh({
            atTop: gesture.atTop,
            deltaX,
            deltaY,
          })
        ) {
          if (!gesture.atTop || deltaY < 0) resetGesture()
          return
        }
        gesture.pulling = true
      }

      if (event.cancelable) event.preventDefault()
      gesture.raw = Math.max(0, deltaY)
      applyPull(dampenPullDistance(gesture.raw), false)
    }

    const endTouch = (event: TouchEvent) => {
      const gesture = gestureRef.current
      if (gesture.id == null) return
      if (touchById(event.touches, gesture.id)) return

      if (!gesture.pulling || refreshingRef.current) {
        resetGesture()
        return
      }

      const dampened = dampenPullDistance(gesture.raw)
      if (!shouldTriggerPullRefresh(dampened)) {
        applyPull(0, true)
        resetGesture()
        return
      }

      refreshingRef.current = true
      setRefreshing(true)
      applyPull(PULL_REFRESH_HOLD_PX, true)
      resetGesture()

      const startedAt = Date.now()
      void (async () => {
        try {
          await refreshAppData({ source: "pull-refresh" })
          const leftover = remainingSpinnerMs(startedAt)
          if (leftover > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, leftover))
          }
        } finally {
          if (!cancelled) finishRefresh()
        }
      })()
    }

    root.addEventListener("touchstart", onTouchStart, { capture: true, passive: true })
    root.addEventListener("touchmove", onTouchMove, { capture: true, passive: false })
    root.addEventListener("touchend", endTouch, { capture: true })
    root.addEventListener("touchcancel", endTouch, { capture: true })
    return () => {
      cancelled = true
      window.clearTimeout(hideTimerRef.current)
      root.removeEventListener("touchstart", onTouchStart, { capture: true })
      root.removeEventListener("touchmove", onTouchMove, { capture: true })
      root.removeEventListener("touchend", endTouch, { capture: true })
      root.removeEventListener("touchcancel", endTouch, { capture: true })
    }
  }, [applyPull, disabled, finishRefresh, resetGesture])

  useEffect(() => {
    if (disabled && refreshingRef.current) finishRefresh()
  }, [disabled, finishRefresh])

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex min-h-0 flex-1 flex-col overscroll-y-contain",
        className,
      )}
      aria-busy={refreshing}
    >
      <div className="pointer-events-none absolute inset-x-0 top-2.5 z-50 flex justify-center">
        <div
          ref={indicatorRef}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full",
            "border border-white/12 bg-background/80 text-primary shadow-[inset_0_1px_0_0_oklch(1_0_0/10%)] backdrop-blur-md",
            refreshing ? "opacity-100" : "opacity-0",
          )}
          role="status"
          aria-live="polite"
          aria-hidden={!refreshing}
        >
          <div
            className={cn(
              "h-7 w-7",
              refreshing && "animate-spin motion-reduce:animate-none [animation-duration:700ms]",
            )}
          >
            <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden>
              <circle
                cx="14"
                cy="14"
                r={PULL_REFRESH_ARC_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.22"
                strokeWidth="2.35"
              />
              <circle
                ref={arcRef}
                cx="14"
                cy="14"
                r={PULL_REFRESH_ARC_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.35"
                strokeLinecap="round"
                strokeDasharray={`${ARC_LENGTH * pullRefreshArcFraction(refreshing ? 1 : 0, refreshing)} ${ARC_LENGTH}`}
                transform="rotate(-90 14 14)"
              />
            </svg>
          </div>
          <span className="sr-only">
            {refreshing ? "Syncing Google Health" : "Pull to refresh"}
          </span>
        </div>
      </div>
      <div ref={contentRef} className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  )
}
