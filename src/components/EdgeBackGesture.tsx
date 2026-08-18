"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { isPullRefreshBlockedTarget } from "@/lib/pull-refresh"
import {
  isEdgeBackStart,
  performEdgeBack,
  resolveEdgeBackTarget,
  shouldArmEdgeBack,
  shouldTriggerEdgeBack,
} from "@/lib/edge-back"

type GestureState = {
  id: number | null
  startX: number
  startY: number
  startAt: number
  fromEdge: boolean
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

function readSafeInsetLeft(): number {
  if (typeof document === "undefined") return 0
  const pad = Number.parseFloat(getComputedStyle(document.body).paddingLeft)
  return Number.isFinite(pad) ? pad : 0
}

export function EdgeBackGesture({
  children,
  className,
  disabled = false,
}: {
  children: ReactNode
  className?: string
  disabled?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const committingRef = useRef(false)
  const historyRef = useRef<string[]>([pathname])
  const pathnameRef = useRef(pathname)
  const gestureRef = useRef<GestureState>({
    id: null,
    startX: 0,
    startY: 0,
    startAt: 0,
    fromEdge: false,
    pulling: false,
    raw: 0,
  })

  useEffect(() => {
    const stack = historyRef.current
    if (stack[stack.length - 1] !== pathname) {
      if (stack.length >= 2 && stack[stack.length - 2] === pathname) {
        stack.pop()
      } else {
        stack.push(pathname)
      }
    }
    pathnameRef.current = pathname
    const sheet = sheetRef.current
    if (sheet) {
      sheet.style.transition = "none"
      sheet.style.transform = ""
      sheet.style.boxShadow = ""
    }
    committingRef.current = false
  }, [pathname])

  useEffect(() => {
    if (disabled) return
    const root = rootRef.current
    const sheet = sheetRef.current
    if (!root || !sheet) return

    const resetGesture = () => {
      gestureRef.current = {
        id: null,
        startX: 0,
        startY: 0,
        startAt: 0,
        fromEdge: false,
        pulling: false,
        raw: 0,
      }
    }

    let commitTimer = 0
    let fallbackTimer = 0

    const applyTravel = (px: number, withTransition: boolean) => {
      const width = window.innerWidth || 1
      const travel = Math.max(0, Math.min(width, px))
      sheet.style.transition = withTransition
        ? "transform 280ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 280ms ease"
        : "none"
      sheet.style.transform = travel > 0.5 ? `translate3d(${travel}px, 0, 0)` : ""
      sheet.style.boxShadow =
        travel > 8 ? "-16px 0 32px oklch(0 0 0 / 28%)" : ""
    }

    const onTouchStart = (event: TouchEvent) => {
      if (committingRef.current || event.touches.length !== 1) return
      if (isPullRefreshBlockedTarget(event.target)) return
      const touch = event.touches[0]
      if (!touch) return
      const fromEdge = isEdgeBackStart(touch.clientX, readSafeInsetLeft())
      if (!fromEdge) return
      if (!resolveEdgeBackTarget(pathnameRef.current)) return

      gestureRef.current = {
        id: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        startAt: Date.now(),
        fromEdge: true,
        pulling: false,
        raw: 0,
      }
    }

    const onTouchMove = (event: TouchEvent) => {
      const gesture = gestureRef.current
      if (gesture.id == null || committingRef.current) return
      const touch = touchById(event.touches, gesture.id)
      if (!touch) return

      const deltaX = touch.clientX - gesture.startX
      const deltaY = touch.clientY - gesture.startY

      if (!gesture.pulling) {
        if (
          !shouldArmEdgeBack({
            fromEdge: gesture.fromEdge,
            deltaX,
            deltaY,
          })
        ) {
          if (!gesture.fromEdge || deltaX < 0 || Math.abs(deltaY) > deltaX) {
            resetGesture()
          }
          return
        }
        gesture.pulling = true
      }

      if (event.cancelable) event.preventDefault()
      event.stopImmediatePropagation()
      gesture.raw = Math.max(0, deltaX)
      applyTravel(gesture.raw, false)
    }

    const endTouch = (event: TouchEvent) => {
      const gesture = gestureRef.current
      if (gesture.id == null) return
      if (touchById(event.touches, gesture.id)) return

      if (!gesture.pulling) {
        resetGesture()
        return
      }

      const durationMs = Date.now() - gesture.startAt
      const commit = shouldTriggerEdgeBack({
        travelPx: gesture.raw,
        widthPx: window.innerWidth,
        durationMs,
      })
      resetGesture()

      if (!commit) {
        applyTravel(0, true)
        return
      }

      const target = resolveEdgeBackTarget(pathnameRef.current)
      if (!target) {
        applyTravel(0, true)
        return
      }

      committingRef.current = true
      if (target === "hub") {
        performEdgeBack(pathnameRef.current, router, historyRef.current.length)
        applyTravel(0, true)
        commitTimer = window.setTimeout(() => {
          committingRef.current = false
        }, 300)
        return
      }

      const fromPath = pathnameRef.current
      applyTravel(window.innerWidth, true)
      commitTimer = window.setTimeout(() => {
        performEdgeBack(fromPath, router, historyRef.current.length)
      }, 240)
      fallbackTimer = window.setTimeout(() => {
        if (!committingRef.current) return
        if (pathnameRef.current !== fromPath) return
        applyTravel(0, true)
        committingRef.current = false
      }, 700)
    }

    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true })
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: false })
    document.addEventListener("touchend", endTouch, { capture: true })
    document.addEventListener("touchcancel", endTouch, { capture: true })
    return () => {
      window.clearTimeout(commitTimer)
      window.clearTimeout(fallbackTimer)
      document.removeEventListener("touchstart", onTouchStart, { capture: true })
      document.removeEventListener("touchmove", onTouchMove, { capture: true })
      document.removeEventListener("touchend", endTouch, { capture: true })
      document.removeEventListener("touchcancel", endTouch, { capture: true })
    }
  }, [disabled, router])

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex min-h-0 flex-1 flex-col overflow-x-hidden overscroll-x-none",
        className,
      )}
    >
      <div
        ref={sheetRef}
        className="flex min-h-0 flex-1 flex-col will-change-transform"
      >
        {children}
      </div>
    </div>
  )
}
