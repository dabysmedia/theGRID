"use client"

import { FoodTimeline, MacroRow, type SlotTotals } from "@/components/calories/FoodTimeline"
import type { CalorieEntry } from "@/lib/calories/log-food"
import type { FrequentFoodSuggestion } from "@/lib/calories/frequent-foods"
import type { MealSlot } from "@/lib/calories/meal-slots"
import { cn } from "@/lib/utils"

/**
 * Everything below the calories ring.
 *
 * Intake vs. goal and daily progress are already on the ring itself, so this
 * panel says only what the ring cannot: the day's macros, then the timeline.
 * Adding food happens from a block's own + button, not a separate button here.
 */
export function CaloriesFocusPanel({
  consumed,
  target,
  entries,
  dayTotals,
  status,
  currentSlot,
  suggestions,
  quickAddPendingId,
  onAdd,
  onEditBlock,
  onQuickAdd,
  onRetry,
}: {
  consumed: number
  target: number
  entries: CalorieEntry[]
  dayTotals: SlotTotals
  status: "loading" | "ready" | "error"
  currentSlot: MealSlot
  suggestions: Partial<Record<MealSlot, FrequentFoodSuggestion[]>>
  quickAddPendingId: string | null
  onAdd: (slot: MealSlot) => void
  onEditBlock: (slot: MealSlot) => void
  onQuickAdd: (slot: MealSlot, food: FrequentFoodSuggestion) => void
  onRetry: () => void
}) {
  const remaining = Math.max(0, target - consumed)
  const overTarget = Math.max(0, consumed - target)

  return (
    <div className="pointer-events-auto mt-3 motion-safe:animate-fade-up motion-reduce:animate-none">
      <section aria-label="Food timeline">
        <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-white/[0.07] px-0.5 pb-2.5 sm:px-1">
          <h3 className="type-hud-subsection text-foreground/80">Today&apos;s timeline</h3>
          {status === "ready" && entries.length > 0 ? (
            <MacroRow totals={dayTotals} />
          ) : (
            <p className="type-hud-caption normal-case tracking-normal">
              Morning · Afternoon · Evening
            </p>
          )}
        </header>

        {status === "ready" && entries.length > 0 ? (
          <p className="px-0.5 pt-2 type-hud-caption normal-case tracking-normal tabular-nums sm:px-1">
            {overTarget > 0
              ? `${overTarget.toLocaleString()} cal over target`
              : `${remaining.toLocaleString()} cal left today`}
          </p>
        ) : null}

        {/* Only the food scrolls — the heading and the day's totals above it
            stay put, so the numbers never leave the screen. */}
        <div
          className={cn(
            "mt-3 min-h-0 max-h-[min(58vh,34rem)] overflow-y-auto overscroll-contain",
            "pr-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]",
          )}
        >
          <FoodTimeline
            entries={entries}
            status={status}
            currentSlot={currentSlot}
            suggestions={suggestions}
            quickAddPendingId={quickAddPendingId}
            onAdd={onAdd}
            onEditBlock={onEditBlock}
            onQuickAdd={onQuickAdd}
            onRetry={onRetry}
          />
        </div>
      </section>
    </div>
  )
}
