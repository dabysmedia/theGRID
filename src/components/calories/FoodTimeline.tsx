"use client"
/* eslint-disable @next/next/no-img-element -- food art comes from user uploads and food databases */

import { useMemo } from "react"
import { Loader2, Pencil, Plus, Utensils } from "lucide-react"
import { FoodFallbackIcon } from "@/components/calories/FoodFallbackIcon"
import type { CalorieEntry } from "@/lib/calories/log-food"
import type { FrequentFoodSuggestion } from "@/lib/calories/frequent-foods"
import { formatFoodPortion } from "@/lib/calories/measurements"
import {
  MEAL_SLOTS,
  MEAL_SLOT_ACCENT,
  MEAL_SLOT_LABEL,
  MEAL_SLOT_RANGE_LABEL,
  resolveMealSlot,
  type MealSlot,
} from "@/lib/calories/meal-slots"
import { cn } from "@/lib/utils"

const CALORIE_COLOR = "#ef4444"
export const MACRO_COLOR = {
  protein: "#38bdf8",
  fat: "#fbbf24",
  carbs: "#4ade80",
} as const

export type SlotTotals = {
  calories: number
  protein: number
  fat: number
  carbs: number
  /** True when at least one entry reported that macro. */
  hasMacros: boolean
}

export type SlotGroup = {
  slot: MealSlot
  entries: CalorieEntry[]
  totals: SlotTotals
}

function emptyTotals(): SlotTotals {
  return { calories: 0, protein: 0, fat: 0, carbs: 0, hasMacros: false }
}

/** Calories plus whichever macros were actually recorded. */
export function totalsForEntries(entries: readonly CalorieEntry[]): SlotTotals {
  return entries.reduce((acc, entry) => {
    acc.calories += entry.calories
    if (entry.protein != null) {
      acc.protein += entry.protein
      acc.hasMacros = true
    }
    if (entry.fat != null) {
      acc.fat += entry.fat
      acc.hasMacros = true
    }
    if (entry.carbs != null) {
      acc.carbs += entry.carbs
      acc.hasMacros = true
    }
    return acc
  }, emptyTotals())
}

/** One group per block, always all three, ordered through the day. */
export function groupEntriesBySlot(entries: CalorieEntry[]): SlotGroup[] {
  const bySlot = new Map<MealSlot, CalorieEntry[]>(MEAL_SLOTS.map((slot) => [slot, []]))
  for (const entry of entries) {
    bySlot.get(resolveMealSlot(entry))!.push(entry)
  }
  return MEAL_SLOTS.map((slot) => {
    const slotEntries = [...bySlot.get(slot)!].sort((a, b) => {
      const left = a.createdAt ?? ""
      const right = b.createdAt ?? ""
      return left < right ? -1 : left > right ? 1 : a.id.localeCompare(b.id)
    })
    return { slot, entries: slotEntries, totals: totalsForEntries(slotEntries) }
  })
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/* ─── macro readout ──────────────────────────────────────── */

export function MacroPill({
  value,
  letter,
  color,
}: {
  value: number
  letter: string
  color: string
}) {
  return (
    <span
      className="inline-flex items-baseline gap-1 tabular-nums"
      aria-label={`${round1(value)}${letter}`}
    >
      <span className="font-semibold text-foreground/75" aria-hidden>{round1(value)}</span>
      <span className="text-[9px] font-bold" style={{ color }} aria-hidden>
        {letter}
      </span>
    </span>
  )
}

export function MacroRow({
  totals,
  className,
}: {
  totals: SlotTotals
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] tabular-nums",
        className,
      )}
    >
      <span className="inline-flex items-baseline gap-1">
        <span className="font-bold" style={{ color: CALORIE_COLOR }}>
          {totals.calories.toLocaleString()}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          cal
        </span>
      </span>
      {totals.hasMacros ? (
        <>
          <MacroPill value={totals.protein} letter="P" color={MACRO_COLOR.protein} />
          <MacroPill value={totals.fat} letter="F" color={MACRO_COLOR.fat} />
          <MacroPill value={totals.carbs} letter="C" color={MACRO_COLOR.carbs} />
        </>
      ) : null}
    </div>
  )
}

/* ─── one logged food ────────────────────────────────────── */

