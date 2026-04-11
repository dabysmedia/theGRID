"use client"

import { useEffect, useMemo, useState } from "react"
import type { AnatomyHealthState, BodyRegionId, BodyView, SeverityLevel } from "@/lib/anatomy-health/model"
import { slugToBodyRegion } from "@/lib/anatomy-health/body-highlighter"
import { parseBodySegmentKey } from "@/lib/anatomy-health/segment-labels"
import {
  activeConditionTags,
  buildInjuryCalloutsForView,
  type InjuryRowLike,
} from "@/lib/anatomy-health/derive-from-recovery"
import { BodySilhouetteSvg } from "./BodySilhouetteSvg"
import { ActiveIssuesPanel } from "./ActiveIssuesPanel"
import { InjuryLegend } from "./InjuryLegend"
import "./anatomy-health.css"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface AnatomyCanvasProps {
  state: AnatomyHealthState
  className?: string
  defaultSelectedRegion?: BodyRegionId | null
  headerActions?: React.ReactNode
  /** Display name for the health monitoring HUD (top-left of the panel). */
  systemName?: string
  systemTagline?: string
  /** Per-segment DOMS scores from today’s log (yellow on the diagram). */
  domsScores?: Record<string, number> | null
  /** Per-segment injury severity from active injury records (red). */
  injurySegmentSeverity?: Record<string, SeverityLevel> | null
  /** When false, hides PAIN / NRG / MOOD / etc. readouts in the header row. */
  showVitalsReadouts?: boolean
  /** Active injury / illness rows — drives leader lines on the SVG and the condition tag strip. */
  diagramInjuries?: InjuryRowLike[] | null
}

export function AnatomyCanvas({
  state,
  className,
  defaultSelectedRegion = null,
  headerActions,
  systemName = "Health Monitor",
  systemTagline,
  domsScores = null,
  injurySegmentSeverity = null,
  showVitalsReadouts = true,
  diagramInjuries = null,
}: AnatomyCanvasProps) {
  const [view, setView] = useState<BodyView>("front")
  const [selectedRegionId, setSelectedRegionId] = useState<BodyRegionId | null>(defaultSelectedRegion)
  const [selectedSegmentKey, setSelectedSegmentKey] = useState<string | null>(null)
  const [hoveredSegmentKey, setHoveredSegmentKey] = useState<string | null>(null)

  useEffect(() => {
    setSelectedSegmentKey(null)
    setHoveredSegmentKey(null)
  }, [view])

  function handlePickRegion(id: BodyRegionId) {
    setSelectedRegionId(id)
    setSelectedSegmentKey(null)
  }

  function handleSelectSegment(key: string) {
    setSelectedSegmentKey(key)
    const p = parseBodySegmentKey(key)
    if (p && p.view === view) {
      setSelectedRegionId(slugToBodyRegion(p.slug, p.side, view))
    }
  }

  const injuryCallouts = useMemo(
    () => buildInjuryCalloutsForView(diagramInjuries ?? [], view),
    [diagramInjuries, view]
  )
  const conditionTags = useMemo(() => activeConditionTags(diagramInjuries ?? []), [diagramInjuries])

  return (
    <div className={cn("anatomy-health-root", className)}>
      <div className="glass hud-corners rounded-2xl border border-border/30 overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 justify-between border-b border-border/35 bg-black/15 px-3 py-3 sm:px-4 sm:py-3.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0 flex-1">
            <div className="shrink-0 self-center border-r border-border/30 pr-3 mr-0.5 max-w-[11rem] sm:max-w-none">
              <p className="text-xs font-medium leading-snug text-foreground sm:text-[13px]">
                {systemName}
              </p>
              {systemTagline ? (
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{systemTagline}</p>
              ) : null}
            </div>
            {showVitalsReadouts ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0 flex-1 text-[11px] leading-snug min-h-[1.25rem]">
                {state.vitalsReadouts.map((v) => (
                  <span key={v.label} className="inline-flex items-baseline gap-1 shrink-0">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{v.label}</span>
                    <span
                      className={cn(
                        "tabular-nums font-medium text-foreground",
                        v.status === "alert" && "text-amber-400",
                        v.status === "warn" && "text-amber-200/90"
                      )}
                    >
                      {v.value}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {(["front", "back"] as const).map((v) => (
              <Button
                key={v}
                type="button"
                size="sm"
                variant={view === v ? "glass" : "outline"}
                onClick={() => setView(v)}
                className={cn(
                  "h-7 min-h-0 px-2 py-0 text-[10px] font-mono uppercase tracking-wider",
                  view !== v && "border-border/50 bg-background/30 text-muted-foreground hover:text-foreground"
                )}
                aria-pressed={view === v}
              >
                {v}
              </Button>
            ))}
            {headerActions}
          </div>
        </div>

        <div className="grid lg:grid-cols-12 lg:items-stretch">
          <div className="lg:col-span-6 xl:col-span-7 flex flex-col border-b lg:border-b-0 lg:border-r border-border/30 min-h-0">
            <div className="anatomy-figure-chassis relative isolate flex-1 flex flex-col p-3 sm:p-4 min-h-[200px]">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.28]"
                style={{
                  backgroundImage: `repeating-linear-gradient(90deg, var(--anatomy-grid-fine) 0, var(--anatomy-grid-fine) 1px, transparent 1px, transparent 14px)`,
                }}
                aria-hidden
              />
              <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="relative min-h-[180px] min-w-0 flex-1">
                  <div
                    className="anatomy-svg-viewport-backdrop pointer-events-none absolute inset-0 rounded-md"
                    aria-hidden
                  />
                  <div className="relative z-[1] flex h-full min-h-[180px] w-full items-center justify-center">
                    {conditionTags.length > 0 ? (
                      <div
                        className="anatomy-tarkov-tags pointer-events-none absolute top-1 right-1 z-20 flex max-w-[min(46%,11rem)] flex-col items-end gap-1"
                        aria-label="Active conditions"
                      >
                        {conditionTags.map((tag, i) => (
                          <span key={`${i}-${tag}`} className="anatomy-tarkov-tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <BodySilhouetteSvg
                      view={view}
                      state={state}
                      selectedSegmentKey={selectedSegmentKey}
                      hoveredSegmentKey={hoveredSegmentKey}
                      onSelectSegment={handleSelectSegment}
                      onHoverSegment={setHoveredSegmentKey}
                      domsScores={domsScores}
                      injurySegmentSeverity={injurySegmentSeverity}
                      injuryCallouts={injuryCallouts}
                      className="max-h-[min(58vh,440px)] max-w-full"
                    />
                  </div>
                </div>
                <div className="relative z-[1] mt-2 shrink-0 border-t border-border/25 pt-2">
                  <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Scale</p>
                  <InjuryLegend className="gap-x-3 gap-y-1" />
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 xl:col-span-5 flex min-h-0 flex-col lg:max-h-[min(72vh,560px)]">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
                <ActiveIssuesPanel
                  variant="plain"
                  state={state}
                  selectedRegionId={selectedRegionId}
                  onPickRegion={handlePickRegion}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
