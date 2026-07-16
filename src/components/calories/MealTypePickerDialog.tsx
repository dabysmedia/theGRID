"use client"

import { ChevronRight, Flame, Utensils } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { mealTypes } from "@/lib/calories/log-food"
import { cn } from "@/lib/utils"

const MEAL_DETAILS: Record<
  (typeof mealTypes)[number],
  { color: string; caption: string }
> = {
  breakfast: { color: "#f59e0b", caption: "Start your morning meal" },
  lunch: { color: "#38bdf8", caption: "Build your midday meal" },
  dinner: { color: "#f87171", caption: "Build your evening meal" },
  snack: { color: "#94a3b8", caption: "Log a snack or small bite" },
}

export function MealTypePickerDialog({
  open,
  onOpenChange,
  onSelect,
  suggestedMealType,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (mealType: (typeof mealTypes)[number]) => void
  suggestedMealType?: string | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="glass-frost w-[min(calc(100vw-1.5rem),26rem)] gap-0 overflow-hidden p-0"
        showCloseButton
      >
        <DialogHeader className="border-b border-white/[0.07] bg-gradient-to-b from-red-400/[0.08] to-transparent px-5 pb-4 pt-5 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2.5 font-heading text-lg tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-xl border border-red-300/20 bg-red-400/[0.08]">
              <Flame className="size-4 text-red-400" aria-hidden />
            </span>
            What meal are you logging?
          </DialogTitle>
          <DialogDescription className="pt-1.5 text-xs leading-relaxed text-muted-foreground/70">
            Choose a meal to start with an empty log.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 p-4">
          {mealTypes.map((meal) => {
            const detail = MEAL_DETAILS[meal]
            const suggested = suggestedMealType === meal
            return (
              <button
                key={meal}
                type="button"
                onClick={() => onSelect(meal)}
                className={cn(
                  "group flex min-h-16 items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-[border-color,background-color,transform]",
                  "border-white/[0.08] bg-[#080c11]/75 hover:border-red-300/25 hover:bg-red-400/[0.045] active:scale-[0.985]",
                  suggested && "border-red-300/20 bg-red-400/[0.035]",
                )}
              >
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-black/20"
                  style={{ color: detail.color }}
                >
                  <Utensils className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-semibold capitalize text-foreground/90">
                    <span
                      className="size-1.5 rounded-full"
                      style={{ background: detail.color }}
                      aria-hidden
                    />
                    {meal}
                  </span>
                  <span className="mt-1 block text-[10px] text-muted-foreground/55">
                    {detail.caption}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground/35 transition-transform group-hover:translate-x-0.5 group-hover:text-red-200/65" />
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
