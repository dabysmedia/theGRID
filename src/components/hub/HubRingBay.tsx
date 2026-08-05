"use client"

import { cn } from "@/lib/utils"
import {
  HUB_SECTION_MOTION_MS,
  useHubMeasuredMorph,
} from "@/components/hub/HubMotion"

export type HubRingId = "calories" | "steps" | "sleep"

const IDLE_LEFT: Record<HubRingId, string> = {
  calories: "left-[16.666%]",
  steps: "left-1/2",
  sleep: "left-[83.333%]",
}

function HubRingItem({
  id,
  node,
  expanded,
}: {
  id: HubRingId
  node: React.ReactNode
  expanded: HubRingId | null
}) {
  const active = expanded != null
  const isActive = expanded === id
  const hide = active && !isActive
  const positionRef = useHubMeasuredMorph<HTMLDivElement>(expanded ?? "overview", {
    durationMs: HUB_SECTION_MOTION_MS,
  })

  return (
    <div
      ref={positionRef}
      data-hub-ring={id}
      className={cn(
        "absolute top-0 will-change-transform",
        active ? "left-1/2" : IDLE_LEFT[id],
        isActive && "z-30",
      )}
      aria-hidden={hide}
    >
      <div
        className={cn(
          "-translate-x-1/2 transition-[opacity,scale] duration-[620ms] ease-[cubic-bezier(0.22,0.7,0.18,1)] motion-reduce:transition-none",
          hide && "pointer-events-none scale-90 opacity-0",
        )}
      >
        {node}
      </div>
    </div>
  )
}

/**
 * Overview ring bay — DO NOT replace with flex + dimming.
 * Active ring slides to center; siblings fade/scale away (~760ms).
 * See `.cursor/rules/hub-expand-motion.mdc`.
 */
export function HubRingBay({
  expanded,
  calories,
  steps,
  sleep,
  className,
}: {
  expanded: HubRingId | null
  calories: React.ReactNode
  steps: React.ReactNode
  sleep: React.ReactNode
  className?: string
}) {
  const active = expanded != null

  return (
    <div
      className={cn(
        "relative px-0.5 py-0.5 sm:px-1 sm:py-1",
        active && "z-20",
        className,
      )}
    >
      <div className="relative z-10 h-[calc(var(--hub-ring-size)+3rem)]">
        {(
          [
            { id: "calories" as const, node: calories },
            { id: "steps" as const, node: steps },
            { id: "sleep" as const, node: sleep },
          ] as const
        ).map(({ id, node }) => (
          <HubRingItem key={id} id={id} node={node} expanded={expanded} />
        ))}
      </div>
    </div>
  )
}
