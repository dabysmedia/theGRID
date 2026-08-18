"use client"

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react"

export function pointerRatioX(event: ReactPointerEvent<Element>): number {
  const rect = event.currentTarget.getBoundingClientRect()
  if (rect.width <= 0) return 0
  return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
}

type CaptureTarget = Element & {
  setPointerCapture: (pointerId: number) => void
  releasePointerCapture: (pointerId: number) => void
  hasPointerCapture?: (pointerId: number) => boolean
}

/**
 * Horizontal chart scrub.
 * Touch on the plot always scrubs (the SVG uses touch-action: none) so a little
 * vertical drift does not cancel the readout. Page scroll still works outside
 * the plot. Clears when the pointer is lifted or cancelled.
 */
export function useAxisLockedScrub(options: {
  onScrub: (ratio: number) => void
  onClear: () => void
  /** Mouse hover (no buttons) updates the scrub; cleared on leave. Default true. */
  hoverScrub?: boolean
}) {
  const { onScrub, onClear, hoverScrub = true } = options
  const activeIdRef = useRef<number | null>(null)

  const release = useCallback((target: CaptureTarget | null, pointerId: number | null) => {
    if (target && pointerId != null && target.hasPointerCapture?.(pointerId)) {
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        /* already released */
      }
    }
    activeIdRef.current = null
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<Element>) => {
      activeIdRef.current = event.pointerId
      try {
        ;(event.currentTarget as CaptureTarget).setPointerCapture(event.pointerId)
      } catch {
        /* capture unsupported */
      }
      event.preventDefault()
      onScrub(pointerRatioX(event))
    },
    [onScrub],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<Element>) => {
      if (activeIdRef.current === event.pointerId) {
        event.preventDefault()
        onScrub(pointerRatioX(event))
        return
      }
      if (hoverScrub && event.pointerType === "mouse" && event.buttons === 0) {
        onScrub(pointerRatioX(event))
      }
    },
    [hoverScrub, onScrub],
  )

  const endPointer = useCallback(
    (event: ReactPointerEvent<Element>) => {
      const wasActive = activeIdRef.current === event.pointerId
      release(event.currentTarget as CaptureTarget, event.pointerId)
      if (wasActive) onClear()
    },
    [onClear, release],
  )

  const onPointerLeave = useCallback(
    (event: ReactPointerEvent<Element>) => {
      if (event.pointerType === "mouse" && activeIdRef.current == null) {
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
