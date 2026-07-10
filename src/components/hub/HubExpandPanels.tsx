"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { addDays, format, startOfWeek } from "date-fns"
import {
  ChevronDown,
  ChevronLeft,
  Dumbbell,
  Moon,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Syringe,
  Trash2,
  Waves,
} from "lucide-react"
import { HubCollapse, HUB_MOTION_MS } from "@/components/hub/HubMotion"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts"
import { CaloriePipTracker } from "@/components/calories/CaloriePipTracker"
import { LogFoodDialog } from "@/components/calories/LogFoodDialog"
import { PeptideVialGraphic } from "@/components/PeptideVialGraphic"
import { PeptideHalfLifeMeter } from "@/components/PeptideHalfLifeMeter"
import { PeptideHungerMeter } from "@/components/PeptideHungerMeter"
import { Button } from "@/components/ui/button"
import { WeekWorkoutGoalRing, WEEKLY_WORKOUT_GOAL } from "@/components/WeekWorkoutGoalRing"
import {
  StageMinuteBars,
  StageTimeline,
  parseStages,
} from "@/components/sleep/SleepStageViews"
import {
  WeightCorrelationPanel,
  type WeightCorrelationDayData,
} from "@/components/stats/WeightCorrelationPanel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { GlassChip } from "@/components/GlassChip"
import { LogPeptideDailyDialog } from "@/components/quick-log/LogPeptideDailyDialog"
import { LogPeptideInjectionDialog } from "@/components/quick-log/LogPeptideInjectionDialog"
import { LogWeightDialog } from "@/components/quick-log/LogWeightDialog"
import { ProgressionSummaryHero } from "@/components/workouts/ProgressionSummaryHero"
import { WorkoutMuscleMap } from "@/components/workouts/WorkoutMuscleMap"
import { useActiveDate } from "@/context/DateContext"
import { useQuickLog } from "@/context/QuickLogContext"
import { useUser } from "@/context/UserContext"
import { apiFetch } from "@/lib/api-fetch"
import {
  writeInjectionIntervalDays,
  type NextInjectionInfo,
} from "@/lib/hub-tile-prefs"
import {
  INJECTION_INTERVAL_PRESETS,
  PEPTIDE_COLOR,
  dosedWeekNumberMap,
  groupInjectionsByDosedWeek,
  injectionSiteLabel,
} from "@/lib/peptides"
import {
  READINESS_BAND_LABEL,
  readinessBand,
} from "@/lib/readiness-score"
import { displaySleepScore, qualityToScore } from "@/lib/sleep-score"
import { sleepDurationHours } from "@/lib/sleepDuration"
import {
  aggregateMuscleStats,
  formatVolumeLb,
  muscleStatsToSegmentScores,
  type WorkoutSessionLike,
} from "@/lib/workouts/muscle-volume"
import type { CalorieEntry, DraftMealItem } from "@/lib/calories/log-food"
import { mealTypes } from "@/lib/calories/log-food"
import { cn, formatDate, parseLocalDate } from "@/lib/utils"

export type HubExpandedPanel =
  | "calories"
  | "steps"
  | "sleep"
  | "weight"
  | "vitals"
  | "peptides"
  | "workouts"

/**
 * Hub header back control — same h-7 slot / type-hud-title language as
 * Daily/Weekly Overview so expand chrome feels permanent, not bolted on.
 */
export function HubBackToOverview({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="Back to overview"
      className="group flex h-7 w-full touch-manipulation items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/25"
    >
      <ChevronLeft
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground/55 transition-colors duration-200 group-hover:text-foreground/80"
        aria-hidden
      />
      <span className="status-dot shrink-0 opacity-70 transition-opacity duration-200 group-hover:opacity-100" />
      <span className="type-hud-title min-w-0 truncate text-foreground/85 transition-colors duration-200 group-hover:text-foreground">
        Overview
      </span>
    </button>
  )
}

const MEAL_PREVIEW_LIMIT = 2

/* ─── Calories ───────────────────────────────────────────── */

