"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { CaloriesFocusPanel } from "@/components/calories/CaloriesFocusPanel"
import { LogFoodDialog } from "@/components/calories/LogFoodDialog"
import { totalsForEntries } from "@/components/calories/FoodTimeline"
import { Button } from "@/components/ui/button"
import { useActiveDate } from "@/context/DateContext"
import { apiFetch } from "@/lib/api-fetch"
import type { CalorieEntry, DraftMealItem } from "@/lib/calories/log-food"
import type { FrequentFoodSuggestion } from "@/lib/calories/frequent-foods"
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABEL,
  currentMealSlot,
  resolveMealSlot,
  type MealSlot,
} from "@/lib/calories/meal-slots"

type SuggestionMap = Partial<Record<MealSlot, FrequentFoodSuggestion[]>>

/**
 * Calories expand chrome around the overview rings-row dial.
 *
 * The ProgressRing stays in WeeklyHero (same Y) and slides horizontally; this
 * shell owns everything below it — the intake header and the Morning /
 * Afternoon / Evening timeline. It must not nest a duplicate dial (see
 * `.cursor/rules/hub-expand-motion.mdc`).
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

  const [entries, setEntries] = useState<CalorieEntry[]>([])
  const [entriesStatus, setEntriesStatus] = useState<"loading" | "ready" | "error">("loading")
  const [suggestions, setSuggestions] = useState<SuggestionMap>({})
  const [logFoodOpen, setLogFoodOpen] = useState(false)
  const [targetSlot, setTargetSlot] = useState<MealSlot | null>(null)
  const [composerSession, setComposerSession] = useState(0)
  const [editingEntry, setEditingEntry] = useState<CalorieEntry | null>(null)
  const [draftMealItems, setDraftMealItems] = useState<DraftMealItem[]>([])
  const [quickAddPendingId, setQuickAddPendingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null)
  const [pendingDeleteBusy, setPendingDeleteBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // The block being lived in right now — where a bare "Add food" lands, and
  // which row the timeline marks as Now.
  const [nowSlot, setNowSlot] = useState<MealSlot>(() => currentMealSlot())
  useEffect(() => {
    const tick = window.setInterval(() => setNowSlot(currentMealSlot()), 60_000)
    return () => window.clearInterval(tick)
  }, [])

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

  const loadSuggestions = useCallback(() => {
    let cancelled = false
    void apiFetch(`/api/calories/frequent?slots=${MEAL_SLOTS.join(",")}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((data: unknown) => {
        if (cancelled || data == null || typeof data !== "object") return
        setSuggestions(data as SuggestionMap)
      })
      .catch(() => {
        if (!cancelled) setSuggestions({})
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => loadSuggestions(), [loadSuggestions, reloadKey])

  useEffect(() => {
    if (!pendingDelete) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pendingDeleteBusy) setPendingDelete(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pendingDelete, pendingDeleteBusy])

  const dayTotals = useMemo(() => totalsForEntries(entries), [entries])

  function bumpHub() {
    window.dispatchEvent(new CustomEvent("grid:log-saved"))
  }

  function openAddFood(slot: MealSlot) {
    setEditingEntry(null)
    setTargetSlot(slot)
    setDraftMealItems([])
    setComposerSession((session) => session + 1)
    setLogFoodOpen(true)
  }

  function startEdit(entry: CalorieEntry) {
    setTargetSlot(null)
    setEditingEntry(entry)
    setLogFoodOpen(true)
  }

  /**
   * One tap logs a food the user already eats in this block, at the portion
   * they last used — no composer, no search.
   */
  async function quickAdd(slot: MealSlot, food: FrequentFoodSuggestion) {
    if (vacationBlocked || quickAddPendingId) return
    setQuickAddPendingId(food.id)
    try {
      const res = await apiFetch("/api/calories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: activeDate,
          mealSlot: slot,
          description: food.name,
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
          imageUrl: food.imageUrl,
          portionAmount: food.portionAmount,
          portionUnit: food.portionUnit,
        }),
      })
      if (res.ok) {
        const created = (await res.json()) as CalorieEntry
        setEntries((prev) => [created, ...prev])
        bumpHub()
      }
    } catch {
      // Leave the log untouched; the chip stays available to retry.
    } finally {
      setQuickAddPendingId(null)
    }
  }

  function requestDelete(entry: CalorieEntry) {
    const summary =
      entry.description?.trim() ||
      `${entry.calories} cal · ${MEAL_SLOT_LABEL[resolveMealSlot(entry)]}`
    const detail = summary.length > 90 ? `${summary.slice(0, 90)}…` : summary
    setPendingDelete({ id: entry.id, label: detail })
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
        dayTotals={dayTotals}
        status={entriesStatus}
        currentSlot={nowSlot}
        suggestions={suggestions}
        quickAddPendingId={quickAddPendingId}
        onAdd={openAddFood}
        onEditEntry={startEdit}
        onDeleteEntry={requestDelete}
        onQuickAdd={(slot, food) => void quickAdd(slot, food)}
        onRetry={() => setReloadKey((key) => key + 1)}
      />

      <LogFoodDialog
        key={`food-composer-${composerSession}`}
        open={logFoodOpen}
        onOpenChange={(open) => {
          setLogFoodOpen(open)
          if (!open) {
            setEditingEntry(null)
            setTargetSlot(null)
          }
        }}
        initialMealSlot={targetSlot}
        // Tapping + on a block always lands on food search — the draft starts
        // empty, so the review screen would just be an extra tap past nothing.
        startInFoodSearch={editingEntry == null && targetSlot != null}
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
                  This will remove{" "}
                  <span className="font-medium text-foreground">
                    &quot;{pendingDelete.label}&quot;
                  </span>{" "}
                  from your history. This cannot be undone.
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
