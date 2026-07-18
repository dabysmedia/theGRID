"use client"

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react"

/** Pixels of movement before locking to scrub (horizontal) vs page scroll (vertical). */
const AXIS_LOCK_PX = 10

export function pointerRatioX(event: ReactPointerEvent<Element>): number {
  const rect = event.currentTarget.getBoundingClientRect()
  if (rect.width <= 0) return 0
  return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
}

type ScrubMode = "idle" | "pending" | "scrub" | "scroll"

type CaptureTarget = Element & {
  setPointerCapture: (pointerId: number) => void
  releasePointerCapture: (pointerId: number) => void
  hasPointerCapture?: (pointerId: number) => boolean
}

/**
 * Chart scrub that prefers horizontal motion.
 * Vertical-dominant gestures are left alone so the page can scroll.
 * Clears the scrub value when the pointer is lifted / cancelled.
 */
export function useAxisLockedScrub(options: {
  onScrub: (ratio: number) => void
  onClear: () => void
  /** Mouse hover (no buttons) updates the scrub; cleared on leave. Default true. */
  hoverScrub?: boolean
}) {
  const { onScrub, onClear, hoverScrub = true } = options
  const modeRef = useRef<ScrubMode>("idle")
  const originRef = useRef<{ x: number; y: number; id: number } | null>(null)

  const release = useCallback((target: CaptureTarget | null, pointerId: number | null) => {
    if (target && pointerId != null && target.hasPointerCapture?.(pointerId)) {
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        /* already released */
      }
    }
    modeRef.current = "idle"
    originRef.current = null
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<Element>) => {
      originRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
      if (event.pointerType === "mouse") {
        modeRef.current = "scrub"
        ;(event.currentTarget as CaptureTarget).setPointerCapture(event.pointerId)
        onScrub(pointerRatioX(event))
        return
      }
      // Touch/pen: wait for axis lock. Do not preventDefault — vertical pan must work.
      modeRef.current = "pending"
    },
    [onScrub],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<Element>) => {
      if (modeRef.current === "scroll") return

      if (modeRef.current === "idle") {
        if (hoverScrub && event.pointerType === "mouse" && event.buttons === 0) {
          onScrub(pointerRatioX(event))
        }
        return
      }

      if (modeRef.current === "pending" && originRef.current?.id === event.pointerId) {
        const dx = event.clientX - originRef.current.x
        const dy = event.clientY - originRef.current.y
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
        if (Math.abs(dx) >= Math.abs(dy)) {
          modeRef.current = "scrub"
          ;(event.currentTarget as CaptureTarget).setPointerCapture(event.pointerId)
          event.preventDefault()
          onScrub(pointerRatioX(event))
        } else {
          modeRef.current = "scroll"
          originRef.current = null
          onClear()
        }
        return
      }

      if (modeRef.current === "scrub") {
        event.preventDefault()
        onScrub(pointerRatioX(event))
      }
    },
    [hoverScrub, onClear, onScrub],
  )

  const endPointer = useCallback(
    (event: ReactPointerEvent<Element>) => {
      const wasScrubbing = modeRef.current === "scrub" || modeRef.current === "pending"
      release(event.currentTarget as CaptureTarget, event.pointerId)
      if (wasScrubbing) onClear()
    },
    [onClear, release],
  )

  const onPointerLeave = useCallback(
    (event: ReactPointerEvent<Element>) => {
      if (event.pointerType === "mouse" && modeRef.current !== "scrub") {
        onClear()
      }
    },
    [onClear],
  )

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endPointer,
    onPointerCancel: endPointer,
    onPointerLeave,
  }
}
