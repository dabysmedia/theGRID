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
  pointerId: number | null
  startX: number
  startY: number
  pulling: boolean
  raw: number
}

function isTouchLikePointer(event: PointerEvent): boolean {
  return event.pointerType === "touch" || event.pointerType === "pen"
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
  const refreshingRef = useRef(false)
  const gestureRef = useRef<GestureState>({
    pointerId: null,
    startX: 0,
    startY: 0,
    pulling: false,
    raw: 0,
  })
  const hideTimerRef = useRef(0)
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
      pointerId: null,
      startX: 0,
      startY: 0,
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

    const onPointerDown = (event: PointerEvent) => {
      if (refreshingRef.current) return
      if (!isTouchLikePointer(event) || event.isPrimary === false) return
      if (isPullRefreshBlockedTarget(event.target)) return

      gestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        pulling: false,
        raw: 0,
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      const gesture = gestureRef.current
      if (gesture.pointerId !== event.pointerId || refreshingRef.current) return

      const deltaX = event.clientX - gesture.startX
      const deltaY = event.clientY - gesture.startY

      if (!gesture.pulling) {
        const atTop = areScrollAncestorsAtTop(event.target, root)
        if (
          !shouldArmPullRefresh({
            atTop,
            deltaX,
            deltaY,
          })
        ) {
          return
        }
        gesture.pulling = true
        root.style.touchAction = "none"
        try {
          root.setPointerCapture(event.pointerId)
        } catch {
          /* capture is optional */
        }
      }

      if (event.cancelable) event.preventDefault()
      gesture.raw = Math.max(0, deltaY)
      applyPull(dampenPullDistance(gesture.raw), false)
    }

    const onPointerUp = (event: PointerEvent) => {
      const gesture = gestureRef.current
      if (gesture.pointerId !== event.pointerId) return

      try {
        if (root.hasPointerCapture(event.pointerId)) {
          root.releasePointerCapture(event.pointerId)
        }
      } catch {
        /* already released */
      }
      root.style.touchAction = ""

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

    root.addEventListener("pointerdown", onPointerDown)
    root.addEventListener("pointermove", onPointerMove, { passive: false })
    root.addEventListener("pointerup", onPointerUp)
    root.addEventListener("pointercancel", onPointerUp)
    return () => {
      cancelled = true
      window.clearTimeout(hideTimerRef.current)
      root.removeEventListener("pointerdown", onPointerDown)
      root.removeEventListener("pointermove", onPointerMove)
      root.removeEventListener("pointerup", onPointerUp)
      root.removeEventListener("pointercancel", onPointerUp)
    }
  }, [applyPull, disabled, finishRefresh, resetGesture])

  useEffect(() => {
    if (disabled && refreshingRef.current) finishRefresh()
  }, [disabled, finishRefresh])

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex min-h-0 flex-1 flex-col overscroll-y-contain touch-pan-y",
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