function EntryRow({
  entry,
  slot,
  onEditBlock,
}: {
  entry: CalorieEntry
  slot: MealSlot
  onEditBlock: (slot: MealSlot) => void
}) {
  const portion = formatFoodPortion(entry.portionAmount, entry.portionUnit)
  const hasMacros = entry.protein != null || entry.fat != null || entry.carbs != null
  const label = entry.description?.trim() || "Logged entry"

  return (
    <li>
      <button
        type="button"
        onClick={() => onEditBlock(slot)}
        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
        aria-label={`Edit ${MEAL_SLOT_LABEL[slot].toLowerCase()} — ${label}`}
      >
        {entry.imageUrl ? (
          <img
            src={entry.imageUrl}
            alt=""
            className="size-10 shrink-0 rounded-lg object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.3)]"
          />
        ) : (
          <FoodFallbackIcon label={label} className="size-10 shrink-0" />
        )}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-[13px] font-medium leading-snug text-foreground/92">
            {label}
          </span>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] tabular-nums">
            {entry.protein != null ? (
              <MacroPill value={entry.protein} letter="P" color={MACRO_COLOR.protein} />
            ) : null}
            {entry.fat != null ? (
              <MacroPill value={entry.fat} letter="F" color={MACRO_COLOR.fat} />
            ) : null}
            {entry.carbs != null ? (
              <MacroPill value={entry.carbs} letter="C" color={MACRO_COLOR.carbs} />
            ) : null}
            {portion ? (
              <span className="min-w-0 truncate text-[10px] text-muted-foreground/48">
                {hasMacros ? "· " : ""}{portion}
              </span>
            ) : null}
            {!hasMacros && !portion ? (
              <span className="text-[10px] text-muted-foreground/55">No macros logged</span>
            ) : null}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[13px] font-semibold tabular-nums text-red-100/90">
            {entry.calories.toLocaleString()}
          </span>
          <span className="block text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/45">
            cal
          </span>
        </span>
      </button>
    </li>
  )
}

/* ─── "what you usually eat now" ─────────────────────────── */

