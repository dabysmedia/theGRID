"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronRight, Minus, TrendingDown, TrendingUp, Trophy } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { apiFetch } from "@/lib/api-fetch"
import { cn } from "@/lib/utils"
import type {
  WorkoutMovementReport,
  WorkoutProgressionSummaryData,
} from "@/lib/workouts/progressive-overload"

interface SummaryRow {
  id: string
  sessionId: string
  summaryJson: string
  createdAt: string
}

const OUTCOME_META: Record<
  WorkoutMovementReport["outcome"],
  { label: string; Icon: typeof TrendingUp; className: string }
> = {
  progressed: { label: "Progressed", Icon: TrendingUp, className: "text-emerald-400" },
  held: { label: "Held", Icon: Minus, className: "text-muted-foreground/70" },
  adjust: { label: "Adjust", Icon: TrendingDown, className: "text-amber-400" },
}

/**
 * Persisted progressive-overload hero for the workouts page. Fetches the most
 * recent saved workout report so it survives reloads and navigation.
 * `refreshToken` re-fetches after a workout is finished in the same visit.
 */
export function ProgressionSummaryHero({
  className,
  refreshToken,
}: {
  className?: string
  refreshToken?: string | number
}) {
  const [data, setData] = useState<WorkoutProgressionSummaryData | null>(null)
  const [reportOpen, setReportOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void apiFetch(`/api/workout-progression?limit=1&_=${Date.now()}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: SummaryRow[]) => {
        if (cancelled || !Array.isArray(rows) || rows.length === 0) return
        try {
          const parsed = JSON.parse(rows[0].summaryJson) as WorkoutProgressionSummaryData
          if (parsed && Array.isArray(parsed.movements)) setData(parsed)
        } catch {}
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const prCount = (data?.repPrs ?? 0) + (data?.loadPrs ?? 0)
  const prText = useMemo(() => {
    if (!data) return null
    const parts: string[] = []
    if (data.repPrs > 0) parts.push(`${data.repPrs} rep PR${data.repPrs === 1 ? "" : "s"}`)
    if (data.loadPrs > 0) parts.push(`${data.loadPrs} load PR${data.loadPrs === 1 ? "" : "s"}`)
    return parts.length > 0 ? parts.join(" · ") : null
  }, [data])

  if (!data || data.movements.length === 0) return null

  const lowConfidence = data.movements.filter((m) => m.lowConfidenceSource != null)

  return (
    <>
      <section
        aria-label="Progressive overload summary"
        className={cn(
          "glass-panel relative overflow-hidden bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-primary/[0.04] px-5 py-4 dark:from-glass-highlight/[0.1] dark:to-primary/[0.06]",
          className,
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-8%,oklch(1_0_0/14%),transparent_58%)] dark:bg-[radial-gradient(ellipse_90%_50%_at_50%_-6%,oklch(1_0_0/10%),transparent_55%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-glass-highlight/45 to-transparent dark:via-white/12"
          aria-hidden
        />
        <div className="relative z-10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <TrendingUp className="size-4 shrink-0 text-primary" aria-hidden />
              <p className="truncate text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
                Progressive Overload Summary
              </p>
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground/55 tabular-nums">
              {data.dateKey}
            </span>
          </div>

          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="font-heading text-xl font-bold leading-tight text-foreground">
                {data.headline}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground/80">{data.message}</p>
            </div>
            {prCount > 0 ? (
              <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-1.5">
                <Trophy className="size-3.5 text-primary" aria-hidden />
                <span className="text-[11px] font-bold text-primary">{prText}</span>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] tabular-nums">
            <span className="flex items-center gap-1 text-emerald-400">
              <TrendingUp className="size-3" aria-hidden />
              {data.exercisesProgressed} progressed
            </span>
            <span className="flex items-center gap-1 text-muted-foreground/70">
              <Minus className="size-3" aria-hidden />
              {data.exercisesHeld} held
            </span>
            <span className="flex items-center gap-1 text-amber-400">
              <TrendingDown className="size-3" aria-hidden />
              {data.exercisesAdjusted} to adjust
            </span>
            {data.totalRepDelta != null ? (
              <span className="text-muted-foreground/60">
                {data.totalRepDelta >= 0 ? "+" : ""}
                {data.totalRepDelta} reps vs comparable sessions
              </span>
            ) : null}
          </div>

          {data.nextPriority ? (
            <p className="mt-2 truncate text-xs text-muted-foreground/75">
              <span className="font-semibold text-foreground/85">Next priority:</span>{" "}
              {data.nextPriority}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="mt-2.5 flex min-h-9 w-full items-center justify-center gap-1 rounded-lg border border-glass-border/35 bg-glass-highlight/10 px-3 text-[11px] font-semibold text-muted-foreground/75 transition-colors hover:bg-glass-highlight/20 hover:text-foreground touch-manipulation"
          >
            Full workout report
            <ChevronRight className="size-3.5" aria-hidden />
          </button>
        </div>
      </section>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent
          showCloseButton
          className={cn(
            "glass-frost max-w-md gap-0 p-0",
            "[&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3",
          )}
        >
          <div className="max-h-[82dvh] overflow-y-auto overscroll-contain">
            <div className="space-y-1 px-4 pb-2 pt-4 pr-12">
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle>Workout progression report</DialogTitle>
                <DialogDescription>
                  {data.sessionName} · {data.dateKey} · {data.message}
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="space-y-2 px-4 pb-4">
              {data.movements.map((m) => {
                const meta = OUTCOME_META[m.outcome]
                return (
                  <div
                    key={m.exerciseName}
                    className="glass-subtle rounded-xl border border-glass-border/30 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                        {m.exerciseName}
                      </p>
                      <span
                        className={cn(
                          "flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider",
                          meta.className,
                        )}
                      >
                        <meta.Icon className="size-3" aria-hidden />
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground/70">
                      {m.completedSets} sets · {m.totalReps} reps
                      {m.bestSetText ? ` · best ${m.bestSetText}` : ""}
                    </p>
                    {m.comparisonText ? (
                      <p className="text-[11px] text-muted-foreground/60">{m.comparisonText}</p>
                    ) : null}
                    {m.newBestText ? (
                      <p className="text-[11px] font-semibold text-primary">{m.newBestText}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-foreground/85">
                      <span className="font-semibold">Next:</span> {m.nextRecText}
                    </p>
                    {m.lowConfidenceSource ? (
                      <p className="mt-0.5 text-[10px] font-medium text-amber-400/85">
                        {m.lowConfidenceSource}
                      </p>
                    ) : null}
                    {m.flagged ? (
                      <p className="mt-0.5 text-[10px] font-medium text-amber-400/85">
                        Pain or technique flagged this session
                      </p>
                    ) : null}
                  </div>
                )
              })}
              {lowConfidence.length > 0 ? (
                <p className="px-1 text-[10px] leading-relaxed text-muted-foreground/55">
                  Low-confidence recommendations are estimates from similar movements or
                  limited data — treat the first set as calibration.
                </p>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
