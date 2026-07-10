"use client"

import { useLayoutEffect, useState } from "react"
import { cn } from "@/lib/utils"

/** Default hub UI morph — short enough to feel snappy, long enough to read. */
export const HUB_MOTION_MS = 300

/** Larger overview section morphs (rings / protocol rail / weigh-in). */
export const HUB_SECTION_MOTION_MS = 420

/**
 * Height + opacity collapse used across hub expand/collapse and accordions.
 * Prefer this over mount/unmount snaps so exit motion can play.
 */
export function HubCollapse({
  open,
  children,
  className,
  durationMs = HUB_MOTION_MS,
}: {
  open: boolean
  children: React.ReactNode
  className?: string
  /** Override transition length (ms). */
  durationMs?: number
}) {
  return (
    <div
      className={cn(
        "grid motion-reduce:transition-none",
        open
          ? "grid-rows-[1fr] opacity-100"
          : "pointer-events-none grid-rows-[0fr] opacity-0",
        className,
      )}
      style={{
        transitionProperty: "grid-template-rows, opacity, margin",
        transitionDuration: `${durationMs}ms`,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

/**
 * Like HubCollapse, but unmounts children after the exit morph so heavy
 * panels (WebGL pips, charts) are not kept alive on the overview.
 */
export function HubPresence({
  open,
  children,
  className,
  durationMs = HUB_MOTION_MS,
}: {
  open: boolean
  children: React.ReactNode
  className?: string
  durationMs?: number
}) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(open)

  useLayoutEffect(() => {
    if (open) {
      setMounted(true)
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
      return () => cancelAnimationFrame(id)
    }
    setVisible(false)
    const t = window.setTimeout(() => setMounted(false), durationMs + 40)
    return () => clearTimeout(t)
  }, [open, durationMs])

  if (!mounted) return null

  return (
    <HubCollapse
      open={visible}
      durationMs={durationMs}
      className={cn("hub-expand-stagger", className)}
    >
      {children}
    </HubCollapse>
  )
}
