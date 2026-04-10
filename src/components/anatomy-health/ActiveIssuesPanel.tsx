"use client"

import {
  BODY_REGION_IDS,
  type AnatomyHealthState,
  type BodyRegionId,
  type GlobalCondition,
  type LocalizedCondition,
  type TreatmentSuggestionRef,
} from "@/lib/anatomy-health/model"
import { cn } from "@/lib/utils"

export interface ActiveIssuesPanelProps {
  state: AnatomyHealthState
  selectedRegionId: BodyRegionId | null
  onPickRegion?: (id: BodyRegionId) => void
  variant?: "card" | "plain"
  className?: string
}

function collectTreatments(state: AnatomyHealthState): TreatmentSuggestionRef[] {
  const seen = new Map<string, TreatmentSuggestionRef>()
  for (const id of BODY_REGION_IDS) {
    const r = state.regions[id]
    for (const t of r.treatmentSuggestions) {
      if (!seen.has(t.id)) seen.set(t.id, t)
    }
    for (const inj of r.injuries) {
      for (const t of inj.treatmentSuggestions) {
        if (!seen.has(t.id)) seen.set(t.id, t)
      }
    }
  }
  return [...seen.values()]
}

type RegionalIssue = { regionId: BodyRegionId; regionLabel: string; injury: LocalizedCondition }

function collectRegionalIssues(state: AnatomyHealthState): RegionalIssue[] {
  const out: RegionalIssue[] = []
  for (const id of BODY_REGION_IDS) {
    const r = state.regions[id]
    for (const inj of r.injuries) {
      out.push({ regionId: r.id, regionLabel: r.label, injury: inj })
    }
  }
  return out
}

function GlobalIssueRow({ g, plain }: { g: GlobalCondition; plain: boolean }) {
  return (
    <li
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
      <p className="text-[9px] text-muted-foreground/80 mt-1 uppercase tracking-wider">Global</p>
    </li>
  )
}

function RegionalIssueRow({
  item,
  plain,
  active,
  onPick,
}: {
  item: RegionalIssue
  plain: boolean
  active: boolean
  onPick?: (id: BodyRegionId) => void
}) {
  const { regionId, regionLabel, injury } = item
  const interactive = Boolean(onPick)

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-foreground leading-tight">{injury.title}</span>
        <span className="text-[9px] uppercase shrink-0 text-muted-foreground">{injury.status}</span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
        <span className="text-muted-foreground/90">{regionLabel}</span>
        {injury.symptomTags.length > 0 ? (
          <>
            <span className="mx-1 text-border">·</span>
            {injury.symptomTags.slice(0, 2).join(" · ")}
          </>
        ) : null}
      </p>
    </>
  )

  if (interactive) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onPick?.(regionId)}
          className={cn(
            "w-full text-left rounded-lg border px-2 py-1.5 transition-colors press-scale",
            active
              ? "border-primary/35 bg-primary/10"
              : "border-border/35 bg-background/10 hover:bg-glass-highlight/10"
          )}
        >
          {body}
        </button>
      </li>
    )
  }

  return (
    <li
      className={cn(
        "rounded-lg border border-border/40 bg-background/15 px-2 py-1.5",
        !plain && "shadow-sm shadow-black/10"
      )}
    >
      {body}
    </li>
  )
}

export function ActiveIssuesPanel({
  state,
  selectedRegionId,
  onPickRegion,
  variant = "card",
  className,
}: ActiveIssuesPanelProps) {
  const plain = variant === "plain"
  const globals = state.globalConditions
  const regional = collectRegionalIssues(state)
  const treatments = collectTreatments(state)
  const hasIssues = globals.length > 0 || regional.length > 0

  const inner = (
    <div className={cn("space-y-4", plain ? "" : "overflow-y-auto flex-1 min-h-0 p-2")}>
      <section aria-label="Active issues">
        <h3 className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground mb-2 px-0.5">
          Active issues
        </h3>
        {!hasIssues ? (
          <p className="text-[11px] text-muted-foreground py-1">No active issues logged.</p>
        ) : (
          <ul className="space-y-1.5">
            {globals.map((g) => (
              <GlobalIssueRow key={g.id} g={g} plain={plain} />
            ))}
            {regional.map((item) => (
              <RegionalIssueRow
                key={`${item.regionId}-${item.injury.id}`}
                item={item}
                plain={plain}
                active={selectedRegionId === item.regionId}
                onPick={onPickRegion}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Treatment">
        <h3 className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground mb-2 px-0.5">
          Treatment
        </h3>
        {treatments.length === 0 ? (
          <p className="text-[11px] text-muted-foreground py-1">Nothing suggested yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {treatments.map((t) => (
              <li
                key={t.id}
                className="text-[11px] text-muted-foreground pl-2 border-l border-primary/25 leading-snug"
              >
                {t.label}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )

  if (plain) {
    return <div className={className}>{inner}</div>
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
          Care overview
        </p>
      </div>
      {inner}
    </div>
  )
}
