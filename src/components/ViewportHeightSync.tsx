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
function isStandalone(displayMode: MediaQueryList) {
  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean
  }

  return (
    displayMode.matches ||
    Boolean(navigatorWithStandalone.standalone)
  )
}

export function ViewportHeightSync() {
  useEffect(() => {
    const vv = window.visualViewport
    const displayMode = window.matchMedia("(display-mode: standalone)")
    let frame = 0
    let lastHeight = ""

    const applyAppHeight = () => {
      frame = 0
      const standalone = isStandalone(displayMode)
      const measuredHeight = Math.round(vv?.height ?? window.innerHeight)
      if (!standalone && (!Number.isFinite(measuredHeight) || measuredHeight <= 0)) return
      const nextHeight = standalone ? "100vh" : `${measuredHeight}px`

      if (nextHeight === lastHeight) return
      lastHeight = nextHeight
      document.documentElement.style.setProperty("--app-height", nextHeight)
    }

    // visualViewport scroll/resize can fire many times per frame while browser
    // chrome moves. Coalesce reads and avoid rewriting a root layout variable
    // unless the rounded viewport height actually changed.
    const scheduleAppHeight = () => {
      if (frame) return
      frame = requestAnimationFrame(applyAppHeight)
    }

    applyAppHeight()
    vv?.addEventListener("resize", scheduleAppHeight, { passive: true })
    vv?.addEventListener("scroll", scheduleAppHeight, { passive: true })
    window.addEventListener("resize", scheduleAppHeight, { passive: true })
    window.addEventListener("orientationchange", scheduleAppHeight, { passive: true })
    displayMode.addEventListener("change", scheduleAppHeight)
    scheduleAppHeight()
    return () => {
      cancelAnimationFrame(frame)
      vv?.removeEventListener("resize", scheduleAppHeight)
      vv?.removeEventListener("scroll", scheduleAppHeight)
      window.removeEventListener("resize", scheduleAppHeight)
      window.removeEventListener("orientationchange", scheduleAppHeight)
      displayMode.removeEventListener("change", scheduleAppHeight)
    }
  }, [])

  return null
}