export function HubCaloriesExpand({
  consumed,
  target,
  vacationBlocked,
}: {
  consumed: number
  target: number
  vacationBlocked?: boolean
}) {
  const { activeDate } = useActiveDate()
  const { openQuickLog } = useQuickLog()
  const remaining = Math.max(0, target - consumed)
  const pct = target > 0 ? Math.round((consumed / target) * 100) : 0

  const [entries, setEntries] = useState<CalorieEntry[]>([])
  const [entriesStatus, setEntriesStatus] = useState<"loading" | "ready" | "error">("loading")
  const [logFoodOpen, setLogFoodOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<CalorieEntry | null>(null)
  const [draftMealItems, setDraftMealItems] = useState<DraftMealItem[]>([])
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null)
  const [pendingDeleteBusy, setPendingDeleteBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  /** Meals with item lists expanded (header + total always visible). */
  const [openMeals, setOpenMeals] = useState<Set<string>>(() => new Set())
  /** Meals showing every item past the preview limit. */
  const [showAllItems, setShowAllItems] = useState<Set<string>>(() => new Set())
  const mealsInitRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    setEntriesStatus("loading")
    void apiFetch(`/api/calories?date=${activeDate}&_=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((rows: unknown) => {
        if (cancelled) return
        setEntries(Array.isArray(rows) ? (rows as CalorieEntry[]) : [])
        setEntriesStatus("ready")
      })
      .catch(() => {
        if (cancelled) return
        setEntries([])
        setEntriesStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [activeDate, reloadKey])

  useEffect(() => {
    if (!pendingDelete) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pendingDeleteBusy) setPendingDelete(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pendingDelete, pendingDeleteBusy])

  const mealGroups = useMemo(() => {
    const map = new Map<string, CalorieEntry[]>()
    for (const entry of entries) {
      const key = entry.mealType.toLowerCase().trim() || "other"
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(entry)
    }
    const order = mealTypes as readonly string[]
    const ordered: { meal: string; items: CalorieEntry[]; total: number }[] = order
      .filter((m) => map.has(m))
      .map((meal) => {
        const items = map.get(meal)!
        return {
          meal,
          items,
          total: items.reduce((s, e) => s + e.calories, 0),
        }
      })
    for (const [meal, mealItems] of map) {
      if (!order.includes(meal)) {
        ordered.push({
          meal,
          items: mealItems,
          total: mealItems.reduce((s, e) => s + e.calories, 0),
        })
      }
    }
    return ordered
  }, [entries])

  // Open the first meal once per day load; don't fight later user toggles.
  useEffect(() => {
    mealsInitRef.current = false
    setOpenMeals(new Set())
    setShowAllItems(new Set())
  }, [activeDate])

  useEffect(() => {
    if (entriesStatus !== "ready" || mealGroups.length === 0 || mealsInitRef.current) return
    mealsInitRef.current = true
    setOpenMeals(new Set([mealGroups[0]!.meal]))
  }, [entriesStatus, mealGroups])

  function toggleMealOpen(meal: string) {
    setOpenMeals((prev) => {
      const next = new Set(prev)
      if (next.has(meal)) next.delete(meal)
      else next.add(meal)
      return next
    })
  }

  function bumpHub() {
    window.dispatchEvent(new CustomEvent("grid:log-saved"))
  }

  function openAddFood() {
    setEditingEntry(null)
    setLogFoodOpen(true)
  }

  function startEdit(entry: CalorieEntry) {
    setEditingEntry(entry)
    setLogFoodOpen(true)
  }

  function requestDelete(id: string, summary?: string) {
    const detail =
      summary && summary.trim().length > 0
        ? summary.trim().length > 90
          ? `${summary.trim().slice(0, 90)}…`
          : summary.trim()
        : null
    setPendingDelete({ id, label: detail ?? "this log entry" })
  }

  async function executePendingDelete() {
    if (!pendingDelete || pendingDeleteBusy) return
    setPendingDeleteBusy(true)
    try {
      const id = pendingDelete.id
      const res = await apiFetch(`/api/calories?id=${id}`, { method: "DELETE" })
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id))
        setEditingEntry((cur) => (cur?.id === id ? null : cur))
        if (logFoodOpen) setLogFoodOpen(false)
        bumpHub()
      }
      setPendingDelete(null)
    } finally {
      setPendingDeleteBusy(false)
    }
  }

  return (
    <div className="px-0.5">
      {vacationBlocked ? (
        <div className="space-y-3">
          <div className="min-w-0">
            <p className="type-hud-subsection">Calories</p>
            <p className="mt-1 type-hud-caption normal-case tracking-normal text-muted-foreground/70">
              Vacation mode — intake tracking paused.
            </p>
          </div>
          <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-[12px] leading-relaxed text-amber-100/90">
            Food logging is paused until vacation ends.
          </p>
        </div>
      ) : (
        <>
          {/* Pips = full-bleed background; Today's food = right-side floating rail */}
          <div className="relative -mx-1 min-h-[min(62vh,30rem)] w-[calc(100%+0.5rem)] overflow-hidden sm:-mx-2 sm:min-h-[min(58vh,32rem)] sm:w-[calc(100%+1rem)]">
            <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
              <CaloriePipTracker
                consumed={consumed}
                target={target}
                size="default"
                fillHeight
                hideMeta
              />
            </div>

            <div className="relative z-10 flex min-h-[min(62vh,30rem)] flex-col sm:min-h-[min(58vh,32rem)]">
              <div className="flex shrink-0 flex-col gap-2.5 px-2.5 pt-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:px-3">
                <div className="min-w-0">
                  <p className="type-hud-subsection text-foreground/80 drop-shadow-[0_1px_8px_oklch(0.08_0.01_250/80%)]">
                    Calories
                  </p>
                  <p className="mt-1 text-[12px] font-medium tabular-nums leading-snug text-foreground/75 drop-shadow-[0_1px_6px_oklch(0.08_0.01_250/70%)] sm:text-[13px]">
                    {`${consumed.toLocaleString()} of ${target.toLocaleString()}`}
                    <span className="text-muted-foreground/70">
                      {` · ${remaining.toLocaleString()} left · ${pct}%`}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:shrink-0">
                  <button
                    type="button"
                    onClick={openAddFood}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-white/14 bg-[oklch(0.14_0.01_250/70%)] px-3 type-hud-micro text-foreground/85 backdrop-blur-md transition-colors duration-200 hover:border-red-400/35 hover:bg-red-400/[0.1] hover:text-red-100/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/30 sm:h-10 sm:flex-none sm:px-4"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Add food
                  </button>
                  <button
                    type="button"
                    onClick={() => openQuickLog("calories")}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-white/14 bg-[oklch(0.14_0.01_250/70%)] px-3 type-hud-micro text-foreground/85 backdrop-blur-md transition-colors duration-200 hover:border-red-400/35 hover:bg-red-400/[0.1] hover:text-red-100/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/30 sm:h-10 sm:flex-none sm:px-4"
                  >
                    Quick log
                  </button>
                </div>
              </div>

              <div className="relative mt-2 flex min-h-0 flex-1">
                {/* Left: pips breathe through; soft fade into the rail */}
                <div className="pointer-events-none relative min-w-0 flex-1" aria-hidden>
                  <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-r from-transparent to-[oklch(0.11_0.01_250/55%)] sm:w-14" />
                </div>

                <aside
                  className={cn(
                    "pointer-events-auto flex min-h-0 w-[min(72%,20rem)] shrink-0 flex-col sm:w-[min(46%,22.5rem)] md:w-[min(40%,24rem)]",
                    "border-l border-white/[0.1] bg-[oklch(0.11_0.012_250/78%)] shadow-[-12px_0_28px_oklch(0.08_0.01_250/35%)] backdrop-blur-[14px]",
                    "motion-safe:animate-fade-up motion-reduce:animate-none",
                  )}
                  style={{ animationDuration: `${HUB_MOTION_MS}ms` }}
                  aria-label="Today's food"
                >
                  <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-white/[0.08] px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/90">
                      Today&apos;s food
                    </p>
                    {entriesStatus === "ready" && entries.length > 0 ? (
                      <span className="text-[11px] font-semibold tabular-nums text-muted-foreground/65">
                        {entries.length}
                      </span>
                    ) : null}
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-2.5 [-webkit-overflow-scrolling:touch]">
                    {entriesStatus === "loading" ? (
                      <p className="px-0.5 text-[12px] leading-relaxed text-muted-foreground/65">
                        Loading food log…
                      </p>
                    ) : null}
                    {entriesStatus === "error" ? (
                      <p className="px-0.5 text-[12px] leading-relaxed text-muted-foreground/65">
                        Couldn&apos;t load food log.{" "}
                        <button
                          type="button"
                          onClick={() => setReloadKey((k) => k + 1)}
                          className="font-medium text-foreground/85 underline-offset-2 hover:underline hover:text-red-200/90"
                        >
                          Retry
                        </button>
                      </p>
                    ) : null}
                    {entriesStatus === "ready" && entries.length === 0 ? (
                      <p className="px-0.5 text-[12px] leading-relaxed text-muted-foreground/65">
                        Nothing logged yet — tap Add food.
                      </p>
                    ) : null}

                    {entriesStatus === "ready" && mealGroups.length > 0 ? (
                      <div className="space-y-2 pb-0.5">
                        {mealGroups.map(({ meal, items, total }) => {
                          const mealOpen = openMeals.has(meal)
                          const revealAll = showAllItems.has(meal)
                          const visibleItems = revealAll
                            ? items
                            : items.slice(0, MEAL_PREVIEW_LIMIT)
                          const hiddenCount = items.length - visibleItems.length
                          return (
                            <div
                              key={meal}
                              className="overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.045]"
                            >
                              <button
                                type="button"
                                aria-expanded={mealOpen}
                                onClick={() => toggleMealOpen(meal)}
                                className="flex w-full items-center justify-between gap-2.5 px-2.5 py-2.5 text-left transition-colors duration-200 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-400/25"
                              >
                                <div className="min-w-0">
                                  <p className="text-[12px] font-semibold capitalize tracking-wide text-foreground/95">
                                    {meal}
                                  </p>
                                  <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground/60">
                                    {items.length} item{items.length === 1 ? "" : "s"}
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                  <span className="text-[13px] font-bold tabular-nums text-foreground">
                                    {total.toLocaleString()}
                                    <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/55">
                                      cal
                                    </span>
                                  </span>
                                  <ChevronDown
                                    className={cn(
                                      "h-3.5 w-3.5 text-muted-foreground/45 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                                      mealOpen && "rotate-180 text-red-200/75",
                                    )}
                                    aria-hidden
                                  />
                                </div>
                              </button>

                              <HubCollapse open={mealOpen}>
                                <ul className="divide-y divide-white/[0.06] border-t border-white/[0.07] px-2.5">
                                  {visibleItems.map((entry) => (
                                    <li
                                      key={entry.id}
                                      className="group/row flex items-stretch gap-1.5 py-2.5"
                                    >
                                      <div className="min-w-0 flex-1">
                                        {entry.description?.trim() ? (
                                          <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground/92">
                                            {entry.description}
                                          </p>
                                        ) : (
                                          <p className="text-[13px] font-medium text-foreground/75">
                                            Logged entry
                                          </p>
                                        )}
                                        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                          <span className="text-[12px] font-semibold tabular-nums text-foreground/88">
                                            {entry.calories.toLocaleString()} cal
                                          </span>
                                          {(entry.protein != null ||
                                            entry.carbs != null ||
                                            entry.fat != null) && (
                                            <span className="text-[10px] tabular-nums text-muted-foreground/55">
                                              {[
                                                entry.protein != null
                                                  ? `P ${entry.protein}g`
                                                  : null,
                                                entry.carbs != null
                                                  ? `C ${entry.carbs}g`
                                                  : null,
                                                entry.fat != null
                                                  ? `F ${entry.fat}g`
                                                  : null,
                                              ]
                                                .filter(Boolean)
                                                .join(" · ")}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-0.5 self-center">
                                        <button
                                          type="button"
                                          onClick={() => startEdit(entry)}
                                          className="history-row-edit !min-h-9 !min-w-9 !m-0"
                                          title="Edit"
                                          aria-label={`Edit ${entry.description?.trim() || entry.calories + " cal"}`}
                                        >
                                          <Pencil />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            requestDelete(
                                              entry.id,
                                              entry.description?.trim() ||
                                                `${entry.calories} cal · ${entry.mealType}`,
                                            )
                                          }
                                          className="history-row-delete-row !min-h-9 !min-w-9 !m-0"
                                          aria-label={`Delete ${entry.description?.trim() || entry.calories + " cal"}`}
                                        >
                                          <Trash2 />
                                        </button>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                                {hiddenCount > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setShowAllItems((prev) => {
                                        const next = new Set(prev)
                                        next.add(meal)
                                        return next
                                      })
                                    }
                                    className="w-full px-2.5 py-2 text-left text-[11px] font-medium text-muted-foreground/60 transition-colors hover:text-red-200/85"
                                  >
                                    +{hiddenCount} more
                                  </button>
                                ) : null}
                                {revealAll && items.length > MEAL_PREVIEW_LIMIT ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setShowAllItems((prev) => {
                                        const next = new Set(prev)
                                        next.delete(meal)
                                        return next
                                      })
                                    }
                                    className="w-full px-2.5 py-2 text-left text-[11px] font-medium text-muted-foreground/60 transition-colors hover:text-red-200/85"
                                  >
                                    Show less
                                  </button>
                                ) : null}
                              </HubCollapse>
                            </div>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                </aside>
              </div>
            </div>
          </div>

          <LogFoodDialog
            open={logFoodOpen}
            onOpenChange={(open) => {
              setLogFoodOpen(open)
              if (!open) setEditingEntry(null)
            }}
            editingEntry={editingEntry}
            onEditingEntryChange={setEditingEntry}
            draftMealItems={draftMealItems}
            onDraftMealItemsChange={setDraftMealItems}
            onPosted={(created) => {
              setEntries((prev) => [...created.reverse(), ...prev])
              bumpHub()
            }}
            onUpdated={(updated) => {
              setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
              setEditingEntry(null)
              bumpHub()
            }}
          />

          {pendingDelete
            ? createPortal(
                <div
                  className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[3px]"
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="hub-cal-delete-title"
                  aria-describedby="hub-cal-delete-desc"
                  onClick={() => {
                    if (!pendingDeleteBusy) setPendingDelete(null)
                  }}
                >
                  <div
                    className="w-full max-w-sm rounded-2xl border border-border/35 bg-popover p-5 shadow-2xl ring-1 ring-foreground/5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h2
                      id="hub-cal-delete-title"
                      className="font-heading text-base font-semibold text-foreground"
                    >
                      Delete log entry?
                    </h2>
                    <p
                      id="hub-cal-delete-desc"
                      className="mt-2 text-sm leading-relaxed text-muted-foreground"
                    >
                      {pendingDelete.label === "this log entry" ? (
                        <>This will remove the entry from your history. This cannot be undone.</>
                      ) : (
                        <>
                          This will remove{" "}
                          <span className="font-medium text-foreground">
                            &quot;{pendingDelete.label}&quot;
                          </span>{" "}
                          from your history. This cannot be undone.
                        </>
                      )}
                    </p>
                    <div className="mt-5 flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 flex-1"
                        disabled={pendingDeleteBusy}
                        onClick={() => setPendingDelete(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        className="h-11 flex-1"
                        disabled={pendingDeleteBusy}
                        onClick={() => void executePendingDelete()}
                      >
                        {pendingDeleteBusy ? "Deleting…" : "Delete"}
                      </Button>
                    </div>
                  </div>
                </div>,
                document.body,
              )
            : null}
        </>
      )}
    </div>
  )
}

/* ─── Sleep ──────────────────────────────────────────────── */

type SleepEntryRow = {
  id: string
  date: string
  bedtime: string
  wakeTime: string
  quality: number
  score: number | null
  remMinutes: number | null
  lightMinutes: number | null
  deepMinutes: number | null
  awakeMinutes: number | null
  stagesJson: string | null
}

export function HubSleepExpand({
  hours,
  goal,
  last7,
  dayLabels,
}: {
  hours: number
  goal: number
  last7: number[]
  dayLabels: string[]
}) {
  const { activeDate } = useActiveDate()
  const { openQuickLog } = useQuickLog()
  const [entry, setEntry] = useState<SleepEntryRow | null>(null)
  const [status, setStatus] = useState<"loading" | "ready">("loading")

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    void (async () => {
      try {
        const res = await apiFetch(`/api/sleep?date=${activeDate}`)
        if (!res.ok || cancelled) return
        const rows = (await res.json()) as SleepEntryRow[]
        if (cancelled) return
        setEntry(Array.isArray(rows) && rows.length > 0 ? rows[0]! : null)
      } catch {
        if (!cancelled) setEntry(null)
      } finally {
        if (!cancelled) setStatus("ready")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeDate])

  const stages = entry ? parseStages(entry.stagesJson) : []
  const hasStageMinutes =
    entry != null &&
    ((entry.remMinutes ?? 0) +
      (entry.lightMinutes ?? 0) +
      (entry.deepMinutes ?? 0) +
      (entry.awakeMinutes ?? 0) >
      0)
  const score =
    entry != null
      ? entry.score ?? (entry.quality != null ? qualityToScore(entry.quality) : null)
      : null
  const durationLabel =
    entry != null
      ? `${sleepDurationHours(entry.bedtime, entry.wakeTime)}h`
      : hours > 0
        ? `${hours}h`
        : null

  return (
    <div className="space-y-4 px-0.5">
      <div className="min-w-0">
          <p className="type-hud-subsection">Sleep stages</p>
          <p className="mt-1 type-hud-caption normal-case tracking-normal text-muted-foreground/70">
            {durationLabel != null
              ? `${durationLabel} · goal ${goal}h`
              : `Goal ${goal}h`}
            {score != null ? ` · score ${displaySleepScore(score)}` : ""}
          </p>
      </div>

      {status === "loading" ? (
        <p className="type-hud-caption text-muted-foreground/55">Loading night…</p>
      ) : stages.length > 0 || hasStageMinutes ? (
        <div className="space-y-3">
          {entry != null ? (
            <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/65">
              {format(new Date(entry.bedtime), "h:mm a")} →{" "}
              {format(new Date(entry.wakeTime), "h:mm a")}
            </p>
          ) : null}
          {stages.length > 0 ? <StageTimeline stages={stages} /> : null}
          {entry != null && hasStageMinutes ? <StageMinuteBars entry={entry} /> : null}
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-4">
          <div className="flex items-center gap-2 text-muted-foreground/80">
            <Moon className="h-4 w-4 text-[#6366f1]" aria-hidden />
            <p className="type-hud-caption normal-case tracking-normal">
              No stage breakdown for this night yet.
            </p>
          </div>
          <p className="text-[12px] leading-relaxed text-muted-foreground/60">
            Sync Fitbit / Google Health for deep, light, REM, and awake timelines — or log sleep
            manually below.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => openQuickLog("sleep")}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] type-hud-micro text-muted-foreground/90 transition-colors hover:border-indigo-400/30 hover:bg-indigo-400/[0.06] hover:text-indigo-100/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/30 sm:w-auto sm:px-4"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Log sleep
      </button>

      <div className="space-y-2">
        <p className="type-hud-caption">Last 7 nights</p>
        <div className="flex items-end justify-between gap-1" style={{ height: 44 }}>
          {last7.map((v, i) => {
            const max = Math.max(...last7, goal, 1)
            const h = Math.max(4, Math.round((v / max) * 40))
            const isToday = i === last7.length - 1
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div
                  className="w-[70%] max-w-[18px] rounded-sm"
                  style={{
                    height: h,
                    background: isToday
                      ? "linear-gradient(180deg, #818cf8, #4338ca)"
                      : "linear-gradient(180deg, #6366f188, #312e8188)",
                  }}
                />
                <span
                  className={cn(
                    "text-[9px] tracking-wider",
                    isToday ? "font-semibold text-indigo-300" : "text-muted-foreground/45",
                  )}
                >
                  {dayLabels[i] ?? ""}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ─── Weight ─────────────────────────────────────────────── */

export function HubWeightExpand() {
  const { activeDate } = useActiveDate()
  const [daily, setDaily] = useState<WeightCorrelationDayData[] | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [logOpen, setLogOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const month = useMemo(() => activeDate.slice(0, 7), [activeDate])

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    void (async () => {
      try {
        const res = await apiFetch(`/api/stats/monthly?month=${month}`)
        if (!res.ok || cancelled) {
          if (!cancelled) setStatus("error")
          return
        }
        const data = await res.json()
        if (cancelled) return
        const rows = Array.isArray(data?.daily) ? (data.daily as WeightCorrelationDayData[]) : []
        setDaily(rows)
        setStatus("ready")
      } catch {
        if (!cancelled) {
          setDaily(null)
          setStatus("error")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [month, reloadKey])

  const hasWeight = daily?.some((d) => d.weight != null || d.weightForward != null) ?? false
  const todayRow = daily?.find((d) => d.date === activeDate)
  const todayWeight =
    todayRow?.weight != null
      ? String(todayRow.weight)
      : todayRow?.weightForward != null
        ? String(todayRow.weightForward)
        : ""

  return (
    <div className="space-y-3 px-0.5">
      <div className="min-w-0">
          <p className="type-hud-subsection">Weight correlation</p>
          <p className="mt-1 type-hud-caption normal-case tracking-normal text-muted-foreground/70">
            {month} · vs steps, calories, sleep
          </p>
      </div>

      <button
        type="button"
        onClick={() => setLogOpen(true)}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] type-hud-micro text-muted-foreground/90 transition-colors hover:border-emerald-400/30 hover:bg-emerald-400/[0.06] hover:text-emerald-100/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30 sm:w-auto sm:px-4"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Log weight
      </button>

      {status === "loading" ? (
        <p className="type-hud-caption text-muted-foreground/55">Loading month…</p>
      ) : status === "error" ? (
        <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-[12px] text-muted-foreground/70">
          Couldn’t load correlation data. Try again from Stats.
        </p>
      ) : !hasWeight ? (
        <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-[12px] leading-relaxed text-muted-foreground/70">
          Log a few weigh-ins this month to unlock weight vs activity correlations.
        </p>
      ) : (
        <WeightCorrelationPanel daily={daily!} embedded className="min-w-0" />
      )}

      <LogWeightDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        initialValue={todayWeight}
        editing={todayRow?.weight != null}
        onSaved={() => {
          setLogOpen(false)
          setReloadKey((k) => k + 1)
          window.dispatchEvent(new CustomEvent("grid:log-saved"))
        }}
      />
    </div>
  )
}

/* ─── Vitals ─────────────────────────────────────────────── */

const VITALS_COLOR = "#f43f5e"

type ZoneMinutes = { zone: string; minutes: number }
type HrSample = { time: string; bpm: number }
type TrendDay = {
  date: string
  restingHeartRate: number | null
  hrvMs: number | null
}

type VitalsPayload = {
  restingHeartRate: number | null
  hrvMs: number | null
  hrAvg: number | null
  hrMin: number | null
  hrMax: number | null
  zones: ZoneMinutes[]
  samples: HrSample[]
  trend14: TrendDay[]
  lastSyncAt: string | null
  hasConnection: boolean
}

const ZONE_STYLE: Record<string, { label: string; color: string }> = {
  OUT_OF_RANGE: { label: "Out of range", color: "#64748b" },
  FAT_BURN: { label: "Fat burn", color: "#22c55e" },
  CARDIO: { label: "Cardio", color: "#f59e0b" },
  PEAK: { label: "Peak", color: "#ef4444" },
}

function zoneStyle(zone: string): { label: string; color: string } {
  const key = zone.toUpperCase().replace(/[^A-Z]/g, "_")
  return (
    ZONE_STYLE[key] ?? {
      label: zone
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/^\w/, (c) => c.toUpperCase()),
      color: VITALS_COLOR,
    }
  )
}

function dash(value: number | null | undefined, unit = ""): string {
  return value != null && Number.isFinite(value) ? `${value}${unit}` : "—"
}

export function HubVitalsExpand({
  readiness,
  fallbackHrvMs,
  fallbackRhr,
}: {
  readiness?: number | null
  fallbackHrvMs?: number | null
  fallbackRhr?: number | null
}) {
  const { activeDate } = useActiveDate()
  const [data, setData] = useState<VitalsPayload | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading")
  const [completedSessions, setCompletedSessions] = useState<WorkoutSessionLike[]>([])

  const { weekStart, weekEnd } = useMemo(() => {
    const ref = parseLocalDate(activeDate)
    const start = startOfWeek(ref, { weekStartsOn: 1 })
    return {
      weekStart: formatDate(start),
      weekEnd: formatDate(addDays(start, 6)),
    }
  }, [activeDate])

  const muscleStats = useMemo(
    () => aggregateMuscleStats(completedSessions, weekStart, weekEnd),
    [completedSessions, weekStart, weekEnd],
  )

  const segmentScores = useMemo(() => {
    const scores = muscleStatsToSegmentScores(muscleStats)
    return Object.keys(scores).length > 0 ? scores : null
  }, [muscleStats])

  const topMuscles = useMemo(
    () => muscleStats.filter((m) => m.sets > 0).slice(0, 6),
    [muscleStats],
  )

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    void (async () => {
      try {
        const res = await apiFetch(`/api/vitals?date=${activeDate}`, { cache: "no-store" })
        if (!res.ok || cancelled) {
          if (!cancelled) setStatus("error")
          return
        }
        const json = (await res.json()) as VitalsPayload
        if (cancelled) return
        setData(json)
        setStatus("ready")
      } catch {
        if (!cancelled) {
          setData(null)
          setStatus("error")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeDate, reloadKey])

  useEffect(() => {
    let cancelled = false
    setLoadStatus("loading")
    void apiFetch(`/api/workout-sessions?status=completed&_=${Date.now()}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((rows: unknown) => {
        if (cancelled) return
        setCompletedSessions(Array.isArray(rows) ? (rows as WorkoutSessionLike[]) : [])
        setLoadStatus("ready")
      })
      .catch(() => {
        if (cancelled) return
        setCompletedSessions([])
        setLoadStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [activeDate])

  async function syncNow() {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const res = await apiFetch("/api/google-health/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 14 }),
      })
      const result = (await res.json().catch(() => ({}))) as {
        error?: string
        vitalsUpserted?: number
      }
      if (!res.ok) {
        setSyncMessage(result.error || "Sync failed. Connect Google Health in Settings first.")
      } else {
        setSyncMessage(`Synced ${result.vitalsUpserted ?? 0} days of vitals.`)
        setReloadKey((k) => k + 1)
        window.dispatchEvent(new CustomEvent("grid:log-saved"))
      }
    } catch {
      setSyncMessage("Sync failed.")
    } finally {
      setSyncing(false)
    }
  }

  const hrvMs = data?.hrvMs ?? fallbackHrvMs ?? null
  const rhr = data?.restingHeartRate ?? fallbackRhr ?? null
  const band = readinessBand(readiness ?? null)
  const accent = band
    ? band === "peak"
      ? "#34d399"
      : band === "high"
        ? "#22d3ee"
        : band === "balanced"
          ? VITALS_COLOR
          : band === "low"
            ? "#f59e0b"
            : "#fb7185"
    : VITALS_COLOR

  const hrChartData = useMemo(
    () =>
      (data?.samples ?? []).map((s) => ({
        label: format(new Date(s.time), "h:mm a"),
        bpm: s.bpm,
      })),
    [data?.samples],
  )

  const trendChartData = useMemo(
    () =>
      (data?.trend14 ?? []).map((d) => ({
        label: format(parseLocalDate(d.date), "MMM d"),
        rhr: d.restingHeartRate,
        hrv: d.hrvMs,
      })),
    [data?.trend14],
  )

  const hasHrChart = hrChartData.length >= 2
  const hasTrend = (data?.trend14 ?? []).some(
    (d) => d.restingHeartRate != null || d.hrvMs != null,
  )
  const zones = data?.zones ?? []
  const totalZoneMinutes = zones.reduce((s, z) => s + z.minutes, 0)

  return (
    <div className="space-y-4 px-0.5">
      <div className="min-w-0">
          <p className="type-hud-subsection">Vitals</p>
          <p className="mt-1 type-hud-caption normal-case tracking-normal text-muted-foreground/70">
            {band ? `${READINESS_BAND_LABEL[band]} · ` : ""}
            HRV {dash(hrvMs != null ? Math.round(hrvMs) : null, " ms")}
            {" · "}
            RHR {dash(rhr, " bpm")}
            {readiness != null ? ` · readiness ${Math.round(readiness)}` : ""}
          </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={syncing}
          onClick={() => void syncNow()}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 type-hud-micro text-muted-foreground/90 transition-colors hover:border-[#f43f5e]/30 hover:bg-[#f43f5e]/[0.06] hover:text-rose-100/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f43f5e]/30 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} aria-hidden />
          {syncing ? "Syncing…" : "Sync Google Health"}
        </button>
        {syncMessage ? (
          <p className="type-hud-micro normal-case tracking-normal text-muted-foreground/60">
            {syncMessage}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          {
            label: "HRV",
            value: hrvMs != null ? String(Math.round(hrvMs)) : "—",
            unit: "ms",
            tone: accent,
          },
          {
            label: "RHR",
            value: rhr != null ? String(Math.round(rhr)) : "—",
            unit: "bpm",
            tone: VITALS_COLOR,
          },
          {
            label: "Avg HR",
            value: data?.hrAvg != null ? String(Math.round(data.hrAvg)) : "—",
            unit: "bpm",
            tone: "#94a3b8",
          },
        ].map((cell) => (
          <div
            key={cell.label}
            className="min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-2.5"
          >
            <p className="type-hud-micro text-muted-foreground/55">{cell.label}</p>
            <p
              className="mt-0.5 type-hud-stat-sm tabular-nums"
              style={{ color: cell.tone, textShadow: `0 0 12px ${cell.tone}33` }}
            >
              {cell.value}
              <span className="ml-0.5 text-[10px] font-medium text-muted-foreground/50">
                {cell.unit}
              </span>
            </p>
          </div>
        ))}
      </div>

      <div
        className="pointer-events-none h-px bg-gradient-to-r from-transparent via-white/8 to-transparent"
        aria-hidden
      />

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="type-hud-caption">Load · this week</p>
          {loadStatus === "ready" ? (
            <span className="type-hud-micro tabular-nums text-muted-foreground/50">
              {weekStart.slice(5).replace("-", "/")} – {weekEnd.slice(5).replace("-", "/")}
            </span>
          ) : null}
        </div>
        {loadStatus === "loading" ? (
          <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/55">
            Loading load map…
          </p>
        ) : null}
        {loadStatus === "error" ? (
          <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/55">
            Couldn&apos;t load muscle map.
          </p>
        ) : null}
        {loadStatus === "ready" ? (
          <>
            <WorkoutMuscleMap
              segmentScores={segmentScores}
              className="[&_.anatomy-figure-chassis]:border-white/[0.06] [&_.anatomy-figure-chassis]:bg-white/[0.02]"
            />
            {topMuscles.length > 0 ? (
              <div className="space-y-1.5 pt-1">
                <p className="type-hud-micro text-muted-foreground/50">Top load</p>
                <ul className="space-y-1">
                  {topMuscles.map((row) => (
                    <li
                      key={row.muscle}
                      className="flex items-baseline justify-between gap-2 type-hud-caption normal-case tracking-normal"
                    >
                      <span className="min-w-0 truncate text-foreground/85">{row.muscle}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground/60">
                        {Number.isInteger(row.sets) ? row.sets : row.sets.toFixed(1)} sets
                        {" · "}
                        {formatVolumeLb(row.volumeLb)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/55">
                No completed work this week yet — finish a session to light up the map.
              </p>
            )}
          </>
        ) : null}
      </div>

      <div
        className="pointer-events-none h-px bg-gradient-to-r from-transparent via-white/8 to-transparent"
        aria-hidden
      />

      {status === "loading" ? (
        <p className="type-hud-caption text-muted-foreground/55">Loading vitals…</p>
      ) : status === "error" ? (
        <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-[12px] text-muted-foreground/70">
          Couldn’t load vitals. Sync Google Health above, or open the Vitals page.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="type-hud-caption flex items-center gap-1.5">
                <Waves className="h-3 w-3" style={{ color: VITALS_COLOR }} aria-hidden />
                All-day heart rate
              </p>
              <span className="type-hud-micro tabular-nums text-muted-foreground/50">
                {hrChartData.length > 0 ? `${hrChartData.length} samples` : "No samples"}
              </span>
            </div>
            {!hasHrChart ? (
              <p className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-4 text-center text-[12px] text-muted-foreground/60">
                Sync Google Health for 5-minute HR samples
              </p>
            ) : (
              <div className="h-40 min-w-0 sm:h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hrChartData} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="hubHrAreaFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={VITALS_COLOR} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={VITALS_COLOR} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="oklch(1 0 0 / 5%)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={36}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                      domain={["dataMin - 5", "dataMax + 5"]}
                    />
                    {rhr != null ? (
                      <ReferenceLine y={rhr} stroke="oklch(1 0 0 / 20%)" strokeDasharray="4 4" />
                    ) : null}
                    <Tooltip
                      contentStyle={{
                        background: "oklch(0.19 0.012 250 / 98%)",
                        border: "1px solid oklch(1 0 0 / 8%)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        backdropFilter: "blur(8px)",
                      }}
                      formatter={(value) => [`${value} bpm`, "Heart rate"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="bpm"
                      stroke={VITALS_COLOR}
                      strokeWidth={2}
                      fill="url(#hubHrAreaFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="type-hud-caption">Heart-rate zones</p>
            {zones.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-3 text-center text-[12px] text-muted-foreground/60">
                No zone data for this day yet
              </p>
            ) : (
              <div className="space-y-2">
                {zones.map((z) => {
                  const style = zoneStyle(z.zone)
                  const pct = totalZoneMinutes > 0 ? (z.minutes / totalZoneMinutes) * 100 : 0
                  return (
                    <div key={z.zone} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-foreground/85">
                          {style.label}
                        </span>
                        <span className="type-hud-micro tabular-nums text-muted-foreground/55">
                          {z.minutes} min
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.max(pct, 2)}%`,
                            backgroundColor: style.color,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="type-hud-caption">14-day RHR &amp; HRV</p>
            {!hasTrend ? (
              <p className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-3 text-center text-[12px] text-muted-foreground/60">
                Sync a couple of days to unlock trends
              </p>
            ) : (
              <div className="h-36 min-w-0 sm:h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendChartData} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="oklch(1 0 0 / 5%)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="rhr"
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <YAxis
                      yAxisId="hrv"
                      orientation="right"
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "oklch(0.19 0.012 250 / 98%)",
                        border: "1px solid oklch(1 0 0 / 8%)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        backdropFilter: "blur(8px)",
                      }}
                    />
                    <Line
                      yAxisId="rhr"
                      type="monotone"
                      dataKey="rhr"
                      name="RHR"
                      stroke={VITALS_COLOR}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                    />
                    <Line
                      yAxisId="hrv"
                      type="monotone"
                      dataKey="hrv"
                      name="HRV"
                      stroke="oklch(0.72 0.04 250)"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {data?.lastSyncAt ? (
            <p className="type-hud-micro normal-case tracking-normal text-muted-foreground/45">
              Last sync {format(new Date(data.lastSyncAt), "MMM d, h:mm a")}
            </p>
          ) : data && !data.hasConnection ? (
            <p className="type-hud-micro normal-case tracking-normal text-muted-foreground/45">
              Connect Google Health in Settings to import vitals
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

/* ─── Peptides ───────────────────────────────────────────── */

export type HubPeptideHistoryEntry = {
  id?: string
  injectedAt: string
  doseMg: number
  injectionSite?: string
  compound?: string
}

export type HubPeptideHungerLog = {
  date: string
  hungerLevel: number
}

export function HubPeptidesExpand({
  lastDoseMg,
  lastInjectedAt,
  nextInjection,
  todayMg,
  intervalDays,
  recentEntries = [],
  lastSiteUsed = null,
  dosedWeekCount = 0,
  hungerLogs = [],
}: {
  lastDoseMg: number | null
  lastInjectedAt: string | null
  nextInjection: NextInjectionInfo | null
  todayMg: number
  intervalDays: number
  recentEntries?: HubPeptideHistoryEntry[]
  lastSiteUsed?: string | null
  /** Distinct Monday-start weeks with ≥1 dose (protocol week number). */
  dosedWeekCount?: number
  /** Recent daily appetite logs for the hunger meter. */
  hungerLogs?: HubPeptideHungerLog[]
}) {
  const { user } = useUser()
  const [injectionOpen, setInjectionOpen] = useState(false)
  const [dailyOpen, setDailyOpen] = useState(false)
  const [customInterval, setCustomInterval] = useState("")
  /** Past weeks accordion starts collapsed. */
  const [pastWeeksOpen, setPastWeeksOpen] = useState(false)
  /** Nested older dose rows inside Past weeks; tap to expand one at a time. */
  const [expandedOlderKey, setExpandedOlderKey] = useState<string | null>(null)
  const isPreset = (INJECTION_INTERVAL_PRESETS as readonly number[]).includes(intervalDays)

  let untilLabel = "Log first shot"
  if (nextInjection) {
    if (nextInjection.overdue) untilLabel = `${Math.abs(nextInjection.daysUntil)}d overdue`
    else if (nextInjection.dueToday) untilLabel = "Due today"
    else if (nextInjection.daysUntil === 1) untilLabel = "Next · tomorrow"
    else untilLabel = `${nextInjection.daysUntil}d until next · ${nextInjection.nextLabel}`
  }

  const lastLabel =
    lastInjectedAt != null
      ? format(new Date(lastInjectedAt), "MMM d · h:mm a")
      : null

  const daysSince =
    lastInjectedAt != null
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(lastInjectedAt).getTime()) / (1000 * 60 * 60 * 24),
          ),
        )
      : null

  const cycleProgress = (() => {
    if (daysSince == null || intervalDays <= 0) return 0
    if (nextInjection?.overdue) return 1
    return Math.min(1, daysSince / intervalDays)
  })()

  const history = recentEntries.slice(0, 12)
  const latestEntry = history[0] ?? null
  const olderEntries = history.slice(1)
  const pastWeekGroups = useMemo(() => {
    const older = recentEntries.slice(1, 12)
    if (older.length === 0) return []
    // Number weeks from full history so "Week N" matches protocol (PR #80).
    const weekNums = dosedWeekNumberMap(recentEntries)
    return groupInjectionsByDosedWeek(older).map((g) => ({
      ...g,
      weekNumber: weekNums.get(g.weekKey) ?? g.weekNumber,
    }))
  }, [recentEntries])
  const weekLabel = dosedWeekCount > 0 ? `Week ${dosedWeekCount}` : null
  const pastDoseCount = olderEntries.length

  function bumpHub() {
    window.dispatchEvent(new CustomEvent("grid:log-saved"))
  }

  function setIntervalDays(days: number) {
    if (!user?.id) return
    writeInjectionIntervalDays(user.id, days)
    setCustomInterval("")
  }

  function commitCustomInterval() {
    const n = Math.round(Number(customInterval))
    if (!Number.isFinite(n) || n < 1 || n > 30 || !user?.id) return
    writeInjectionIntervalDays(user.id, n)
  }

  function entryKey(entry: HubPeptideHistoryEntry, i: number) {
    return entry.id ?? `${entry.injectedAt}-${i}`
  }

  return (
    <div className="space-y-4 px-0.5">
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="type-hud-subsection">Peptides</p>
          {weekLabel ? (
            <p className="type-hud-micro tabular-nums text-slate-300/75">{weekLabel}</p>
          ) : null}
        </div>
        <p className="mt-1 type-hud-caption normal-case tracking-normal text-muted-foreground/70">
          {untilLabel}
          {lastDoseMg != null ? ` · last ${lastDoseMg} mg` : ""}
          {weekLabel ? ` · ${weekLabel}` : ""}
        </p>
      </div>

      <div className="flex items-center gap-4">
        <PeptideVialGraphic color={PEPTIDE_COLOR} doseMg={lastDoseMg} size="md" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="px-0.5 py-1">
              <p className="type-hud-micro text-muted-foreground/55">Today</p>
              <p className="type-hud-stat-sm tabular-nums text-foreground/90">
                {todayMg > 0 ? `${todayMg} mg` : "—"}
              </p>
            </div>
            <div className="px-0.5 py-1">
              <p className="type-hud-micro text-muted-foreground/55">Protocol</p>
              <p className="type-hud-stat-sm tabular-nums text-foreground/90">
                {weekLabel ?? "—"}
              </p>
            </div>
            <div className="px-0.5 py-1">
              <p className="type-hud-micro text-muted-foreground/55">Last shot</p>
              <p className="truncate text-[12px] font-medium tabular-nums text-foreground/85">
                {lastLabel ?? "—"}
              </p>
            </div>
          </div>
          <p
            className={cn(
              "text-[12px] font-semibold tracking-wide",
              nextInjection?.overdue && "text-negative",
              nextInjection?.dueToday && "text-primary",
              !nextInjection?.overdue && !nextInjection?.dueToday && "text-slate-300/85",
            )}
          >
            {untilLabel}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setInjectionOpen(true)}
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 type-hud-micro text-muted-foreground/90 transition-colors hover:border-slate-400/35 hover:bg-slate-400/[0.07] hover:text-slate-100/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/30 sm:flex-none sm:px-4"
        >
          <Syringe className="h-3.5 w-3.5" aria-hidden />
          Log injection
        </button>
        <button
          type="button"
          onClick={() => setDailyOpen(true)}
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 type-hud-micro text-muted-foreground/90 transition-colors hover:border-slate-400/35 hover:bg-slate-400/[0.07] hover:text-slate-100/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/30 sm:flex-none sm:px-4"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Log appetite
        </button>
      </div>

      <div className="space-y-2">
        <p className="type-hud-caption">Injection frequency</p>
        <div className="flex flex-wrap gap-2">
          {INJECTION_INTERVAL_PRESETS.map((days) => (
            <GlassChip
              key={days}
              selected={intervalDays === days && customInterval === ""}
              onClick={() => setIntervalDays(days)}
            >
              Every {days}d
            </GlassChip>
          ))}
          <GlassChip
            selected={!isPreset || customInterval !== ""}
            onClick={() => {
              setCustomInterval(String(intervalDays))
            }}
          >
            Custom
          </GlassChip>
        </div>
        {(!isPreset || customInterval !== "") && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={30}
              inputMode="numeric"
              value={customInterval || String(intervalDays)}
              onChange={(e) => setCustomInterval(e.target.value)}
              onBlur={commitCustomInterval}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  commitCustomInterval()
                }
              }}
              className="h-9 w-20 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-sm tabular-nums outline-none focus:border-slate-400/40 focus:ring-1 focus:ring-slate-400/20"
              aria-label="Custom interval days"
            />
            <span className="type-hud-caption normal-case tracking-normal text-muted-foreground/60">
              days between shots
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        <p className="type-hud-caption">Schedule</p>
        {lastInjectedAt && nextInjection ? (
          <div className="space-y-2">
            <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full transition-[width] duration-500",
                  nextInjection.overdue
                    ? "bg-negative/80"
                    : nextInjection.dueToday
                      ? "bg-primary/80"
                      : "bg-slate-400/70",
                )}
                style={{ width: `${Math.round(cycleProgress * 100)}%` }}
              />
              {intervalDays <= 10
                ? Array.from({ length: Math.max(0, intervalDays - 1) }, (_, i) => {
                    const pct = ((i + 1) / intervalDays) * 100
                    return (
                      <span
                        key={i}
                        className="absolute top-0 bottom-0 w-px bg-white/15"
                        style={{ left: `${pct}%` }}
                        aria-hidden
                      />
                    )
                  })
                : null}
            </div>
            <div className="flex items-start justify-between gap-2 text-[11px] tabular-nums">
              <div className="min-w-0">
                <p className="text-muted-foreground/50">Last</p>
                <p className="font-medium text-foreground/85">
                  {format(new Date(lastInjectedAt), "MMM d")}
                  {lastDoseMg != null ? ` · ${lastDoseMg} mg` : ""}
                </p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground/50">Cycle</p>
                <p className="font-medium text-foreground/85">
                  {daysSince != null
                    ? `Day ${Math.min(daysSince, intervalDays)}${nextInjection.overdue ? "+" : ""} / ${intervalDays}`
                    : `Every ${intervalDays}d`}
                </p>
              </div>
              <div className="min-w-0 text-right">
                <p className="text-muted-foreground/50">Next due</p>
                <p
                  className={cn(
                    "font-medium",
                    nextInjection.overdue && "text-negative",
                    nextInjection.dueToday && "text-primary",
                    !nextInjection.overdue && !nextInjection.dueToday && "text-foreground/85",
                  )}
                >
                  {nextInjection.nextLabel}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/55">
            Log an injection to start the schedule countdown.
          </p>
        )}
      </div>

      <PeptideHalfLifeMeter
        entries={recentEntries}
        lastDoseMg={lastDoseMg}
        lastInjectedAt={lastInjectedAt}
        compact
      />

      <PeptideHungerMeter
        hungerLogs={hungerLogs}
        doseEntries={recentEntries}
        lastDoseMg={lastDoseMg}
        compact
      />

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="type-hud-caption">Recent injections</p>
          <Link
            href="/peptides"
            className="type-hud-micro text-muted-foreground/55 transition-colors hover:text-foreground/80"
          >
            Full history
          </Link>
        </div>
        {history.length === 0 ? (
          <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/55">
            No shots logged yet.
          </p>
        ) : (
          <ul className="space-y-0 divide-y divide-white/[0.05]">
            {latestEntry ? (
              <li className="py-2 first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold tabular-nums text-foreground/95">
                      {latestEntry.doseMg} mg
                      {latestEntry.injectionSite
                        ? ` · ${injectionSiteLabel(latestEntry.injectionSite)}`
                        : ""}
                    </p>
                    <p className="type-hud-micro normal-case tracking-normal text-muted-foreground/55">
                      {format(new Date(latestEntry.injectedAt), "EEE · MMM d · h:mm a")}
                    </p>
                  </div>
                  <span className="shrink-0 type-hud-micro text-slate-300/70">Latest</span>
                </div>
              </li>
            ) : null}
            {pastDoseCount > 0 ? (
              <li className="py-0">
                <button
                  type="button"
                  aria-expanded={pastWeeksOpen}
                  onClick={() => setPastWeeksOpen((o) => !o)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:bg-white/[0.02]"
                >
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-foreground/80">
                      Past weeks
                    </p>
                    <p className="type-hud-micro normal-case tracking-normal text-muted-foreground/50">
                      {pastWeekGroups.length} week
                      {pastWeekGroups.length === 1 ? "" : "s"} · {pastDoseCount} dose
                      {pastDoseCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform duration-200",
                      pastWeeksOpen && "rotate-180 text-slate-300/70",
                    )}
                    aria-hidden
                  />
                </button>
                <HubCollapse open={pastWeeksOpen}>
                  <div className="space-y-2 border-t border-white/[0.04] pb-2 pt-1">
                    {pastWeekGroups.map((group) => (
                      <div key={group.weekKey} className="space-y-0">
                        <div className="flex items-baseline justify-between gap-2 px-0.5 pt-1.5">
                          <p className="type-hud-micro tabular-nums text-slate-300/70">
                            Week {group.weekNumber}
                          </p>
                          <p className="type-hud-micro normal-case tracking-normal text-muted-foreground/45">
                            week of {group.weekOfLabel}
                          </p>
                        </div>
                        <ul className="divide-y divide-white/[0.04]">
                          {group.entries.map((entry, i) => {
                            const key = entryKey(entry, i)
                            const open = expandedOlderKey === key
                            return (
                              <li key={key} className="py-0">
                                <button
                                  type="button"
                                  aria-expanded={open}
                                  onClick={() =>
                                    setExpandedOlderKey((prev) =>
                                      prev === key ? null : key,
                                    )
                                  }
                                  className="flex w-full items-center justify-between gap-3 py-2 pl-1 text-left transition-colors hover:bg-white/[0.02]"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-[12px] font-medium tabular-nums text-foreground/75">
                                      {format(new Date(entry.injectedAt), "MMM d")}
                                      {" · "}
                                      {entry.doseMg} mg
                                    </p>
                                    <HubCollapse open={open}>
                                      <p className="type-hud-micro normal-case tracking-normal text-muted-foreground/50">
                                        {format(new Date(entry.injectedAt), "EEE · h:mm a")}
                                        {entry.injectionSite
                                          ? ` · ${injectionSiteLabel(entry.injectionSite)}`
                                          : ""}
                                      </p>
                                    </HubCollapse>
                                  </div>
                                  <ChevronDown
                                    className={cn(
                                      "h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                                      open && "rotate-180 text-slate-300/70",
                                    )}
                                    aria-hidden
                                  />
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))}
                    <div className="px-0.5 pt-1">
                      <Link
                        href="/peptides"
                        className="type-hud-micro text-muted-foreground/55 transition-colors hover:text-foreground/80"
                      >
                        Full history →
                      </Link>
                    </div>
                  </div>
                </HubCollapse>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      <LogPeptideInjectionDialog
        open={injectionOpen}
        onOpenChange={setInjectionOpen}
        lastSiteUsed={lastSiteUsed}
        onSaved={() => {
          setInjectionOpen(false)
          bumpHub()
        }}
      />
      <LogPeptideDailyDialog
        open={dailyOpen}
        onOpenChange={setDailyOpen}
        onSaved={() => {
          setDailyOpen(false)
          bumpHub()
        }}
      />
    </div>
  )
}

/* ─── Workouts ───────────────────────────────────────────── */

interface HubRoutineTemplate {
  id: string
  name: string
  exercises: string | HubRoutineExercise[]
  tags?: string | null
  coverImageUrl?: string | null
  sortOrder?: number
}

interface HubRoutineExercise {
  id?: string
  name: string
  notes?: string
  setRows?: Array<{ id?: string; weight?: string; reps?: string }>
  targetSets?: number
  targetReps?: string
  primaryMuscles?: Array<{ name: string; color?: string; code?: string }>
}

function parseHubRoutineExercises(raw: string | HubRoutineExercise[]): HubRoutineExercise[] {
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as HubRoutineExercise[]) : []
  } catch {
    return []
  }
}

function parseHubRoutineTags(raw: string | string[] | null | undefined): string[] {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((t) => String(t).trim()).filter(Boolean))].slice(0, 12)
  }
  if (raw == null || raw === "") return []
  try {
    const a = JSON.parse(raw) as unknown
    if (Array.isArray(a)) return parseHubRoutineTags(a as string[])
  } catch {
    /* fall through */
  }
  if (raw.includes(",")) {
    return [
      ...new Set(
        raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ].slice(0, 12)
  }
  return []
}

function hubRoutinePreview(exs: HubRoutineExercise[]): string {
  if (exs.length === 0) return "No exercises"
  if (exs.length <= 2) return exs.map((e) => e.name).join(" · ")
  return `${exs[0].name} · ${exs[1].name} +${exs.length - 2}`
}

function hubRoutineSetCount(ex: HubRoutineExercise): number {
  if (Array.isArray(ex.setRows) && ex.setRows.length > 0) return ex.setRows.length
  if (typeof ex.targetSets === "number" && Number.isFinite(ex.targetSets)) {
    return Math.max(1, ex.targetSets)
  }
  return 3
}

export function HubWorkoutsExpand({
  weekCount,
  todayCount,
  last7,
  dayLabels,
  recoveryScore,
}: {
  weekCount: number
  todayCount: number
  last7: number[]
  dayLabels: string[]
  recoveryScore: number | null
}) {
  const router = useRouter()
  const [templates, setTemplates] = useState<HubRoutineTemplate[]>([])
  const [templatesStatus, setTemplatesStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  )
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setTemplatesStatus("loading")
    void apiFetch(`/api/workout-templates?_=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((rows: unknown) => {
        if (cancelled) return
        const list = Array.isArray(rows) ? (rows as HubRoutineTemplate[]) : []
        setTemplates(list)
        setTemplatesStatus("ready")
      })
      .catch(() => {
        if (cancelled) return
        setTemplates([])
        setTemplatesStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const met = weekCount >= WEEKLY_WORKOUT_GOAL
  const remaining = Math.max(0, WEEKLY_WORKOUT_GOAL - weekCount)
  const lastSessionIdx = [...last7].reverse().findIndex((v) => v > 0)
  const daysSinceLast =
    lastSessionIdx < 0 ? null : lastSessionIdx === 0 ? 0 : lastSessionIdx

  let lastCue = "No sessions this week"
  if (daysSinceLast === 0) lastCue = "Trained today"
  else if (daysSinceLast === 1) lastCue = "Last session yesterday"
  else if (daysSinceLast != null) lastCue = `Last session ${daysSinceLast}d ago`

  let recoveryCue = "Log recovery when you can"
  if (recoveryScore != null && recoveryScore >= 7) recoveryCue = "Recovery looking solid"
  else if (recoveryScore != null && recoveryScore >= 5) recoveryCue = "Moderate recovery — ease in"
  else if (recoveryScore != null) recoveryCue = "Prioritize recovery today"

  const previewTmpl = previewId
    ? templates.find((t) => t.id === previewId) ?? null
    : null
  const previewExs = previewTmpl
    ? parseHubRoutineExercises(previewTmpl.exercises)
    : []
  const previewTags = previewTmpl ? parseHubRoutineTags(previewTmpl.tags) : []

  function goStartRoutine(id: string) {
    setStartingId(id)
    try {
      sessionStorage.setItem("theGRID_hubStartWorkout", id)
    } catch {
      /* private mode */
    }
    router.push(`/workouts?start=${encodeURIComponent(id)}`)
  }

  function goStartFreeForm() {
    setStartingId("free")
    try {
      sessionStorage.setItem("theGRID_hubStartWorkout", "free")
    } catch {
      /* private mode */
    }
    router.push("/workouts?start=free")
  }

  return (
    <div className="space-y-4 px-0.5">
      <div className="min-w-0">
          <p className="type-hud-subsection">Workouts</p>
          <p className="mt-1 type-hud-caption normal-case tracking-normal text-muted-foreground/70">
            {met
              ? `Goal met · ${weekCount} this week`
              : `${weekCount}/${WEEKLY_WORKOUT_GOAL} this week`}
            {todayCount > 0 ? ` · ${todayCount} today` : ""}
          </p>
      </div>

      <div className="flex items-center gap-4">
        <WeekWorkoutGoalRing count={weekCount} size="lg" color="#c4d632" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <div className="min-w-0">
              <p className="type-hud-micro text-muted-foreground/55">Week</p>
              <p
                className="type-hud-stat-sm tabular-nums"
                style={met ? { color: "#c4d632" } : undefined}
              >
                {weekCount}/{WEEKLY_WORKOUT_GOAL}
              </p>
            </div>
            <div className="min-w-0">
              <p className="type-hud-micro text-muted-foreground/55">Recovery</p>
              <p className="type-hud-stat-sm tabular-nums text-foreground/85">
                {recoveryScore != null ? `${recoveryScore}/10` : "—"}
              </p>
            </div>
          </div>
          <p className="type-hud-caption normal-case tracking-normal text-foreground/80">
            {lastCue}
          </p>
          <p className="type-hud-micro normal-case tracking-normal text-muted-foreground/55">
            {recoveryCue}
            {!met && remaining > 0 ? ` · ${remaining} more to goal` : ""}
          </p>
        </div>
      </div>

      <div
        className="pointer-events-none h-px bg-gradient-to-r from-transparent via-white/8 to-transparent"
        aria-hidden
      />

      <div className="space-y-2">
        <p className="type-hud-caption">Sessions · last 7</p>
        <div className="flex items-end justify-between gap-1" style={{ height: 44 }}>
          {last7.map((v, i) => {
            const max = Math.max(...last7, 1)
            const h = Math.max(4, Math.round((v / max) * 40))
            const isToday = i === last7.length - 1
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div
                  className="w-[70%] max-w-[18px] rounded-sm"
                  style={{
                    height: h,
                    background: isToday
                      ? "linear-gradient(180deg, #e8f07a, #a3b01a)"
                      : "linear-gradient(180deg, #c4d63288, #6b751888)",
                  }}
                />
                <span
                  className={cn(
                    "type-hud-micro",
                    isToday ? "text-[#c4d632]" : "text-muted-foreground/45",
                  )}
                >
                  {dayLabels[i] ?? ""}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div
        className="pointer-events-none h-px bg-gradient-to-r from-transparent via-white/8 to-transparent"
        aria-hidden
      />

      <ProgressionSummaryHero variant="hud" />

      <div
        className="pointer-events-none h-px bg-gradient-to-r from-transparent via-white/8 to-transparent"
        aria-hidden
      />

      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="type-hud-caption">Routines</p>
          <div className="flex items-center gap-2">
            {templatesStatus === "ready" && templates.length > 0 ? (
              <span className="type-hud-micro tabular-nums text-muted-foreground/50">
                {templates.length}
              </span>
            ) : null}
            <Link
              href="/workouts?newRoutine=1"
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 type-hud-micro text-muted-foreground/80 transition-colors hover:border-[#c4d632]/35 hover:text-[#e8f07a]"
            >
              <Plus className="size-3" aria-hidden />
              New
            </Link>
          </div>
        </div>

        {templatesStatus === "loading" ? (
          <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/55">
            Loading routines…
          </p>
        ) : null}
        {templatesStatus === "error" ? (
          <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/55">
            Couldn&apos;t load routines.{" "}
            <button
              type="button"
              onClick={() => {
                setTemplatesStatus("loading")
                void apiFetch(`/api/workout-templates?_=${Date.now()}`, { cache: "no-store" })
                  .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
                  .then((rows: unknown) => {
                    const list = Array.isArray(rows) ? (rows as HubRoutineTemplate[]) : []
                    setTemplates(list)
                    setTemplatesStatus("ready")
                  })
                  .catch(() => {
                    setTemplates([])
                    setTemplatesStatus("error")
                  })
              }}
              className="text-foreground/75 underline-offset-2 hover:underline hover:text-[#e8f07a]"
            >
              Retry
            </button>
          </p>
        ) : null}
        {templatesStatus === "ready" && templates.length === 0 ? (
          <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/55">
            No routines yet — tap New above, or start free-form below.
          </p>
        ) : null}

        {templates.length > 0 ? (
          <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 sm:gap-3.5">
            {templates.map((tmpl) => {
              const exs = parseHubRoutineExercises(tmpl.exercises)
              const tags = parseHubRoutineTags(tmpl.tags)
              const cover = tmpl.coverImageUrl?.trim()
              const preview = hubRoutinePreview(exs)
              const busy = startingId === tmpl.id
              return (
                <div
                  key={tmpl.id}
                  data-routine-tile={tmpl.id}
                  className="group flex h-full min-h-0 flex-col overflow-hidden rounded-2xl"
                >
                  <div className="relative aspect-square w-full shrink-0 border-b border-white/[0.08] bg-white/[0.03]">
                    <button
                      type="button"
                      onClick={() => setPreviewId(tmpl.id)}
                      className="absolute inset-0 text-left touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c4d632]/30"
                      aria-label={`Preview ${tmpl.name}`}
                    >
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cover}
                          alt=""
                          className="absolute inset-0 size-full object-cover pointer-events-none transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-gradient-to-br from-white/[0.06] via-transparent to-[#c4d632]/[0.06] pointer-events-none">
                          <Dumbbell
                            className="size-[clamp(2rem,32%,2.75rem)] text-muted-foreground/20"
                            aria-hidden
                          />
                        </div>
                      )}
                    </button>
                    <div className="absolute left-1.5 top-1.5 z-20 sm:left-2 sm:top-2">
                      <Link
                        href={`/workouts?editRoutine=${encodeURIComponent(tmpl.id)}`}
                        className="inline-flex rounded-lg border border-white/15 bg-background/55 p-1.5 text-muted-foreground/80 shadow-sm backdrop-blur-md transition-colors hover:border-[#c4d632]/35 hover:bg-background/75 hover:text-[#e8f07a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4d632]/30 touch-manipulation"
                        aria-label={`Edit ${tmpl.name}`}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </Link>
                    </div>
                  </div>
                  <div className="flex min-h-[6.5rem] flex-1 flex-col gap-1.5 p-2.5 pt-2 sm:min-h-[7rem] sm:p-3">
                    <div className="min-h-0 min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => setPreviewId(tmpl.id)}
                          className="line-clamp-2 min-w-0 flex-1 text-left text-sm font-semibold leading-snug text-foreground/95 touch-manipulation hover:text-[#e8f07a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4d632]/30 sm:text-base"
                        >
                          {tmpl.name}
                        </button>
                        {tags.length > 0 ? (
                          <div className="flex max-w-[38%] shrink-0 flex-wrap items-center justify-end gap-1 min-w-0 sm:max-w-[36%]">
                            {tags.map((tg, ti) => (
                              <span
                                key={`${tg}-${ti}`}
                                className="inline-flex min-w-0 max-w-[min(100%,3.75rem)] items-center truncate rounded-md border border-[#c4d632]/25 bg-[#c4d632]/12 px-1.5 py-0.5 text-left text-[8px] font-semibold leading-tight tracking-normal text-[#e8f07a] sm:max-w-[4.25rem] sm:px-2 sm:py-1 sm:text-[9px]"
                              >
                                {tg}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <p
                        className="line-clamp-2 type-hud-micro normal-case tracking-normal leading-relaxed text-muted-foreground/55"
                        title={exs.map((e) => e.name).join(", ")}
                      >
                        {preview}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={startingId != null}
                      onClick={() => goStartRoutine(tmpl.id)}
                      className="mt-auto inline-flex h-8 w-full shrink-0 items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 type-hud-micro text-muted-foreground/90 transition-colors hover:border-[#c4d632]/35 hover:bg-[#c4d632]/[0.06] hover:text-[#e8f07a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4d632]/30 disabled:opacity-50 touch-manipulation sm:h-9"
                    >
                      <Play className="size-3 shrink-0" aria-hidden />
                      {busy ? "…" : "Start"}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>

      <div
        className="pointer-events-none h-px bg-gradient-to-r from-transparent via-white/8 to-transparent"
        aria-hidden
      />

      <div className="space-y-2">
        <p className="type-hud-caption">Free-form</p>
        <button
          type="button"
          disabled={startingId != null}
          onClick={goStartFreeForm}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] type-hud-micro text-muted-foreground/90 transition-colors hover:border-[#c4d632]/35 hover:bg-[#c4d632]/[0.06] hover:text-[#e8f07a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4d632]/30 disabled:opacity-50 touch-manipulation"
        >
          <Play className="h-3.5 w-3.5" aria-hidden />
          {startingId === "free" ? "Starting…" : "Start empty workout"}
        </button>
        <p className="type-hud-micro normal-case tracking-normal leading-relaxed text-muted-foreground/45">
          Opens the active workout flow — pick upper/lower for a recommended session, or add
          exercises manually.
        </p>
      </div>

      <Dialog open={previewTmpl != null} onOpenChange={(open) => !open && setPreviewId(null)}>
        <DialogContent
          showCloseButton
          className={cn(
            "glass-frost max-w-md gap-0 p-0",
            "[&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3",
          )}
        >
          {previewTmpl ? (
            <div className="max-h-[82dvh] overflow-y-auto overscroll-contain">
              {previewTmpl.coverImageUrl?.trim() ? (
                <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-white/[0.06] bg-muted/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewTmpl.coverImageUrl.trim()}
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                  />
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background/80 to-transparent"
                    aria-hidden
                  />
                </div>
              ) : null}
              <div className="space-y-1 px-4 pb-2 pt-4 pr-12">
                <DialogHeader className="space-y-1 text-left">
                  <DialogTitle className="type-hud-title normal-case tracking-[0.08em]">
                    {previewTmpl.name}
                  </DialogTitle>
                  <DialogDescription className="type-hud-caption normal-case tracking-normal text-muted-foreground/65">
                    {previewExs.length} exercise{previewExs.length === 1 ? "" : "s"}
                    {previewTags.length > 0 ? ` · ${previewTags.join(" · ")}` : ""}
                  </DialogDescription>
                </DialogHeader>
              </div>
              <div className="px-4 pb-4">
                {previewExs.length === 0 ? (
                  <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/60">
                    No exercises in this routine.
                  </p>
                ) : (
                  <div className="divide-y divide-white/[0.05] border-y border-white/[0.05]">
                    {previewExs.map((ex, i) => {
                      const sets = hubRoutineSetCount(ex)
                      const reps =
                        Array.isArray(ex.setRows) && ex.setRows[0]?.reps
                          ? String(ex.setRows[0].reps)
                          : ex.targetReps
                            ? String(ex.targetReps)
                            : null
                      const muscles = (ex.primaryMuscles ?? [])
                        .map((m) => m.name)
                        .filter(Boolean)
                        .slice(0, 3)
                      return (
                        <div key={ex.id ?? `${ex.name}-${i}`} className="py-2.5">
                          <p className="text-[13px] font-semibold text-foreground/90">{ex.name}</p>
                          <p className="mt-0.5 type-hud-caption normal-case tracking-normal tabular-nums text-muted-foreground/60">
                            {sets} set{sets === 1 ? "" : "s"}
                            {reps ? ` · ${reps} reps` : ""}
                            {muscles.length > 0 ? ` · ${muscles.join(", ")}` : ""}
                          </p>
                          {ex.notes?.trim() ? (
                            <p className="mt-1 type-hud-micro normal-case tracking-normal text-muted-foreground/50">
                              {ex.notes}
                            </p>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    disabled={startingId != null}
                    onClick={() => {
                      setPreviewId(null)
                      goStartRoutine(previewTmpl.id)
                    }}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] type-hud-micro text-muted-foreground/90 transition-colors hover:border-[#c4d632]/35 hover:bg-[#c4d632]/[0.06] hover:text-[#e8f07a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4d632]/30 disabled:opacity-50 touch-manipulation"
                  >
                    <Play className="size-3.5" aria-hidden />
                    Start this routine
                  </button>
                  <Link
                    href={`/workouts?editRoutine=${encodeURIComponent(previewTmpl.id)}`}
                    onClick={() => setPreviewId(null)}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] type-hud-micro text-muted-foreground/90 transition-colors hover:border-[#c4d632]/30 hover:text-[#e8f07a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4d632]/30"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    Edit routine
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
