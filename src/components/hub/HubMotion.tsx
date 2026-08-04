"use client"

import { cn } from "@/lib/utils"

/** Shared scene duration: deliberate enough to read without feeling delayed. */
export const HUB_MOTION_MS = 860

/** Larger detail sequence, including its staggered child groups. */
export const HUB_SECTION_MOTION_MS = 980

/** Premium curve shared with the trigger-origin dialogs. */
export const HUB_MOTION_EASING = "cubic-bezier(0.22, 0.7, 0.18, 1)"

/**
 * Height + opacity collapse retained for small nested accordions. Overview scene
 * changes use stable mounts and compositor motion instead.
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
      data-hub-collapse=""
      className={cn(
        "grid motion-reduce:transition-none",
        open
          ? "grid-rows-[1fr] opacity-100"
          : "pointer-events-none grid-rows-[0fr] opacity-0",
        className,
      )}
      style={{
        transitionProperty: "grid-template-rows, opacity, margin",
        transitionDuration: `var(--hub-collapse-duration, ${durationMs}ms)`,
        transitionTimingFunction: HUB_MOTION_EASING,
      }}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

/** Scene-local presence; WeeklyHero owns the shared entrance choreography. */
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
  if (!open) return null

  return (
    <div
      data-hub-scene-part=""
      className={className}
      style={{ "--hub-part-duration": `${durationMs}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
