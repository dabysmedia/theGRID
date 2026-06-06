"use client"

import { useMemo } from "react"
import { format, parseISO } from "date-fns"
import { Activity } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  aggregateMuscleStats,
  formatVolumeLb,
  muscleStatsToSegmentScores,
  type WorkoutSessionLike,
} from "@/lib/workouts/muscle-volume"
import { WorkoutMuscleMap } from "./WorkoutMuscleMap"

function muscleSwatchStyles(hex: string | undefined): { soft: string; dot: string } {
  const c = hex?.trim()
  if (c && /^#[0-9A-Fa-f]{6}$/.test(c)) {
    return { soft: `${c}20`, dot: c }
  }
  return {
    soft: "color-mix(in oklch, var(--primary) 14%, transparent)",
    dot: "var(--primary)",
  }
}

function formatLastTrained(dateKey: string | null, today: string, yesterday: string): string {
  if (!dateKey) return "—"
  if (dateKey === today) return "Today"
  if (dateKey === yesterday) return "Yesterday"
  try {
    return format(parseISO(`${dateKey}T12:00:00`), "EEE")
  } catch {
    return dateKey
  }
}

export interface WorkoutRecoverySectionProps {
  sessions: WorkoutSessionLike[]
  weekStart: string
  weekEnd: string
  today: string
  yesterday: string
  className?: string
}

export function WorkoutRecoverySection({
  sessions,
  weekStart,
  weekEnd,
  today,
  yesterday,
  className,
}: WorkoutRecoverySectionProps) {
  const muscleStats = useMemo(
    () => aggregateMuscleStats(sessions, weekStart, weekEnd),
    [sessions, weekStart, weekEnd],
  )

  const segmentScores = useMemo(() => {
    const scores = muscleStatsToSegmentScores(muscleStats)
    return Object.keys(scores).length > 0 ? scores : null
  }, [muscleStats])

  const recentMuscles = useMemo(() => muscleStats.filter((m) => m.sets > 0).slice(0, 12), [muscleStats])

  return (
    <section id="recovery" className={cn("scroll-mt-20 space-y-3", className)}>
      <div className="flex items-center gap-2 px-1">
        <Activity className="size-4 text-[#2dd4bf] shrink-0" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">
          Recovery
        </h2>
      </div>

      <div className="glass-panel overflow-hidden border border-border/30">
        <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-border/25">
          <div className="p-3 sm:p-4">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Load · this week
            </p>
            <WorkoutMuscleMap segmentScores={segmentScores} />
          </div>

          <div className="border-t border-border/25 p-3 sm:p-4 lg:border-t-0">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Weekly load by muscle
              </p>
              <p className="text-[10px] text-muted-foreground/60 tabular-nums">
                {weekStart.slice(5).replace("-", "/")} – {weekEnd.slice(5).replace("-", "/")}
              </p>
            </div>

            {recentMuscles.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border/35 bg-black/10 px-4 text-center">
                <p className="text-sm text-muted-foreground">No completed work logged this week yet.</p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Finish a workout to see muscle volume and recovery load here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full min-w-[16rem] text-left text-sm">
                  <thead>
                    <tr className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
                      <th className="pb-2 pr-2 font-medium">Muscle</th>
                      <th className="pb-2 px-2 text-right font-medium">Sets</th>
                      <th className="pb-2 px-2 text-right font-medium">Volume</th>
                      <th className="pb-2 pl-2 text-right font-medium">Last</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/15">
                    {recentMuscles.map((row) => {
                      const swatch = muscleSwatchStyles(row.color)
                      return (
                        <tr key={row.muscle} className="group">
                          <td className="py-2.5 pr-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="size-2 shrink-0 rounded-full"
                                style={{ backgroundColor: swatch.dot }}
                              />
                              <span className="truncate font-medium text-foreground">{row.muscle}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-foreground">
                            {Number.isInteger(row.sets) ? row.sets : row.sets.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground">
                            {formatVolumeLb(row.volumeLb)}
                          </td>
                          <td className="py-2.5 pl-2 text-right text-xs text-muted-foreground whitespace-nowrap">
                            {formatLastTrained(row.lastTrainedDate, today, yesterday)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
