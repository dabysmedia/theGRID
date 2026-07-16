"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { CaloriesPipField } from "@/components/calories/CaloriesPipField"
import { CaloriesFocusPanel } from "@/components/calories/CaloriesFocusPanel"
import { LogFoodDialog } from "@/components/calories/LogFoodDialog"
import { MealTypePickerDialog } from "@/components/calories/MealTypePickerDialog"
import type { EditingMeal } from "@/components/calories/useLogFoodDialog"
import { Button } from "@/components/ui/button"
import { HUB_MOTION_MS } from "@/components/hub/HubMotion"
import { useActiveDate } from "@/context/DateContext"
import { apiFetch } from "@/lib/api-fetch"
import type { CalorieEntry, DraftMealItem } from "@/lib/calories/log-food"
import { mealTypes } from "@/lib/calories/log-food"
import { cn } from "@/lib/utils"

/** Steel-HUD meal accents — coral calorie family + cool steel, no purple. */
const MEAL_ACCENT: Record<
  string,
  { bar: string; wash: string; label: string; cal: string }
> = {
  breakfast: {
    bar: "#f59e0b",
    wash: "oklch(0.72 0.14 75 / 10%)",
    label: "#fbbf24",
    cal: "#fcd34d",
  },
  lunch: {
    bar: "#38bdf8",
    wash: "oklch(0.72 0.1 230 / 10%)",
    label: "#7dd3fc",
    cal: "#bae6fd",
  },
  dinner: {
    bar: "#f87171",
    wash: "oklch(0.68 0.16 25 / 11%)",
    label: "#fca5a5",
    cal: "#fecaca",
  },
  snack: {
    bar: "#94a3b8",
    wash: "oklch(0.7 0.02 250 / 10%)",
    label: "#cbd5e1",
    cal: "#e2e8f0",
  },
}

const DEFAULT_MEAL_ACCENT = {
  bar: "#ef4444",
  wash: "oklch(0.65 0.18 25 / 10%)",
  label: "#fca5a5",
  cal: "#fecaca",
} as const

function mealAccent(meal: string) {
  return MEAL_ACCENT[meal.toLowerCase().trim()] ?? DEFAULT_MEAL_ACCENT
}

/**
 * Calories expand chrome around the overview rings-row dial.
 *
 * The ProgressRing stays in WeeklyHero (same Y) and slides horizontally;
 * this shell paints intake (upper-left under Overview), a flat food rail,
 * and the pip field — no nested dial cell, no double-boxed food panel.
 *
 * Layout contract with WeeklyHero:
 * - Parent is `relative` and includes the rings band + this shell.
 * - Intake/food are absolutely positioned from the parent top (rings Y).
 * - Pips sit in normal flow below the rings band and grow the parent so
 *   the food rail can span full height.
 */
