"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CaloriesFocusPanel } from "@/components/calories/CaloriesFocusPanel"
import { LogFoodDialog } from "@/components/calories/LogFoodDialog"
import type { EditingMeal } from "@/components/calories/useLogFoodDialog"
import { totalsForEntries } from "@/components/calories/FoodTimeline"
import { useActiveDate } from "@/context/DateContext"
import { apiFetch } from "@/lib/api-fetch"
import type { CalorieEntry, DraftMealItem } from "@/lib/calories/log-food"
import type { FrequentFoodSuggestion } from "@/lib/calories/frequent-foods"
import {
  MEAL_SLOTS,
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
  const [editingMeal, setEditingMeal] = useState<EditingMeal | null>(null)
  const [draftMealItems, setDraftMealItems] = useState<DraftMealItem[]>([])
  const [quickAddPendingId, setQuickAddPendingId] = useState<string | null>(null)
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
    const refresh = () => { loadSuggestions() }
    window.addEventListener("grid:food-suggestions-changed", refresh)
    return () => window.removeEventListener("grid:food-suggestions-changed", refresh)
  }, [loadSuggestions])

  const dayTotals = useMemo(() => totalsForEntries(entries), [entries])

  function bumpHub() {
    window.dispatchEvent(new CustomEvent("grid:log-saved"))
  }

  function openAddFood(slot: MealSlot) {
    setEditingEntry(null)
    setEditingMeal(null)
    setTargetSlot(slot)
    setDraftMealItems([])
    setComposerSession((session) => session + 1)
    setLogFoodOpen(true)
  }

  /**
   * Opens a whole block for editing: every food in it becomes an editable
   * line, so quantities, removals, and additions are all one screen.
   */
  function openEditBlock(slot: MealSlot) {
    const slotEntries = entries.filter((entry) => resolveMealSlot(entry) === slot)
    if (slotEntries.length === 0) {
      openAddFood(slot)
      return
    }
    setEditingEntry(null)
    setTargetSlot(slot)
    setDraftMealItems([])
    setEditingMeal({ mealSlot: slot, entries: slotEntries })
    setComposerSession((session) => session + 1)
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
        onEditBlock={openEditBlock}
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
            setEditingMeal(null)
            setDraftMealItems([])
            setTargetSlot(null)
          }
        }}
        initialMealSlot={targetSlot}
        // Adding lands on food search — the draft starts empty, so a review
        // screen would just be an extra tap past nothing. Editing a block
        // opens on that block's contents instead.
        startInFoodSearch={
          editingEntry == null && editingMeal == null && targetSlot != null
        }
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
          const replaced = new Set(previousIds)
          setEntries((current) => [
            ...updated,
            ...current.filter((entry) => !replaced.has(entry.id)),
          ])
          setEditingMeal(null)
          setLogFoodOpen(false)
          bumpHub()
        }}
      />

    </>
  )
}
