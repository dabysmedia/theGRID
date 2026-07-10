"use client"

import { useEffect, useState } from "react"

/**
 * Rapid count-up from 0 → target. Restarts whenever `target` changes.
 * Returns null while target is null/invalid.
 */
export function useCountUp(
  target: number | null,
  {
    duration = 520,
    decimals = 0,
  }: { duration?: number; decimals?: number } = {},
): string | null {
  const [value, setValue] = useState<number | null>(null)

  useEffect(() => {
    if (target == null || !Number.isFinite(target)) {
      setValue(null)
      return
    }

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduceMotion) {
      setValue(target)
      return
    }

    setValue(0)
    const startedAt = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 2.4)
      setValue(target * eased)
      if (progress < 1) {
        frame = requestAnimationFrame(tick)
      } else {
        setValue(target)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])

  if (value == null) return null
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value))
}
