"use client"

import type { BodyRegionId, BodyRegionState } from "@/lib/anatomy-health/model"
import { cn } from "@/lib/utils"

export interface RegionInspectorProps {
  regionId: BodyRegionId | null
  region: BodyRegionState | null
  /** When set, inspector highlights a specific muscle / joint from the SVG. */
  segmentTitle?: string | null
  /** `plain` = no outer card; for embedding in a shared panel. */
  variant?: "card" | "plain"
  className?: string
}

export function RegionInspector({
  regionId,
  region,
  segmentTitle,
  variant = "card",
  className,
}: RegionInspectorProps) {
  const plain = variant === "plain"

  if (!regionId || !region) {
    return (
      <div
        className={cn(
          plain
            ? "py-1"
            : "glass-subtle hud-corners rounded-2xl p-4 min-h-[160px] relative overflow-hidden flex flex-col justify-center",
          className
        )}
      >
        {!plain && (
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <span className="status-dot" style={{ width: 4, height: 4 }} />
            Selection
          </p>
        )}
        <p className={cn("text-muted-foreground leading-relaxed", plain ? "text-xs" : "text-sm")}>
          Tap the diagram or choose a sector under Signals. Log data only — not a diagnosis.
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        plain ? "py-1" : "glass-subtle hud-corners rounded-2xl p-4 relative overflow-hidden",
        className
      )}
    >
      <div className={cn("space-y-3", plain && "space-y-2")}>
        <div>
          {!plain && (
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
              <span className="status-dot" style={{ width: 4, height: 4 }} />
              Selection
            </p>
          )}
          {segmentTitle ? (
            <>
              <h3 className="text-sm font-semibold tracking-tight text-foreground">{segmentTitle}</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">{region.label}</p>
            </>
          ) : (
            <h3 className="text-sm font-semibold tracking-tight text-foreground">{region.label}</h3>
          )}
          <p
            className={cn(
              "text-[10px] text-muted-foreground tabular-nums",
              plain ? "mt-0.5" : "mt-1 font-mono"
            )}
          >
            {plain ? (
              <>
                {region.severity} · HP {region.health}/{region.maxHealth}
              </>
            ) : (
              <>
                {regionId.toUpperCase()} · HP {region.health}/{region.maxHealth}
              </>
            )}
          </p>
        </div>

        {region.injuries.length > 0 ? (
          <ul className="space-y-1.5">
            {region.injuries.map((inj) => (
              <li
                key={inj.id}
                className={cn(
                  "rounded-lg border border-border/40 bg-background/20 px-2.5 py-1.5",
                  !plain && "shadow-inner shadow-black/10"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium text-foreground leading-snug">{inj.title}</span>
                  <span className="shrink-0 text-[9px] uppercase text-muted-foreground">{inj.status}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Nothing mapped here.</p>
        )}

        {region.symptoms.length > 0 && (
          <div>
            <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Symptoms
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {region.symptoms.map((s) => (
                <li
                  key={s}
                  className="rounded-md border border-primary/15 bg-primary/5 px-2 py-0.5 text-[10px] text-foreground/90"
                >
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {region.treatmentSuggestions.length > 0 && (
          <div>
            <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Ideas
            </p>
            <ul className="space-y-0.5">
              {region.treatmentSuggestions.map((t) => (
                <li key={t.id} className="text-[11px] text-muted-foreground pl-2 border-l border-border/40">
                  {t.label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
