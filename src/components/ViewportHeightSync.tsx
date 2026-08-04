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

function isIosDevice() {
  return (
    /iPad|iPhone|iPod/.test(window.navigator.platform) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1)
  )
}

export function ViewportHeightSync() {
  useEffect(() => {
    const vv = window.visualViewport
    const displayMode = window.matchMedia("(display-mode: standalone)")
    const standalone = isStandalone(displayMode)
    const root = document.documentElement
    let frame = 0
    let lastHeight = ""

    const applyAppHeight = () => {
      frame = 0
      const currentStandalone = isStandalone(displayMode)
      root.toggleAttribute(
        "data-ios-standalone",
        currentStandalone && isIosDevice(),
      )

      // The standalone stylesheet already owns the stable 100vh value. Avoid
      // writing a root layout variable or sampling visualViewport during a PWA
      // animation; iOS can dispatch transient viewport events on a cold launch.
      if (currentStandalone) {
        lastHeight = "standalone"
        if (root.style.getPropertyValue("--app-height")) {
          root.style.removeProperty("--app-height")
        }
        return
      }

      const measuredHeight = Math.round(vv?.height ?? window.innerHeight)
      if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) return
      const nextHeight = `${measuredHeight}px`

      if (nextHeight === lastHeight) return
      lastHeight = nextHeight
      root.style.setProperty("--app-height", nextHeight)
    }

    // visualViewport scroll/resize can fire many times per frame while browser
    // chrome moves. Coalesce reads and avoid rewriting a root layout variable
    // unless the rounded viewport height actually changed.
    const scheduleAppHeight = () => {
      if (frame) return
      frame = requestAnimationFrame(applyAppHeight)
    }

    applyAppHeight()
    if (!standalone) {
      vv?.addEventListener("resize", scheduleAppHeight, { passive: true })
      vv?.addEventListener("scroll", scheduleAppHeight, { passive: true })
      window.addEventListener("resize", scheduleAppHeight, { passive: true })
    }
    window.addEventListener("orientationchange", scheduleAppHeight, { passive: true })
    displayMode.addEventListener("change", scheduleAppHeight)
    scheduleAppHeight()
    return () => {
      cancelAnimationFrame(frame)
      if (!standalone) {
        vv?.removeEventListener("resize", scheduleAppHeight)
        vv?.removeEventListener("scroll", scheduleAppHeight)
        window.removeEventListener("resize", scheduleAppHeight)
      }
      window.removeEventListener("orientationchange", scheduleAppHeight)
      displayMode.removeEventListener("change", scheduleAppHeight)
      root.removeAttribute("data-ios-standalone")
    }
  }, [])

  return null
}
