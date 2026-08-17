"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  PULL_REFRESH_HOLD_PX,
  areScrollAncestorsAtTop,
  dampenPullDistance,
  isPullRefreshBlockedTarget,
  pullRefreshProgress,
  shouldArmPullRefresh,
  shouldTriggerPullRefresh,
} from "@/lib/pull-refresh"
import { refreshAppData } from "@/lib/google-health-client-sync"

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
  const refreshingRef = useRef(false)
  const gestureRef = useRef<GestureState>({
    pointerId: null,
    startX: 0,
    startY: 0,
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
        ? "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)"
        : "none"
      content.style.transform = offset > 0 ? `translate3d(0, ${offset}px, 0)` : ""
      content.style.willChange = offset > 0 || spinning ? "transform" : "auto"
    }
    if (indicator) {
      indicator.style.opacity = spinning
        ? "1"
        : String(Math.min(1, progress * 1.2))
      indicator.style.transform = spinning
        ? "translateX(-50%) scale(1)"
        : `translateX(-50%) scale(${0.55 + progress * 0.45}) rotate(${progress * 180}deg)`
    }
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
    setRefreshing(false)
    applyPull(0, true)
    resetGesture()
  }, [applyPull, resetGesture])

  useEffect(() => {
    const root = rootRef.current
    if (!root || disabled) return

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

      void refreshAppData({ source: "pull-refresh" }).finally(() => {
        window.setTimeout(finishRefresh, 180)
      })
    }

    root.addEventListener("pointerdown", onPointerDown)
    root.addEventListener("pointermove", onPointerMove, { passive: false })
    root.addEventListener("pointerup", onPointerUp)
    root.addEventListener("pointercancel", onPointerUp)
    return () => {
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
      <div
        ref={indicatorRef}
        className="pointer-events-none absolute left-1/2 top-2 z-40 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-background/70 text-primary shadow-[inset_0_1px_0_0_oklch(1_0_0/10%)] backdrop-blur-md"
        style={{ opacity: 0, transform: "translateX(-50%) scale(0.55)" }}
        aria-hidden={!refreshing}
      >
        <RefreshCw
          className={cn(
            "h-4 w-4",
            refreshing && "animate-spin motion-reduce:animate-none",
          )}
          aria-hidden
        />
        <span className="sr-only">{refreshing ? "Refreshing" : "Pull to refresh"}</span>
      </div>
      <div
        ref={contentRef}
        className="flex min-h-0 flex-1 flex-col"
      >
        {children}
      </div>
    </div>
  )
}
