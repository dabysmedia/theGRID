"use client"

import { useEffect, useState } from "react"
import { ChevronDown, Flame, Search } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FoodSearch } from "@/components/FoodSearch"
import { useActiveDate } from "@/context/DateContext"
import { useUser } from "@/context/UserContext"
import { cn, formatDisplayDate, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import { isVacationBlockingCalendarDay } from "@/lib/vacation-mode"

const mealTypes = ["breakfast", "lunch", "dinner", "snack"] as const

export interface LogCaloriesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function LogCaloriesDialog({ open, onOpenChange, onSaved }: LogCaloriesDialogProps) {
  const { activeDate } = useActiveDate()
  const { user } = useUser()
  const vacationBlocksLog = isVacationBlockingCalendarDay(user?.vacationResumeDate, activeDate)

  const [mealType, setMealType] = useState<(typeof mealTypes)[number]>("lunch")
  const [description, setDescription] = useState("")
  const [calories, setCalories] = useState("")
  const [protein, setProtein] = useState("")
  const [carbs, setCarbs] = useState("")
  const [fat, setFat] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setMealType("lunch")
      setDescription("")
      setCalories("")
      setProtein("")
      setCarbs("")
      setFat("")
      setSearchOpen(false)
      setSubmitting(false)
    }
  }, [open])

  function handleFoodSelect(food: {
    food_name: string
    brand_name: string | null
    calories: number | null
    protein: number | null
    carbs: number | null
    fat: number | null
  }) {
    const label = food.brand_name ? `${food.food_name} (${food.brand_name})` : food.food_name
    setDescription(label)
    if (food.calories != null) setCalories(String(Math.round(food.calories)))
    if (food.protein != null) setProtein(String(Math.round(food.protein)))
    if (food.carbs != null) setCarbs(String(Math.round(food.carbs)))
    if (food.fat != null) setFat(String(Math.round(food.fat)))
  }

  function addCalories(n: number) {
    const cur = parseFloat(calories)
    const base = Number.isNaN(cur) ? 0 : cur
    setCalories(String(Math.round(base + n)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (vacationBlocksLog || submitting || !calories) return

    const cal = parseFloat(calories)
    if (!Number.isFinite(cal) || cal <= 0) return

    setSubmitting(true)
    try {
      const res = await apiFetch("/api/calories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: activeDate,
          mealType,
          description: description || null,
          calories: Math.round(cal),
          protein: protein.trim() === "" ? null : protein,
          carbs: carbs.trim() === "" ? null : carbs,
          fat: fat.trim() === "" ? null : fat,
        }),
      })

      if (res.ok) {
        onOpenChange(false)
        onSaved?.()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "glass-frost flex min-h-0 flex-col gap-0 overflow-hidden p-0",
          "max-h-[min(92dvh,720px)] w-[calc(100%-2rem)] max-w-lg",
          "[&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3"
        )}
      >
        <div className="shrink-0 px-4 pt-4 pb-3 pr-12">
          <DialogHeader className="space-y-0">
            <DialogTitle className="type-hud-title flex items-center gap-2 font-sans normal-case tracking-normal">
              <Flame className="h-4 w-4 text-[#ef4444]" aria-hidden />
              Log food
            </DialogTitle>
            <DialogDescription className="type-hud-caption normal-case">
              {formatDisplayDate(parseLocalDate(activeDate))}
            </DialogDescription>
          </DialogHeader>

          {vacationBlocksLog && (
            <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] leading-snug text-amber-100/85">
              Vacation mode — calorie logging is paused for this day.
            </p>
          )}

          <div className="mt-3 flex rounded-lg bg-muted/20 p-0.5">
            {mealTypes.map((m) => (
              <button
                key={m}
                type="button"
                disabled={vacationBlocksLog}
                onClick={() => setMealType(m)}
                className={cn(
                  "flex-1 rounded-md py-2.5 text-xs font-medium capitalize transition-all duration-150",
                  mealType === m
                    ? "bg-background text-foreground shadow-sm shadow-black/10"
                    : "text-muted-foreground/50 hover:text-muted-foreground",
                  vacationBlocksLog && "opacity-45"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="relative z-20 shrink-0 border-y border-border/20 px-4 py-2.5">
          <button
            type="button"
            disabled={vacationBlocksLog}
            onClick={() => setSearchOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-lg py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-45"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Search className="h-3.5 w-3.5 shrink-0 opacity-60" />
              <span className="truncate">Search foods</span>
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 opacity-50 transition-transform duration-200",
                searchOpen && "rotate-180"
              )}
            />
          </button>
          {searchOpen && (
            <div className="overflow-visible pt-2.5">
              <FoodSearch onSelect={handleFoodSelect} compact />
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="relative z-0 min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="quick-log-food-desc" className="text-xs uppercase tracking-wider text-muted-foreground">
              Description
            </Label>
            <Input
              id="quick-log-food-desc"
              placeholder="What did you eat?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={vacationBlocksLog}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-log-calories" className="text-xs uppercase tracking-wider text-muted-foreground">
              Calories *
            </Label>
            <div className="flex gap-2">
              <Input
                id="quick-log-calories"
                type="number"
                min="1"
                step="1"
                placeholder="400"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                className="flex-1"
                required
                disabled={vacationBlocksLog}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0 px-3"
                onClick={() => addCalories(100)}
                disabled={vacationBlocksLog}
              >
                +100
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="quick-log-protein" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Protein
              </Label>
              <Input
                id="quick-log-protein"
                type="number"
                min="0"
                placeholder="g"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                disabled={vacationBlocksLog}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-log-carbs" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Carbs
              </Label>
              <Input
                id="quick-log-carbs"
                type="number"
                min="0"
                placeholder="g"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                disabled={vacationBlocksLog}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-log-fat" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Fat
              </Label>
              <Input
                id="quick-log-fat"
                type="number"
                min="0"
                placeholder="g"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
                disabled={vacationBlocksLog}
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="glass"
            className="w-full press-scale"
            size="lg"
            disabled={vacationBlocksLog || submitting}
          >
            {submitting ? "Saving…" : "Add to log"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
