"use client"

import { createPortal } from "react-dom"
import { format } from "date-fns"
import {
  Search,
  Trash2,
  Plus,
  Minus,
  Star,
  X,
  Pencil,
  Target,
  Bookmark,
  Camera,
} from "lucide-react"
import { FoodSearch } from "@/components/FoodSearch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn, parseLocalDate } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  PhotoCalorieEstimator,
} from "@/components/calories/PhotoCalorieEstimator"
import { mealTypes, savedMealTagList, draftMealItemTotals } from "@/lib/calories/log-food"
import { useLogFoodDialog, type UseLogFoodDialogOptions } from "@/components/calories/useLogFoodDialog"

export type LogFoodDialogProps = UseLogFoodDialogOptions

const LOG_MODES = [
  { id: "saved" as const, label: "Saved", icon: Bookmark },
  { id: "search" as const, label: "Search", icon: Search },
  { id: "estimate" as const, label: "Estimate", icon: Target },
]

const QUICK_CALS = [100, 250, 500, 750] as const

export function LogFoodDialog(props: LogFoodDialogProps) {
  const { open, onOpenChange } = props
  const s = useLogFoodDialog(props)
  const estimateDisabled = (s.vacationBlocksLog && !s.editingEntry) || s.vacationBlocksEditingEntry

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton
          className={cn(
            "glass-frost flex h-[95dvh] max-h-[95dvh] sm:h-auto sm:max-h-[90vh] flex-col gap-0 overflow-hidden p-0",
            "w-[min(100%,calc(100vw-0.75rem))] sm:max-w-lg",
            "[&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3"
          )}
        >
          <div className="shrink-0 border-b border-border/20 bg-gradient-to-b from-primary/[0.07] to-transparent px-4 pt-4 pb-3 pr-12">
            <DialogHeader className="space-y-0">
              <DialogTitle className="font-heading text-lg tracking-tight">
                {s.editingEntry ? "Edit entry" : "Log food"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {s.editingEntry ? "Edit a calorie entry" : "Add food to your daily log"}
              </DialogDescription>
            </DialogHeader>
            {s.editingEntry && (
              <p className="mt-1 truncate text-[11px] capitalize text-muted-foreground/65">
                {format(parseLocalDate(s.editingEntry.date.split("T")[0]), "MMM d")} · {s.editingEntry.mealType}
                {s.editingEntry.description && <> · {s.editingEntry.description}</>}
              </p>
            )}
            {s.vacationBlocksLog && !s.editingEntry && s.vacationResumeLabel && (
              <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] leading-snug text-amber-100/85">
                Vacation mode until{" "}
                <span className="font-semibold tabular-nums">{s.vacationResumeLabel}</span>. Clear the draft or wait
                until then to post.
              </p>
            )}
            {s.editingEntry && s.vacationBlocksEditingEntry && s.vacationResumeLabel && (
              <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] leading-snug text-amber-100/85">
                This day is in vacation mode (before{" "}
                <span className="font-semibold tabular-nums">{s.vacationResumeLabel}</span>). Editing is disabled.
              </p>
            )}

            <div className="mt-3 flex gap-1.5">
              {mealTypes.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={s.vacationBlocksLog && !s.editingEntry}
                  onClick={() => s.setMealType(s.mealType === m ? null : m)}
                  className={cn(
                    "flex-1 rounded-full py-2 text-[11px] font-semibold capitalize tracking-wide transition-all duration-200 touch-manipulation",
                    s.mealType === m
                      ? "bg-primary text-primary-foreground shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_40%,transparent)]"
                      : "bg-muted/25 text-muted-foreground/70 hover:bg-muted/40 hover:text-foreground",
                    s.vacationBlocksLog && !s.editingEntry && "opacity-45"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>

            {!s.editingEntry && (
              <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-muted/20 p-1">
                {LOG_MODES.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    disabled={s.vacationBlocksLog}
                    onClick={() => {
                      s.setLogFoodMode(id)
                      if (id !== "estimate") s.setLogFoodPhotoOpen(false)
                    }}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-semibold transition-all duration-200 touch-manipulation",
                      s.logFoodMode === id
                        ? "bg-background text-foreground shadow-sm shadow-black/15"
                        : "text-muted-foreground/55 hover:text-muted-foreground",
                      s.vacationBlocksLog && "opacity-45"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative z-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <div className="flex min-h-full flex-col gap-4">
              {!s.editingEntry && s.draftMealItems.length > 0 && (
                <DraftMealsSection s={s} />
              )}

              {s.editingEntry ? (
                <EstimatePanel s={s} disabled={estimateDisabled} />
              ) : s.logFoodMode === "saved" ? (
                <SavedMealsSection s={s} />
              ) : s.logFoodMode === "search" ? (
                <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
                  <p className="mb-2 text-[11px] leading-snug text-muted-foreground/70">
                    Search the food database — tap a result to add it instantly.
                  </p>
                  <FoodSearch onSelect={s.handleFoodSelect} compact instantAdd />
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-1 duration-200">
                  <EstimatePanel s={s} disabled={estimateDisabled} />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-border/30" />
                      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/45">
                        or snap a photo
                      </span>
                      <div className="h-px flex-1 bg-border/30" />
                    </div>
                    {!s.logFoodPhotoOpen ? (
                      <button
                        type="button"
                        disabled={s.vacationBlocksLog}
                        onClick={() => s.setLogFoodPhotoOpen(true)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/[0.06] py-3.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-45 touch-manipulation"
                      >
                        <Camera className="h-4 w-4" />
                        Estimate from photo
                        <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                          AI
                        </span>
                      </button>
                    ) : (
                      <PhotoCalorieEstimator
                        open
                        embedded
                        onOpenChange={s.setLogFoodPhotoOpen}
                        onUsePrefill={s.handlePhotoPrefill}
                        disabled={s.vacationBlocksLog}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {(s.editingEntry || s.draftMealItems.length > 0 || s.postingMeal) && (
            <div className="shrink-0 border-t border-border/30 bg-background/70 px-4 py-3 backdrop-blur-md pb-[max(0.75rem,calc(0.5rem+env(safe-area-inset-bottom)))]">
              {s.editingEntry ? (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1 h-12" size="default" onClick={s.cancelEdit}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="glass"
                    form="log-food-form"
                    className="flex-1 press-scale h-12"
                    size="default"
                    disabled={s.vacationBlocksEditingEntry}
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between px-0.5">
                    <p className="text-[11px] text-muted-foreground/60">
                      {s.draftMealItems.length} item{s.draftMealItems.length === 1 ? "" : "s"} ready
                    </p>
                    <p className="font-heading text-sm font-semibold tabular-nums text-foreground">
                      {s.draftTotals.calories.toLocaleString()}
                      <span className="ml-1 text-[11px] font-medium text-muted-foreground/55">cal</span>
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="glass"
                    className="w-full press-scale h-12 text-sm font-semibold"
                    size="default"
                    disabled={s.postingMeal || s.vacationBlocksLog}
                    onClick={() => void s.handlePostMealToDay()}
                  >
                    {s.postingMeal
                      ? "Posting..."
                      : `Post meal · ${s.draftTotals.calories.toLocaleString()} cal`}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {s.pendingSavedDelete &&
        createPortal(
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[3px]"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="log-food-delete-saved-title"
            onClick={() => {
              if (!s.pendingSavedDeleteBusy) s.setPendingSavedDelete(null)
            }}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-border/35 bg-popover p-5 shadow-2xl ring-1 ring-foreground/5"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="log-food-delete-saved-title" className="font-heading text-base font-semibold text-foreground">
                Delete saved meal?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                This will remove{" "}
                <span className="font-medium text-foreground">&quot;{s.pendingSavedDelete.name}&quot;</span> from saved
                meals. This cannot be undone.
              </p>
              <div className="mt-5 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-11"
                  disabled={s.pendingSavedDeleteBusy}
                  onClick={() => s.setPendingSavedDelete(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="flex-1 h-11"
                  disabled={s.pendingSavedDeleteBusy}
                  onClick={() => void s.executePendingSavedDelete()}
                >
                  {s.pendingSavedDeleteBusy ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

function EstimatePanel({
  s,
  disabled,
}: {
  s: ReturnType<typeof useLogFoodDialog>
  disabled: boolean
}) {
  return (
    <form id="log-food-form" onSubmit={s.handleSubmit} className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.12] via-primary/[0.04] to-transparent p-4">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-primary/15 blur-2xl"
        />
        <Label htmlFor="calories" className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/70">
          Calories
        </Label>
        <div className="mt-1 flex items-end gap-2">
          <Input
            id="calories"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            placeholder="0"
            value={s.calories}
            onChange={(e) => s.setCalories(e.target.value)}
            className="h-14 flex-1 border-0 bg-transparent px-0 font-heading text-4xl font-bold tabular-nums shadow-none focus-visible:ring-0"
            required
            disabled={disabled}
            autoFocus={!s.editingEntry}
          />
          <span className="mb-2.5 shrink-0 text-sm font-medium text-muted-foreground/50">cal</span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {QUICK_CALS.map((n) => (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => s.addCalories(n)}
              className="h-10 rounded-xl border border-primary/20 bg-background/40 text-xs font-semibold tabular-nums text-foreground/80 transition-colors hover:bg-primary/15 hover:text-primary touch-manipulation disabled:pointer-events-none disabled:opacity-40"
            >
              +{n}
            </button>
          ))}
        </div>
      </div>

      <Input
        placeholder="What did you eat? (optional)"
        value={s.description}
        onChange={(e) => s.setDescription(e.target.value)}
        disabled={disabled}
        className="h-11 bg-background/35 border-border/30"
      />

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => s.setShowEstimateMacros((v) => !v)}
          className="text-[11px] font-medium text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          {s.showEstimateMacros ? "Hide macros" : "Add macros (optional)"}
        </button>
        {s.showEstimateMacros && (
          <div className="grid grid-cols-3 gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <MacroField
              label="Protein"
              value={s.protein}
              onChange={s.setProtein}
              disabled={disabled}
            />
            <MacroField
              label="Carbs"
              value={s.carbs}
              onChange={s.setCarbs}
              disabled={disabled}
            />
            <MacroField
              label="Fat"
              value={s.fat}
              onChange={s.setFat}
              disabled={disabled}
            />
          </div>
        )}
      </div>

      {!s.editingEntry && (
        <div className="flex items-center gap-2">
          {s.showSavePrompt && s.description && s.calories && (
            <button
              type="button"
              onClick={() => void s.handleSaveCurrentAsFrequent()}
              className="flex items-center gap-1.5 rounded-xl border border-dashed border-primary/25 px-3 py-3 text-xs font-medium text-primary/70 transition-colors hover:bg-primary/5 hover:text-primary touch-manipulation"
            >
              <Star className="h-3.5 w-3.5" />
              Save
            </button>
          )}
          <Button
            type="submit"
            variant="glass"
            size="sm"
            className="flex-1 h-12 text-sm font-semibold"
            disabled={s.vacationBlocksLog || s.estimateCalDisplay == null}
          >
            {s.estimateCalDisplay != null
              ? `Add ${s.estimateCalDisplay.toLocaleString()} cal`
              : "Enter calories"}
          </Button>
        </div>
      )}
    </form>
  )
}

function MacroField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          min="0"
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-10 bg-background/40 border-border/30 pr-7 text-sm tabular-nums"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/40">
          g
        </span>
      </div>
    </div>
  )
}

function DraftMealsSection({ s }: { s: ReturnType<typeof useLogFoodDialog> }) {
  return (
    <div className="animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/45">
          This meal
        </p>
        <p className="text-[11px] tabular-nums text-muted-foreground/55">
          {s.draftTotals.calories.toLocaleString()} cal
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-glass-border/30 divide-y divide-glass-border/20">
        {s.draftMealItems.map((item) => {
          const totals = draftMealItemTotals(item)
          const isNew = s.lastAddedDraftId === item.id
          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 text-xs transition-colors",
                isNew && "bg-primary/[0.07] ring-1 ring-inset ring-primary/25"
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight">{item.description || "Quick add"}</p>
                <p className="mt-0.5 text-[11px] capitalize tabular-nums text-muted-foreground/45">
                  {item.mealType} · {totals.calories} cal
                </p>
              </div>
              <QuantityStepper
                compact
                value={String(item.quantity)}
                onChange={(next) => {
                  const q = parseFloat(next)
                  if (Number.isFinite(q) && q >= 0.5) s.updateDraftItemQuantity(item.id, q)
                }}
                onAdjust={(delta) => s.adjustDraftItemQuantity(item.id, delta)}
              />
              <button
                type="button"
                onClick={() => s.setDraftMealItems((prev) => prev.filter((x) => x.id !== item.id))}
                className="shrink-0 rounded-md p-2 hover:bg-destructive/10 touch-manipulation"
                aria-label={`Remove ${item.description || "item"}`}
              >
                <X className="h-4 w-4 text-muted-foreground/30" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SavedMealsSection({ s }: { s: ReturnType<typeof useLogFoodDialog> }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col animate-in fade-in duration-200">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/45">
            Saved meals
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground/55">
            {s.mealType
              ? `Showing ${s.mealType}`
              : "Tap one to add · filter with meal chips above"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            s.setSaveMealError(null)
            s.setEditingSavedMealId(null)
            if (!s.showCreateMeal) s.setNewMealTags(s.mealType ? [s.mealType] : [])
            s.setShowCreateMeal(!s.showCreateMeal)
          }}
          className="min-h-10 shrink-0 rounded-xl border border-primary/25 bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/18 active:scale-[0.98] touch-manipulation"
        >
          {s.showCreateMeal ? "Cancel" : "+ New"}
        </button>
      </div>

      {s.showCreateMeal && (
        <div
          data-create-meal
          className="glass-subtle mb-3 space-y-2 rounded-xl p-3 animate-in fade-in slide-in-from-top-1 duration-200"
          onKeyDownCapture={(e) => {
            if (e.key === "Enter" && (e.target as HTMLElement).closest("[data-create-meal]")) {
              e.preventDefault()
              e.stopPropagation()
              void s.handleCreateMeal()
            }
          }}
        >
          <Input
            placeholder="Meal name"
            value={s.newMealName}
            onChange={(e) => s.setNewMealName(e.target.value)}
            className="h-10 bg-background/40 border-primary/15 text-sm"
          />
          <div className="space-y-1">
            <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {mealTypes.map((m) => {
                const on = s.newMealTags.includes(m)
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      s.setNewMealTags((prev) => {
                        if (prev.includes(m)) {
                          if (prev.length <= 1) return prev
                          return prev.filter((x) => x !== m)
                        }
                        return [...prev, m]
                      })
                    }}
                    className={cn(
                      "rounded-md px-2.5 py-1.5 text-[11px] font-medium capitalize transition-colors touch-manipulation",
                      on
                        ? "bg-primary/20 text-primary ring-1 ring-primary/30"
                        : "bg-muted/25 text-muted-foreground/70 hover:bg-muted/40"
                    )}
                  >
                    {m}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">Cal *</Label>
              <Input type="number" min="0" placeholder="0" value={s.newMealCal} onChange={(e) => s.setNewMealCal(e.target.value)} className="h-9 bg-background/40 border-primary/15 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">P</Label>
              <Input type="number" min="0" placeholder="g" value={s.newMealProtein} onChange={(e) => s.setNewMealProtein(e.target.value)} className="h-9 bg-background/40 border-primary/15 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">C</Label>
              <Input type="number" min="0" placeholder="g" value={s.newMealCarbs} onChange={(e) => s.setNewMealCarbs(e.target.value)} className="h-9 bg-background/40 border-primary/15 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">F</Label>
              <Input type="number" min="0" placeholder="g" value={s.newMealFat} onChange={(e) => s.setNewMealFat(e.target.value)} className="h-9 bg-background/40 border-primary/15 text-sm" />
            </div>
          </div>
          {s.saveMealError && <p className="text-[10px] text-destructive" role="alert">{s.saveMealError}</p>}
          <Button type="button" variant="glass" size="sm" className="w-full h-10 text-sm" onClick={() => void s.handleCreateMeal()}>
            Save
          </Button>
        </div>
      )}

      {s.savedMeals.length === 0 && !s.showCreateMeal && (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border/30 px-6 py-10 text-center">
          <Bookmark className="mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-foreground/80">No saved meals yet</p>
          <p className="mt-1 max-w-[16rem] text-[12px] leading-relaxed text-muted-foreground/60">
            Save frequent meals for one-tap logging, or switch to Estimate for a quick calorie entry.
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10"
              onClick={() => s.setLogFoodMode("estimate")}
            >
              Estimate
            </Button>
            <Button
              type="button"
              variant="glass"
              size="sm"
              className="h-10"
              onClick={() => {
                s.setNewMealTags(s.mealType ? [s.mealType] : [])
                s.setShowCreateMeal(true)
              }}
            >
              + New meal
            </Button>
          </div>
        </div>
      )}

      {s.savedMeals.length > 0 && s.displayedSavedMeals.length === 0 && s.mealType && (
        <p className="mb-2 text-[11px] text-muted-foreground/70">
          No saved meals tagged for <span className="capitalize font-medium text-foreground/80">{s.mealType}</span>. Tap
          the chip again to show all, or add one with this tag.
        </p>
      )}

      {s.displayedSavedMeals.length > 0 && (
        <div
          className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-y-contain touch-pan-y pr-0.5 [-webkit-overflow-scrolling:touch]"
          aria-label="Saved meals"
        >
          {s.displayedSavedMeals.map((meal) => {
            const inDraftCount = s.savedMealCountsInDraft.get(meal.id) ?? 0
            const flash = s.flashSavedMealId === meal.id
            const tags = savedMealTagList(meal)
            const editingThis = s.editingSavedMealId === meal.id
            return (
              <div key={meal.id} className="space-y-0">
                <div
                  className={cn(
                    "group flex items-center gap-2 rounded-2xl px-2.5 py-2.5 transition-all duration-300",
                    inDraftCount > 0
                      ? "bg-gradient-to-r from-primary/[0.12] to-transparent ring-1 ring-primary/35"
                      : "hover:bg-glass-highlight/15",
                    flash && "animate-in zoom-in-95 duration-300 ring-2 ring-primary/45"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => s.handleUseSavedMeal(meal)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left touch-manipulation"
                  >
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-300",
                        inDraftCount > 0 ? "bg-primary/20 text-primary" : "bg-primary/10"
                      )}
                    >
                      {inDraftCount > 0 ? (
                        <span className="text-sm font-bold tabular-nums">{inDraftCount}</span>
                      ) : (
                        <Plus className="h-4 w-4 text-primary/70" />
                      )}
                    </div>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                      <span className="truncate text-sm font-semibold">{meal.name}</span>
                      <span className="flex flex-wrap items-center gap-1">
                        <span className="text-xs font-medium tabular-nums text-muted-foreground/55">
                          {meal.calories} cal
                        </span>
                        {tags.map((t) => (
                          <span
                            key={t}
                            className={cn(
                              "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium capitalize",
                              t === s.mealType ? "bg-primary/15 text-primary/90" : "bg-muted/40 text-muted-foreground/70"
                            )}
                          >
                            {t}
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => s.openEditSavedMeal(meal)}
                    className="history-row-delete rounded-md"
                    aria-label={`Edit saved meal ${meal.name}`}
                  >
                    <Pencil />
                  </button>
                  <button
                    type="button"
                    onClick={() => s.requestDeleteSavedMeal(meal.id, meal.name)}
                    className="history-row-delete rounded-md"
                    aria-label={`Delete saved meal ${meal.name}`}
                  >
                    <Trash2 />
                  </button>
                </div>
                {editingThis && (
                  <div
                    data-edit-saved-meal
                    className="glass-subtle mb-2 mt-1 space-y-2 rounded-xl border border-border/25 p-3"
                    onKeyDownCapture={(e) => {
                      if (e.key === "Enter" && (e.target as HTMLElement).closest("[data-edit-saved-meal]")) {
                        e.preventDefault()
                        e.stopPropagation()
                        void s.handleUpdateSavedMeal()
                      }
                    }}
                  >
                    <Input
                      value={s.editSavedName}
                      onChange={(e) => s.setEditSavedName(e.target.value)}
                      className="h-10 bg-background/40 border-primary/15 text-sm"
                      placeholder="Meal name"
                    />
                    <div className="space-y-1">
                      <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">Tags</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {mealTypes.map((m) => {
                          const on = s.editSavedTags.includes(m)
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                s.setEditSavedTags((prev) => {
                                  if (prev.includes(m)) {
                                    if (prev.length <= 1) return prev
                                    return prev.filter((x) => x !== m)
                                  }
                                  return [...prev, m]
                                })
                              }}
                              className={cn(
                                "rounded-md px-2.5 py-1.5 text-[11px] font-medium capitalize transition-colors touch-manipulation",
                                on
                                  ? "bg-primary/20 text-primary ring-1 ring-primary/30"
                                  : "bg-muted/25 text-muted-foreground/70 hover:bg-muted/40"
                              )}
                            >
                              {m}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">Cal *</Label>
                        <Input type="number" min="0" value={s.editSavedCal} onChange={(e) => s.setEditSavedCal(e.target.value)} className="h-9 bg-background/40 border-primary/15 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">P</Label>
                        <Input type="number" min="0" value={s.editSavedProtein} onChange={(e) => s.setEditSavedProtein(e.target.value)} className="h-9 bg-background/40 border-primary/15 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">C</Label>
                        <Input type="number" min="0" value={s.editSavedCarbs} onChange={(e) => s.setEditSavedCarbs(e.target.value)} className="h-9 bg-background/40 border-primary/15 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">F</Label>
                        <Input type="number" min="0" value={s.editSavedFat} onChange={(e) => s.setEditSavedFat(e.target.value)} className="h-9 bg-background/40 border-primary/15 text-sm" />
                      </div>
                    </div>
                    {s.editSavedError && (
                      <p className="text-[10px] text-destructive" role="alert">
                        {s.editSavedError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" className="flex-1 h-10" onClick={s.cancelEditSavedMeal}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="glass"
                        size="sm"
                        className="flex-1 h-10"
                        disabled={s.savingSavedMealEdit}
                        onClick={() => void s.handleUpdateSavedMeal()}
                      >
                        {s.savingSavedMealEdit ? "Saving…" : "Update"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function QuantityStepper({
  label,
  value,
  onChange,
  onAdjust,
  disabled = false,
  compact = false,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  onAdjust: (delta: number) => void
  disabled?: boolean
  compact?: boolean
}) {
  const numeric = parseFloat(value) || 1

  return (
    <div className={cn("flex items-center gap-2", compact ? "shrink-0" : "justify-between")}>
      {label && (
        <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
          {label}
        </Label>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={disabled || numeric <= 0.5}
          onClick={() => onAdjust(-0.5)}
          className={cn(
            "flex touch-manipulation items-center justify-center rounded-md border border-glass-border transition-colors hover:bg-glass-highlight/15 disabled:cursor-not-allowed disabled:opacity-30",
            compact ? "h-8 w-8" : "h-9 w-9"
          )}
          aria-label="Decrease quantity"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <Input
          type="number"
          min="0.5"
          step="0.5"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "text-center tabular-nums bg-background/40 border-primary/15 px-1",
            compact ? "h-8 w-12 text-sm font-semibold" : "h-9 w-16 text-base font-semibold"
          )}
          aria-label="Quantity"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAdjust(0.5)}
          className={cn(
            "flex touch-manipulation items-center justify-center rounded-md border border-glass-border transition-colors hover:bg-glass-highlight/15 disabled:opacity-30",
            compact ? "h-8 w-8" : "h-9 w-9"
          )}
          aria-label="Increase quantity"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
