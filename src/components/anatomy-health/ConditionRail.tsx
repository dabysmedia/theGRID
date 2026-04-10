"use client"

import type { AnatomyHealthState, BodyRegionId } from "@/lib/anatomy-health/model"
import { cn } from "@/lib/utils"

export interface ConditionRailProps {
  state: AnatomyHealthState
  onPickRegion?: (id: BodyRegionId) => void
  selectedRegionId: BodyRegionId | null
  /** `plain` = strip outer card (embed in shared panel). */
  variant?: "card" | "plain"
  className?: string
}

export function ConditionRail({
  state,
  onPickRegion,
  selectedRegionId,
  variant = "card",
  className,
}: ConditionRailProps) {
  const localized = Object.values(state.regions).filter((r) => r.injuries.length > 0)
  const plain = variant === "plain"

  const inner = (
    <div
      className={cn(
        "space-y-3",
        plain ? "" : "overflow-y-auto flex-1 min-h-0 p-2"
      )}
    >
        <section aria-label="Global conditions">
          <h4 className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground mb-1 px-0.5">
            Global
          </h4>
          {state.globalConditions.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-1">—</p>
          ) : (
            <ul className="space-y-1">
              {state.globalConditions.map((g) => (
                <li
                  key={g.id}
                  className={cn(
                    "rounded-lg border border-border/40 bg-background/15 px-2 py-1.5",
                    !plain && "shadow-sm shadow-black/10"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-foreground leading-tight">{g.title}</span>
                    <span className="text-[9px] uppercase shrink-0 text-muted-foreground">{g.severity}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{g.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Body-local conditions">
          <h4 className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground mb-1 px-0.5">
            Sectors
          </h4>
          {localized.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-1">—</p>
          ) : (
            <ul className="space-y-1">
              {localized.map((r) => {
                const active = selectedRegionId === r.id
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onPickRegion?.(r.id)}
                      className={cn(
                        "w-full text-left rounded-lg border px-2 py-1.5 transition-colors press-scale",
                        active
                          ? "border-primary/35 bg-primary/10"
                          : "border-border/35 bg-background/10 hover:bg-glass-highlight/10"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-foreground">{r.label}</span>
                        <span className="text-[9px] uppercase text-muted-foreground tabular-nums shrink-0">
                          {r.injuries.length}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {r.injuries.map((i) => i.title).join(" · ")}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
    </div>
  )

  if (plain) {
    return (
      <div className={className}>
        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Signals</p>
        {inner}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "glass-subtle hud-corners rounded-2xl overflow-hidden flex flex-col max-h-[min(72vh,520px)]",
        className
      )}
    >
      <div className="shrink-0 border-b border-border/40 px-3 py-2 bg-glass-highlight/5">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Signals
        </p>
      </div>
      {inner}
    </div>
  )
}
