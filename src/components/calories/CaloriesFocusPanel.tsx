"use client"
/* eslint-disable @next/next/no-img-element -- food images may be dynamic product URLs */

import { Flame, Pencil, Plus, Trash2, Utensils } from "lucide-react"
import type { CalorieEntry } from "@/lib/calories/log-food"
import { formatFoodPortion } from "@/lib/calories/measurements"

type MealGroup = {
  meal: string
  items: CalorieEntry[]
  total: number
}

const MEAL_ACCENT: Record<string, { dot: string; text: string }> = {
  breakfast: { dot: "#f59e0b", text: "#fbbf24" },
  lunch: { dot: "#38bdf8", text: "#7dd3fc" },
  dinner: { dot: "#f87171", text: "#fca5a5" },
  snack: { dot: "#94a3b8", text: "#cbd5e1" },
}

const DEFAULT_ACCENT = {
  dot: "#ef4444",
  text: "#fca5a5",
}

export function CaloriesFocusPanel({
  consumed,
  target,
  entries,
  mealGroups,
  status,
  onAdd,
  onEdit,
  onDelete,
  onRetry,
}: {
  consumed: number
  target: number
  entries: CalorieEntry[]
  mealGroups: MealGroup[]
  status: "loading" | "ready" | "error"
  onAdd: (mealType?: string) => void
  onEdit: (entry: CalorieEntry) => void
  onDelete: (entry: CalorieEntry) => void
  onRetry: () => void
}) {
  const remaining = Math.max(0, target - consumed)
  const overTarget = Math.max(0, consumed - target)
  const pct = target > 0 ? Math.round((consumed / target) * 100) : 0
  const progressPct = Math.min(100, Math.max(0, pct))
  return (
    <div className="pointer-events-auto mt-2 motion-safe:animate-fade-up motion-reduce:animate-none">
      <section className="relative border-y border-white/[0.07] px-0.5 py-4 sm:px-1 sm:py-5">
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-red-300/75">
                <span className="flex h-5 w-5 items-center justify-center">
                  <Flame className="h-3 w-3" aria-hidden />
                </span>
                <p className="type-hud-subsection text-muted-foreground/70">Calorie balance</p>
              </div>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-2xl font-semibold tabular-nums tracking-[-0.035em] text-foreground sm:text-3xl">
                  {(overTarget > 0 ? overTarget : remaining).toLocaleString()}
                </span>
                <span className="type-hud-unit normal-case">
                  cal {overTarget > 0 ? "over target" : "remaining"}
                </span>
              </p>
              <p className="mt-1 max-w-md type-hud-caption normal-case tracking-normal">
                {overTarget > 0
                  ? "You’ve passed today’s target. Your log is still open."
                  : remaining === 0
                    ? "Target reached for today."
                    : "Keep logging as you go—your remaining budget updates instantly."}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onAdd()}
              className="hidden h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-300/20 bg-red-400/[0.05] px-3 type-hud-micro text-red-100/80 transition-[border-color,background-color,color,transform] duration-300 hover:border-red-300/35 hover:bg-red-400/[0.09] hover:text-red-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/30 sm:inline-flex"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add food
            </button>
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="type-hud-micro">Daily progress</span>
              <span className="type-hud-stat-xs text-red-300/80">{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden bg-white/[0.06]">
              <div
                className="h-full origin-left bg-gradient-to-r from-red-600/80 via-red-500 to-red-300/90 shadow-[0_0_10px_rgba(248,113,113,0.28)] transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ width: progressPct + "%" }}
              />
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-3 divide-x divide-white/[0.07] border-t border-white/[0.06] pt-3">
            {[
              ["Eaten", consumed],
              [overTarget > 0 ? "Over" : "Left", overTarget > 0 ? overTarget : remaining],
              ["Goal", target],
            ].map(([label, value]) => (
              <div key={String(label)} className="min-w-0 px-2 text-center sm:px-4">
                <dt className="type-hud-micro text-muted-foreground/50">{label}</dt>
                <dd className="mt-0.5 truncate type-hud-stat text-foreground/85">
                  {Number(value).toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>

          <button
            type="button"
            onClick={() => onAdd()}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-red-300/20 bg-red-400/[0.06] type-hud-micro text-red-100/85 transition-[border-color,background-color,transform] duration-300 hover:border-red-300/35 hover:bg-red-400/[0.1] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/30 sm:hidden"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add food
          </button>
        </div>
      </section>

      <section className="mt-5" aria-label="Today's food">
        <header className="flex items-center justify-between gap-3 px-0.5 pb-3 sm:px-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground/65">
              <Utensils className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="type-hud-subsection text-foreground/80">Today&apos;s food</h3>
              <p className="mt-0.5 type-hud-caption normal-case tracking-normal">
                {status === "ready" ? entries.length + " " + (entries.length === 1 ? "item" : "items") + " logged" : "Your daily meal log"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onAdd()}
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 type-hud-micro text-muted-foreground/75 transition-colors hover:border-red-300/20 hover:bg-red-400/[0.05] hover:text-red-100/80"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add
          </button>
        </header>

        <div className="space-y-3">
          {status === "loading" ? (
            <div className="space-y-2" aria-label="Loading food log">
              <div className="skeleton h-16" />
              <div className="skeleton h-16" />
            </div>
          ) : null}

          {status === "error" ? (
            <p className="rounded-xl border border-red-400/10 bg-red-400/[0.04] px-4 py-5 text-center text-[12px] leading-relaxed text-muted-foreground/65">
              Couldn&apos;t load the food log.{" "}
              <button type="button" onClick={onRetry} className="font-medium text-red-200 underline-offset-2 hover:underline">Retry</button>
            </p>
          ) : null}

          {status === "ready" && entries.length === 0 ? (
            <div className="border-b border-white/[0.06] px-4 py-8 text-center">
              <Utensils className="mx-auto h-5 w-5 text-muted-foreground/35" aria-hidden />
              <p className="mt-2 text-sm font-medium text-foreground/75">No food logged yet</p>
              <p className="mt-1 text-[11px] text-muted-foreground/50">Add your first meal or snack for today.</p>
              <button type="button" onClick={() => onAdd()} className="mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-300/20 bg-red-400/[0.05] px-4 type-hud-micro text-red-100/80 transition-colors hover:bg-red-400/[0.09]">
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add food
              </button>
            </div>
          ) : null}

          {status === "ready" && mealGroups.length > 0 ? (
            <div className="space-y-3">
              {mealGroups.map(({ meal, items, total }) => {
                const accent = MEAL_ACCENT[meal] ?? DEFAULT_ACCENT
                return (
                  <div key={meal} className="min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.018] motion-safe:animate-fade-up motion-reduce:animate-none">
                    <div className="flex items-center gap-3 border-b border-white/[0.07] px-3.5 py-3 sm:px-4">
                      <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: accent.dot, boxShadow: "0 0 12px " + accent.dot + "55" }} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: accent.text }}>{meal}</p>
                        <p className="mt-0.5 text-[9px] text-muted-foreground/45">{items.length} item{items.length === 1 ? "" : "s"}</p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums" style={{ color: accent.text }}>{total.toLocaleString()} cal</span>
                      <button
                        type="button"
                        onClick={() => onAdd(meal)}
                        className="flex size-9 items-center justify-center rounded-xl border border-white/[0.08] text-muted-foreground transition-colors hover:border-red-300/25 hover:bg-red-400/[0.06] hover:text-red-100"
                        aria-label={`Add food to ${meal}`}
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>

                    <ul className="divide-y divide-white/[0.055]">
                      {items.map((entry) => (
                        <li key={entry.id} className="group/row flex items-center gap-3 px-3.5 py-3.5 transition-colors hover:bg-white/[0.025] sm:px-4">
                          {entry.imageUrl ? (
                            <img
                              src={entry.imageUrl}
                              alt=""
                              className="h-16 w-14 shrink-0 object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.28)] sm:h-18 sm:w-16"
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground/92 sm:text-sm">
                              {entry.description?.trim() || "Logged entry"}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                              {formatFoodPortion(entry.portionAmount, entry.portionUnit) ? (
                                <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/60">
                                  {formatFoodPortion(entry.portionAmount, entry.portionUnit)}
                                </span>
                              ) : null}
                              {(entry.protein != null || entry.carbs != null || entry.fat != null) ? (
                              <span className="text-[10px] tabular-nums text-muted-foreground/50">
                                {[
                                  entry.protein != null ? "P " + entry.protein + "g" : null,
                                  entry.carbs != null ? "C " + entry.carbs + "g" : null,
                                  entry.fat != null ? "F " + entry.fat + "g" : null,
                                ].filter(Boolean).join(" · ")}
                              </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold tabular-nums text-red-100/90">{entry.calories.toLocaleString()}</p>
                            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/45">cal</p>
                          </div>

                          <div className="flex shrink-0 items-center gap-0.5">
                            <button type="button" onClick={() => onEdit(entry)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/45 transition-colors hover:bg-white/[0.05] hover:text-foreground/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15" aria-label={"Edit " + (entry.description?.trim() || entry.calories + " cal")}>
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => onDelete(entry)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/35 transition-colors hover:bg-red-400/[0.06] hover:text-red-300/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/15" aria-label={"Delete " + (entry.description?.trim() || entry.calories + " cal")}>
                              <Trash2 className="h-3.5 w-3.5" />
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
      </section>
    </div>
  )
}
