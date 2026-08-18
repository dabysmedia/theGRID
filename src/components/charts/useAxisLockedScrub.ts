"use client"

import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { cn } from "@/lib/utils"

export function pointerRatioX(clientX: number, rect: DOMRect): number {
  if (rect.width <= 0) return 0
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
}

type CaptureTarget = Element & {
  setPointerCapture: (pointerId: number) => void
  releasePointerCapture: (pointerId: number) => void
  hasPointerCapture?: (pointerId: number) => boolean
}

type ScrubHandlers = {
  onPointerDown: (event: ReactPointerEvent<Element>) => void
  onPointerMove: (event: ReactPointerEvent<Element>) => void
  onPointerUp: (event: ReactPointerEvent<Element>) => void
  onPointerCancel: (event: ReactPointerEvent<Element>) => void
  onPointerLeave: (event: ReactPointerEvent<Element>) => void
}

/**
 * Horizontal chart scrub. Touch on the plot always scrubs.
 * The hit target uses touch-action: none so a little vertical drift cannot
 * steal the gesture. Pointer-cancel (browser treating it as a pan) keeps the
 * last readout instead of wiping it. Page scroll still works outside the plot.
 */
export function useAxisLockedScrub(options: {
  onScrub: (ratio: number) => void
  onClear: () => void
  /** Mouse hover (no buttons) updates the scrub; cleared on leave. Default true. */
  hoverScrub?: boolean
}): ScrubHandlers {
  const { onScrub, onClear, hoverScrub = true } = options
  const activeIdRef = useRef<number | null>(null)
  const rectRef = useRef<DOMRect | null>(null)

  const ratioFrom = useCallback((event: ReactPointerEvent<Element>) => {
    const rect = rectRef.current ?? event.currentTarget.getBoundingClientRect()
    return pointerRatioX(event.clientX, rect)
  }, [])

  const release = useCallback((target: CaptureTarget | null, pointerId: number | null) => {
    if (target && pointerId != null && target.hasPointerCapture?.(pointerId)) {
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        /* already released */
      }
    }
    activeIdRef.current = null
    rectRef.current = null
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<Element>) => {
      activeIdRef.current = event.pointerId
      rectRef.current = event.currentTarget.getBoundingClientRect()
      try {
        ;(event.currentTarget as CaptureTarget).setPointerCapture(event.pointerId)
      } catch {
        /* capture unsupported */
      }
      event.preventDefault()
      onScrub(ratioFrom(event))
    },
    [onScrub, ratioFrom],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<Element>) => {
      if (activeIdRef.current === event.pointerId) {
        event.preventDefault()
        onScrub(ratioFrom(event))
        return
      }
      if (hoverScrub && event.pointerType === "mouse" && event.buttons === 0) {
        onScrub(ratioFrom(event))
      }
    },
    [hoverScrub, onScrub, ratioFrom],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<Element>) => {
      const wasActive = activeIdRef.current === event.pointerId
      release(event.currentTarget as CaptureTarget, event.pointerId)
      if (wasActive) onClear()
    },
    [onClear, release],
  )

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<Element>) => {
      // Keep the last sample on screen — a vertical pan must not wipe the readout.
      release(event.currentTarget as CaptureTarget, event.pointerId)
    },
    [release],
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
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
  }
}

/** Hit target around a plot. Children should be pointer-events-none. */
export function ChartScrubHit({
  handlers,
  className,
  children,
}: {
  handlers: ScrubHandlers
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn("chart-scrub-hit relative touch-none select-none", className)}
      style={{ touchAction: "none" }}
      {...handlers}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </div>
  )
}