export function CaloriesExpandShell({
  consumed,
  target,
  vacationBlocked,
}: {
  consumed: number
  target: number
  vacationBlocked?: boolean
}) {
  const { activeDate } = useActiveDate()
  const remaining = Math.max(0, target - consumed)
  const pct = target > 0 ? Math.round((consumed / target) * 100) : 0

  const [entries, setEntries] = useState<CalorieEntry[]>([])
  const [entriesStatus, setEntriesStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  )
  const [mealPickerOpen, setMealPickerOpen] = useState(false)
  const [logFoodOpen, setLogFoodOpen] = useState(false)
  const [preferredMealType, setPreferredMealType] = useState<string | null>(null)
  const [composerSession, setComposerSession] = useState(0)
  const [editingEntry, setEditingEntry] = useState<CalorieEntry | null>(null)
  const [editingMeal, setEditingMeal] = useState<EditingMeal | null>(null)
  const [draftMealItems, setDraftMealItems] = useState<DraftMealItem[]>([])
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    label: string
  } | null>(null)
  const [pendingDeleteBusy, setPendingDeleteBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setEntriesStatus("loading")
    void apiFetch(`/api/calories?date=${activeDate}&_=${Date.now()}`, {
      cache: "no-store",
    })
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

  function bumpHub() {
    window.dispatchEvent(new CustomEvent("grid:log-saved"))
  }

  function openAddFood(mealType?: string) {
    setEditingEntry(null)
    setEditingMeal(null)
    setPreferredMealType(mealType ?? null)
    setMealPickerOpen(true)
  }

  function chooseMeal(mealType: (typeof mealTypes)[number]) {
    setPreferredMealType(mealType)
    setDraftMealItems([])
    setComposerSession((session) => session + 1)
    setMealPickerOpen(false)
    setLogFoodOpen(true)
  }

  function startEdit(entry: CalorieEntry) {
    setEditingMeal(null)
    setPreferredMealType(null)
    setEditingEntry(entry)
    setLogFoodOpen(true)
  }

  function startEditMeal(mealType: string, mealEntries: CalorieEntry[]) {
    setEditingEntry(null)
    setPreferredMealType(null)
    setEditingMeal({ mealType, entries: mealEntries })
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

  if (vacationBlocked) {
    return (
      <div className="space-y-3 px-0.5">
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
    )
  }

  return (
    <>
      <CaloriesFocusPanel
        consumed={consumed}
        target={target}
        entries={entries}
        mealGroups={mealGroups}
        status={entriesStatus}
        onAdd={openAddFood}
        onEditMeal={startEditMeal}
        onRetry={() => setReloadKey((key) => key + 1)}
        onDelete={(entry) =>
          requestDelete(
            entry.id,
            entry.description?.trim() || `${entry.calories} cal · ${entry.mealType}`,
          )
        }
      />

      {false ? (
      <>
      {/* UPPER LEFT — intake + Add food, under Overview back (rings-row top) */}
      <div
        className={cn(
          "pointer-events-auto absolute left-0 top-0 z-20 w-[min(32%,11.5rem)] max-w-[11.5rem] pl-1 pt-1",
          "motion-safe:animate-fade-up motion-reduce:animate-none",
        )}
        style={{ animationDuration: `${HUB_MOTION_MS}ms` }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
          Intake
        </p>
        <p className="mt-0.5 text-[14px] font-semibold tabular-nums leading-snug tracking-tight sm:text-[15px]">
          <span className="text-red-200/95">{consumed.toLocaleString()}</span>
          <span className="font-medium text-muted-foreground/55">
            {` of ${target.toLocaleString()}`}
          </span>
        </p>
        <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground/65">
          {`${remaining.toLocaleString()} left`}
          <span className="mx-1.5 text-muted-foreground/35">·</span>
          <span className="font-semibold text-red-300/85">{pct}%</span>
        </p>
        <button
          type="button"
          onClick={() => openAddFood()}
          className={cn(
            "mt-2.5 inline-flex h-9 w-full items-center justify-center gap-1.5",
            "rounded-xl border border-red-400/40 bg-[oklch(0.16_0.03_25/72%)] px-3",
            "type-hud-micro font-semibold tracking-wide text-red-50",
            "shadow-[0_6px_22px_oklch(0.05_0.01_250/40%)] backdrop-blur-md",
            "transition-[border-color,background-color,transform] duration-200",
            "hover:border-red-400/60 hover:bg-red-400/[0.18] active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/35",
          )}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add food
        </button>
      </div>

      {/* RIGHT — flat Today's food (hairline only, no nested card).
          left edge clears the centered dial (50% + half ring). */}
      <aside
        className={cn(
          "pointer-events-auto absolute bottom-0 right-0 top-0 z-20 flex min-w-0 flex-col",
          "left-[calc(50%+3.6rem)] border-l border-white/[0.08] pl-3 sm:left-[calc(50%+4rem)] sm:pl-3.5",
          "motion-safe:animate-fade-up motion-reduce:animate-none",
        )}
        style={{ animationDuration: `${HUB_MOTION_MS}ms` }}
        aria-label="Today's food"
      >
        <div className="flex shrink-0 items-baseline justify-between gap-2 pb-2 pt-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/90">
            Today&apos;s food
          </p>
          {entriesStatus === "ready" && entries.length > 0 ? (
            <span className="text-[12px] font-semibold tabular-nums text-red-300/85">
              {entries.reduce((s, e) => s + e.calories, 0).toLocaleString()}
              <span className="ml-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                cal
              </span>
            </span>
          ) : null}
        </div>
        <div
          className="pointer-events-none h-px shrink-0 bg-gradient-to-r from-white/12 via-white/8 to-transparent"
          aria-hidden
        />

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2.5 pr-0.5 [-webkit-overflow-scrolling:touch]">
          {entriesStatus === "loading" ? (
            <p className="text-[12px] leading-relaxed text-muted-foreground/65">
              Loading food log…
            </p>
          ) : null}
          {entriesStatus === "error" ? (
            <p className="text-[12px] leading-relaxed text-muted-foreground/65">
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
            <p className="text-[12px] leading-relaxed text-muted-foreground/65">
              Nothing logged yet — tap Add food.
            </p>
          ) : null}

          {entriesStatus === "ready" && mealGroups.length > 0 ? (
            <div className="space-y-3.5 pb-1">
              {mealGroups.map(({ meal, items, total }) => {
                const accent = mealAccent(meal)
                return (
                  <div
                    key={meal}
                    className="min-w-0 motion-safe:animate-fade-up motion-reduce:animate-none"
                    style={{ animationDuration: `${HUB_MOTION_MS}ms` }}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className="h-3 w-0.5 shrink-0 rounded-full"
                        style={{ background: accent.bar }}
                        aria-hidden
                      />
                      <p
                        className="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
                        style={{ color: accent.label }}
                      >
                        {meal}
                      </p>
                      <span
                        className="shrink-0 text-[11px] font-bold tabular-nums"
                        style={{ color: accent.cal }}
                      >
                        {total.toLocaleString()}
                      </span>
                    </div>
                    <ul className="space-y-0">
                      {items.map((entry) => (
                        <li
                          key={entry.id}
                          className="group/row flex items-stretch gap-1 border-t border-white/[0.06] py-2 first:border-t-0 first:pt-0.5"
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
                            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="text-[12px] font-semibold tabular-nums text-red-200/90">
                                {entry.calories.toLocaleString()}
                                <span className="ml-0.5 text-[10px] font-medium text-muted-foreground/50">
                                  cal
                                </span>
                              </span>
                              {(entry.protein != null ||
                                entry.carbs != null ||
                                entry.fat != null) && (
                                <span className="text-[10px] tabular-nums text-muted-foreground/50">
                                  {[
                                    entry.protein != null
                                      ? `P ${entry.protein}g`
                                      : null,
                                    entry.carbs != null
                                      ? `C ${entry.carbs}g`
                                      : null,
                                    entry.fat != null ? `F ${entry.fat}g` : null,
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
                              className="history-row-edit !m-0 !min-h-9 !min-w-9"
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
                              className="history-row-delete-row !m-0 !min-h-9 !min-w-9"
                              aria-label={`Delete ${entry.description?.trim() || entry.calories + " cal"}`}
                            >
                              <Trash2 />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      </aside>

      {/* Flow block below rings — grows parent height for the food rail */}
      <div
        className={cn(
          "pointer-events-auto min-h-[min(42vh,18rem)] pt-2 sm:min-h-[min(38vh,20rem)]",
          "pr-[max(0px,calc(50%-3.6rem))] sm:pr-[max(0px,calc(50%-4rem))]",
          "motion-safe:animate-fade-up motion-reduce:animate-none",
        )}
        style={{ animationDuration: `${HUB_MOTION_MS + 80}ms` }}
      >
        <div className="h-full min-h-[11rem] overflow-hidden rounded-xl border border-white/[0.05] bg-[oklch(0.1_0.012_250/35%)]">
          <CaloriesPipField
            consumed={consumed}
            target={target}
            className="h-full min-h-[11rem]"
          />
        </div>
      </div>
      </>
      ) : null}

      <MealTypePickerDialog
        open={mealPickerOpen}
        onOpenChange={setMealPickerOpen}
        onSelect={chooseMeal}
        suggestedMealType={preferredMealType}
      />

      <LogFoodDialog
        key={
          editingMeal
            ? `meal-${editingMeal.mealType}`
            : `food-composer-${composerSession}`
        }
        open={logFoodOpen}
        onOpenChange={(open) => {
          setLogFoodOpen(open)
          if (!open) {
            if (editingMeal) setDraftMealItems([])
            setEditingEntry(null)
            setEditingMeal(null)
            setPreferredMealType(null)
          }
        }}
        initialMealType={preferredMealType}
        editingEntry={editingEntry}
        onEditingEntryChange={setEditingEntry}
        editingMeal={editingMeal}
        onEditingMealChange={setEditingMeal}
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
        onMealUpdated={(updated, previousIds) => {
          const previousIdSet = new Set(previousIds)
          setEntries((current) => [
            ...updated,
            ...current.filter((entry) => !previousIdSet.has(entry.id)),
          ])
          setEditingMeal(null)
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
  )
}
