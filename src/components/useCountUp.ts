"use client"

import { useEffect, useState } from "react"

type CountUpOptions = {
  durationMs?: number
  enabled?: boolean
}

/** Smooth numeric interpolation with a reduced-motion fallback. */
export function useCountUp(
  value: number | null,
  { durationMs = 1000, enabled = true }: CountUpOptions = {},
) {
  const [displayValue, setDisplayValue] = useState<number | null>(() =>
    value == null ? null : 0,
  )

  useEffect(() => {
    let frame = 0
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches

    if (value == null || !enabled || reduceMotion) {
      frame = requestAnimationFrame(() => setDisplayValue(value))
      return () => cancelAnimationFrame(frame)
    }

    const startedAt = performance.now()
    const minimumFrameMs = coarsePointer ? 1000 / 30 : 1000 / 60
    let lastCommitAt = startedAt - minimumFrameMs
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs)
      const eased = 1 - Math.pow(1 - progress, 3)
      if (progress >= 1) {
        setDisplayValue(value)
        return
      }
      if (now - lastCommitAt >= minimumFrameMs) {
        lastCommitAt = now
        setDisplayValue(value * eased)
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [durationMs, enabled, value])

  return displayValue
}