function SuggestionStrip({
  slot,
  suggestions,
  pendingId,
  onQuickAdd,
}: {
  slot: MealSlot
  suggestions: FrequentFoodSuggestion[]
  pendingId: string | null
  onQuickAdd: (slot: MealSlot, food: FrequentFoodSuggestion) => void
}) {
  if (suggestions.length === 0) return null
  return (
    <div className="space-y-1.5 pt-1">
      <p className="type-hud-micro text-muted-foreground/45">
        You usually eat
      </p>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {suggestions.slice(0, 6).map((food) => {
          const pending = pendingId === food.id
          return (
            <button
              key={food.id}
              type="button"
              disabled={pending}
              onClick={() => onQuickAdd(slot, food)}
              className={cn(
                "group/chip inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.025] py-1.5 pl-2 pr-3",
                "text-[11px] text-foreground/80 transition-colors",
                "hover:border-red-300/25 hover:bg-red-400/[0.06] hover:text-red-50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/25",
                "disabled:opacity-50",
              )}
              title={`${food.name} · ${food.calories} cal`}
            >
              {pending ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground/60" />
              ) : (
                <Plus className="size-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover/chip:text-red-200/80" />
              )}
              <span className="max-w-[10rem] truncate font-medium">{food.name}</span>
              <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground/50">
                {food.calories}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ─── the timeline ───────────────────────────────────────── */

export function FoodTimeline({
  entries,
  status,
  currentSlot,
  suggestions,
  quickAddPendingId,
  onAdd,
  onEditBlock,
  onQuickAdd,
  onRetry,
  className,
}: {
  entries: CalorieEntry[]
  status: "loading" | "ready" | "error"
  /** Block the user is living in right now — highlighted on the rail. */
  currentSlot: MealSlot
  suggestions: Partial<Record<MealSlot, FrequentFoodSuggestion[]>>
  quickAddPendingId: string | null
  onAdd: (slot: MealSlot) => void
  /** Opens the whole block for editing — reorder, remove, or add to it. */
  onEditBlock: (slot: MealSlot) => void
  onQuickAdd: (slot: MealSlot, food: FrequentFoodSuggestion) => void
  onRetry: () => void
  className?: string
}) {
  const groups = useMemo(() => groupEntriesBySlot(entries), [entries])

  if (status === "loading") {
    return (
      <div className={cn("space-y-2", className)} aria-label="Loading food log">
        <div className="skeleton h-24" />
        <div className="skeleton h-24" />
        <div className="skeleton h-24" />
      </div>
    )
  }

  if (status === "error") {
    return (
      <p
        className={cn(
          "rounded-2xl border border-red-400/10 bg-red-400/[0.04] px-4 py-5 text-center text-[12px] leading-relaxed text-muted-foreground/65",
          className,
        )}
      >
        Couldn&apos;t load the food log.{" "}
        <button
          type="button"
          onClick={onRetry}
          className="font-medium text-red-200 underline-offset-2 hover:underline"
        >
          Retry
        </button>
      </p>
    )
  }

  return (
    <div className={cn("relative", className)}>
      {/* Spine down the whole day, so empty blocks still read as part of it. */}
      <div
        className="pointer-events-none absolute bottom-3 left-[7px] top-3 w-px bg-gradient-to-b from-white/[0.03] via-white/[0.09] to-white/[0.03]"
        aria-hidden
      />

      <ol className="space-y-1">
        {groups.map(({ slot, entries: slotEntries, totals }) => {
          const accent = MEAL_SLOT_ACCENT[slot]
          const isCurrent = slot === currentSlot
          const slotSuggestions = suggestions[slot] ?? []
          // Offer the memory where it helps: the block you are in, and any
          // block still waiting to be filled.
          const showSuggestions = slotEntries.length === 0 || isCurrent

          return (
            <li key={slot} className="relative pl-7">
              <span
                className={cn(
                  "absolute left-0 top-[11px] size-[15px] rounded-full border-[3px] border-[#0b0e13] transition-shadow",
                  isCurrent && "shadow-[0_0_0_3px_rgba(239,68,68,0.14)]",
                )}
                style={{
                  background: slotEntries.length > 0 || isCurrent ? accent : "#2a323d",
                }}
                aria-hidden
              />

              <div
                className={cn(
                  "rounded-2xl border px-3 py-2.5 transition-colors sm:px-3.5",
                  isCurrent
                    ? "border-white/[0.1] bg-white/[0.028]"
                    : "border-white/[0.06] bg-white/[0.012]",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <h4
                        className="text-[11px] font-bold uppercase tracking-[0.14em]"
                        style={{ color: accent }}
                      >
                        {MEAL_SLOT_LABEL[slot]}
                      </h4>
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40">
                        {MEAL_SLOT_RANGE_LABEL[slot]}
                      </span>
                      {isCurrent ? (
                        <span className="rounded-full bg-red-400/[0.12] px-1.5 py-px text-[8px] font-bold uppercase tracking-[0.1em] text-red-200/85">
                          Now
                        </span>
                      ) : null}
                    </div>
                    {slotEntries.length > 0 ? (
                      <MacroRow totals={totals} className="mt-1" />
                    ) : (
                      <p className="mt-1 text-[11px] text-muted-foreground/45">
                        Nothing logged yet
                      </p>
                    )}
                  </div>

                  {/* An empty block invites a first food; once it has one,
                      the same corner opens the block for editing. */}
                  {slotEntries.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => onAdd(slot)}
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-xl border transition-colors",
                        "border-white/[0.08] text-muted-foreground/70",
                        "hover:border-white/[0.2] hover:bg-white/[0.05] hover:text-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                      )}
                      aria-label={`Add food to ${MEAL_SLOT_LABEL[slot].toLowerCase()}`}
                    >
                      <Plus className="size-5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onEditBlock(slot)}
                      className={cn(
                        "flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 transition-colors",
                        "border-white/[0.09] bg-white/[0.025] type-hud-micro text-foreground/75",
                        "hover:border-white/[0.2] hover:bg-white/[0.05] hover:text-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                      )}
                      aria-label={`Edit ${MEAL_SLOT_LABEL[slot].toLowerCase()}`}
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </button>
                  )}
                </div>

                {slotEntries.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5 border-t border-white/[0.05] pt-1.5">
                    {slotEntries.map((entry) => (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        slot={slot}
                        onEditBlock={onEditBlock}
                      />
                    ))}
                  </ul>
                ) : null}

                {showSuggestions ? (
                  <SuggestionStrip
                    slot={slot}
                    suggestions={slotSuggestions}
                    pendingId={quickAddPendingId}
                    onQuickAdd={onQuickAdd}
                  />
                ) : null}

                {slotEntries.length === 0 && slotSuggestions.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => onAdd(slot)}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/[0.09] py-2.5 text-[11px] text-muted-foreground/50 transition-colors hover:border-red-300/20 hover:bg-red-400/[0.04] hover:text-red-100/75"
                  >
                    <Utensils className="size-3.5" aria-hidden />
                    Add {MEAL_SLOT_LABEL[slot].toLowerCase()} food
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
