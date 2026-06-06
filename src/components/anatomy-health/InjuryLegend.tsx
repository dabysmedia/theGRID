"use client"

import { loadLegendTiers } from "@/lib/anatomy-health/load-colors"
import { cn } from "@/lib/utils"

/**
 * Matches BodySilhouetteSvg: baseline steel, DOMS yellow ladder, injury (same accent as callout tag).
 */
export function InjuryLegend({
  className,
  variant = "full",
}: {
  className?: string
  /** `load` = workout load tiers (green / blue / yellow / none). */
  variant?: "full" | "load"
}) {
  const loadTiers = variant === "load" ? loadLegendTiers() : null

  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}
      role="list"
      aria-label="Body map legend"
    >
      {variant === "load" && loadTiers ? (
        loadTiers.map((row) => (
          <div key={row.tier} className="flex items-center gap-1.5" role="listitem">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm border border-border/50"
              style={{ background: row.fill }}
            />
            <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              {row.label}
              <span className="ml-1 font-normal normal-case tabular-nums text-muted-foreground/70">
                {row.sublabel}
              </span>
            </span>
          </div>
        ))
      ) : (
        <>
          <div className="flex items-center gap-2" role="listitem">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm border border-border/50"
              style={{ background: "var(--anatomy-sev-none-fill)" }}
            />
            <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              Nominal
            </span>
          </div>
          <div className="flex items-center gap-2" role="listitem">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm border border-border/50"
              style={{ background: "var(--anatomy-doms-moderate-fill)" }}
            />
            <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              DOMS (yellow)
            </span>
          </div>
        </>
      )}
      {variant === "full" ? (
        <div className="flex items-center gap-2" role="listitem">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm border border-border/50"
            style={{ background: "var(--anatomy-injury-moderate-fill)" }}
          />
          <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Injury (red)
          </span>
        </div>
      ) : null}
    </div>
  )
}
