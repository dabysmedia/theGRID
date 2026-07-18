"use client"

import { useEffect } from "react"

/**
 * Keeps `--app-height` equal to the visible viewport.
 *
 * Mobile browsers often leave `100dvh` / percentage-height chains stale until
 * a scroll reflow; binding to visualViewport forces the shell to always fill
 * the space the user can actually see (and grow when the URL bar collapses).
 */
function applyAppHeight() {
  const height = Math.round(window.visualViewport?.height ?? window.innerHeight)
  if (!Number.isFinite(height) || height <= 0) return
  document.documentElement.style.setProperty("--app-height", `${height}px`)
}

export function ViewportHeightSync() {
  useEffect(() => {
    applyAppHeight()
    const vv = window.visualViewport
    vv?.addEventListener("resize", applyAppHeight)
    vv?.addEventListener("scroll", applyAppHeight)
    window.addEventListener("resize", applyAppHeight)
    window.addEventListener("orientationchange", applyAppHeight)
    const raf = requestAnimationFrame(applyAppHeight)
    return () => {
      cancelAnimationFrame(raf)
      vv?.removeEventListener("resize", applyAppHeight)
      vv?.removeEventListener("scroll", applyAppHeight)
      window.removeEventListener("resize", applyAppHeight)
      window.removeEventListener("orientationchange", applyAppHeight)
    }
  }, [])

  return null
}
