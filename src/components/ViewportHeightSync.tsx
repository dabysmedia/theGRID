"use client"

import { useEffect } from "react"

/**
 * Keeps `--app-height` equal to the visible viewport.
 *
 * Browser tabs use visualViewport so the shell follows collapsing browser
 * chrome. Installed iOS apps deliberately use 100vh: with viewport-fit=cover,
 * WebKit can report both 100dvh and visualViewport.height too short on a cold
 * launch until scrolling forces a viewport reflow.
 */
function isStandalone() {
  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean(navigatorWithStandalone.standalone)
  )
}

function applyAppHeight() {
  if (isStandalone()) {
    document.documentElement.style.setProperty("--app-height", "100vh")
    return
  }

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
    const displayMode = window.matchMedia("(display-mode: standalone)")
    displayMode.addEventListener("change", applyAppHeight)
    const raf = requestAnimationFrame(applyAppHeight)
    return () => {
      cancelAnimationFrame(raf)
      vv?.removeEventListener("resize", applyAppHeight)
      vv?.removeEventListener("scroll", applyAppHeight)
      window.removeEventListener("resize", applyAppHeight)
      window.removeEventListener("orientationchange", applyAppHeight)
      displayMode.removeEventListener("change", applyAppHeight)
    }
  }, [])

  return null
}
