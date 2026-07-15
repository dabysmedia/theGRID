"use client"
/* eslint-disable @next/next/no-img-element -- food images may be dynamic product URLs */

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
  Bookmark,
  Camera,
  Calculator,
  ChevronRight,
  Flame,
  ScanSearch,
  Utensils,
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
import {
  SAVED_FOOD_CATEGORIES,
  savedFoodCategoryLabel,
  type SavedFoodCategory,
} from "@/lib/calories/saved-food-category"
import { useLogFoodDialog, type UseLogFoodDialogOptions } from "@/components/calories/useLogFoodDialog"

export type LogFoodDialogProps = UseLogFoodDialogOptions

const LOG_MODES = [
  { id: "saved" as const, label: "Saved", caption: "Your library", icon: Bookmark },
  { id: "search" as const, label: "Search", caption: "Food database", icon: ScanSearch },
  { id: "estimate" as const, label: "Quick", caption: "Manual entry", icon: Calculator },
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
            "food-log-surface flex h-[calc(100dvh-0.75rem)] max-h-[calc(100dvh-0.75rem)] flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[min(92vh,52rem)]",
            "w-[min(100%,calc(100vw-0.75rem))] rounded-[1.75rem] sm:max-w-[34rem] sm:rounded-[2rem]",
            "[&_[data-slot=dialog-close]]:right-3 [&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:z-30",
            "[&_[data-slot=dialog-close]]:size-10 [&_[data-slot=dialog-close]]:rounded-xl [&_[data-slot=dialog-close]]:border [&_[data-slot=dialog-close]]:border-white/[0.08]",
            "[&_[data-slot=dialog-close]]:bg-black/20 [&_[data-slot=dialog-close]]:text-muted-foreground/65 [&_[data-slot=dialog-close]]:backdrop-blur-md"
          )}
        >
          <div className="relative z-10 shrink-0 border-b border-white/[0.075] px-3.5 pb-3 pt-3.5 pr-14 sm:px-5 sm:pb-4 sm:pt-4 sm:pr-16">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/[0.035] via-primary/[0.012] to-transparent" />
            <DialogHeader className="relative space-y-0 text-left">
              <div className="mb-1 flex items-center gap-2">
                <span className="inline-flex size-7 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                  <Utensils className="size-3.5" />
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary/70">
                  Nutrition input
                </span>
                {!s.editingEntry && s.draftMealItems.length > 0 && (
                  <span className="ml-auto rounded-full border border-primary/20 bg-primary/[0.08] px-2 py-1 text-[9px] font-semibold tabular-nums text-primary/85">
                    {s.draftMealItems.length} ready · {s.draftTotals.calories.toLocaleString()} cal
                  </span>
                )}
              </div>
              <DialogTitle className="font-heading text-[1.35rem] font-semibold tracking-[-0.035em] text-foreground sm:text-2xl">
                {s.editingEntry ? "Edit food entry" : "Build your meal"}
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

            <div className="relative mt-3 grid grid-cols-4 gap-1 rounded-2xl border border-white/[0.06] bg-black/20 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
              {mealTypes.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={s.vacationBlocksLog && !s.editingEntry}
                  onClick={() => s.setMealType(s.mealType === m ? null : m)}
                  className={cn(
                    "min-h-10 rounded-xl px-1.5 py-2 text-[10px] font-semibold capitalize tracking-wide transition-all duration-300 touch-manipulation sm:text-[11px]",
                    s.mealType === m
                      ? "border border-primary/20 bg-gradient-to-b from-primary/[0.11] to-primary/[0.035] text-primary shadow-[0_0_18px_rgba(248,113,113,0.035),inset_0_1px_0_rgba(255,255,255,0.06)]"
                      : "border border-transparent text-muted-foreground/55 hover:bg-white/[0.035] hover:text-foreground/85",
                    s.vacationBlocksLog && !s.editingEntry && "opacity-45"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>

            {!s.editingEntry && (
              <div className="relative mt-2.5 grid grid-cols-3 gap-1.5">
                {LOG_MODES.map(({ id, label, caption, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    disabled={s.vacationBlocksLog}
                    onClick={() => {
                      s.setLogFoodMode(id)
                      if (id !== "estimate") s.setLogFoodPhotoOpen(false)
                    }}
                    className={cn(
                      "group flex min-h-[3.35rem] items-center gap-2 rounded-2xl border px-2.5 py-2 text-left transition-all duration-300 touch-manipulation",
                      s.logFoodMode === id
                        ? "border-primary/20 bg-gradient-to-br from-primary/[0.065] via-white/[0.035] to-transparent text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)]"
                        : "border-white/[0.065] bg-white/[0.02] text-muted-foreground/55 hover:border-white/[0.1] hover:bg-white/[0.035] hover:text-muted-foreground",
                      s.vacationBlocksLog && "opacity-45"
                    )}
                  >
                    <span className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-xl border transition-colors",
                      s.logFoodMode === id
                        ? "border-primary/20 bg-primary/[0.08] text-primary"
                        : "border-white/[0.06] bg-black/15 text-muted-foreground/50",
                    )}>
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold leading-tight">{label}</span>
                      <span className="mt-0.5 hidden truncate text-[8px] leading-tight text-muted-foreground/45 min-[430px]:block">{caption}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div
            key={`${s.logFoodMode}-${s.showCreateMeal ? "create" : "browse"}-${s.editingEntry ? "edit" : "log"}`}
            className="food-log-scroll relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-3 sm:px-5 sm:py-4"
          >
            <div className="flex min-h-full flex-col gap-3.5">
              {!s.editingEntry && s.draftMealItems.length > 0 && (
                <DraftMealsSection s={s} />
              )}

              {s.editingEntry ? (
                <EstimatePanel s={s} disabled={estimateDisabled} />
              ) : s.logFoodMode === "saved" ? (
                <SavedMealsSection s={s} />
              ) : s.logFoodMode === "search" ? (
                <div className="motion-safe:animate-fade-up motion-reduce:animate-none">
                  <FoodSearch
                    onSelect={s.handleFoodSelect}
                    onSave={s.handleSaveSearchFood}
                    compact
                    instantAdd
                  />
                </div>
              ) : (
                <div className="space-y-3.5 motion-safe:animate-fade-up motion-reduce:animate-none">
                  <EstimatePanel s={s} disabled={estimateDisabled} />
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/[0.09]" />
                      <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/40">
                        camera assist
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-r from-white/[0.09] to-transparent" />
                    </div>
                    {!s.logFoodPhotoOpen ? (
                      <button
                        type="button"
                        disabled={s.vacationBlocksLog}
                        onClick={() => s.setLogFoodPhotoOpen(true)}
                        className="group flex min-h-14 w-full items-center gap-3 border-y border-white/[0.07] px-1 py-3 text-left transition-colors hover:border-primary/25 disabled:pointer-events-none disabled:opacity-45 touch-manipulation"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Camera className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-foreground/90">Estimate from a photo</span>
                          <span className="mt-0.5 block text-[10px] text-muted-foreground/50">Snap the plate, then review before adding</span>
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground/35 transition-transform group-hover:translate-x-0.5 group-hover:text-primary/70" />
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
            <div className="relative z-20 shrink-0 border-t border-white/[0.075] bg-[oklch(0.105_0.008_250/88%)] px-3.5 pb-[max(0.75rem,calc(0.5rem+env(safe-area-inset-bottom)))] pt-3 backdrop-blur-2xl sm:px-5">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" />
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
                  <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-1 py-1">
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/40">Meal total</p>
                      <p className="mt-0.5 font-heading text-lg font-semibold tabular-nums leading-none text-foreground">
                        {s.draftTotals.calories.toLocaleString()} <span className="text-[10px] font-medium text-muted-foreground/45">cal</span>
                      </p>
                    </div>
                    <FooterMacro label="P" value={s.draftTotals.protein} tone="text-blue-300/85" />
                    <FooterMacro label="C" value={s.draftTotals.carbs} tone="text-amber-300/85" />
                    <FooterMacro label="F" value={s.draftTotals.fat} tone="text-rose-300/85" />
                  </div>
                  <Button
                    type="button"
                    variant="glass"
                    className="h-13 w-full press-scale text-sm font-semibold shadow-[0_0_24px_rgba(248,113,113,0.08)]"
                    size="default"
                    disabled={s.postingMeal || s.vacationBlocksLog}
                    onClick={() => void s.handlePostMealToDay()}
                  >
                    {s.postingMeal
                      ? "Posting..."
                      : `Add ${s.draftMealItems.length} item${s.draftMealItems.length === 1 ? "" : "s"} to today`}
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
              className="food-log-surface w-full max-w-sm rounded-[1.75rem] border border-white/[0.1] p-5 shadow-2xl"
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
    <form id="log-food-form" onSubmit={s.handleSubmit} className="space-y-3">
      <div className="relative overflow-hidden border-b border-white/[0.07] px-1 pb-4 pt-1 sm:px-2">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-primary/15 blur-3xl"
        />
        <div className="relative flex items-center justify-between">
          <Label htmlFor="calories" className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.18em] text-primary/70">
            <Flame className="size-3.5" />
            Calorie estimate
          </Label>
          <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground/35">tap to type</span>
        </div>
        <div className="relative mt-1 flex items-end gap-2">
          <Input
            id="calories"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            placeholder="0"
            value={s.calories}
            onChange={(e) => s.setCalories(e.target.value)}
            className="h-[4.5rem] min-w-0 flex-1 border-0 bg-transparent px-0 font-heading text-5xl font-semibold tracking-[-0.055em] tabular-nums text-foreground shadow-none placeholder:text-foreground/15 focus-visible:ring-0 sm:text-6xl"
            required
            disabled={disabled}
            autoFocus={!s.editingEntry}
          />
          <span className="mb-3 shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/40">cal</span>
        </div>
        <div className="relative mt-2 grid grid-cols-4 gap-1.5">
          {QUICK_CALS.map((n) => (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => s.addCalories(n)}
              className="h-10 rounded-xl border border-white/[0.07] bg-black/20 text-[11px] font-semibold tabular-nums text-muted-foreground/75 transition-all hover:border-primary/25 hover:bg-primary/10 hover:text-primary touch-manipulation disabled:pointer-events-none disabled:opacity-40"
            >
              +{n}
            </button>
          ))}
        </div>
      </div>

      <div className="border-b border-white/[0.07] px-1 pb-3 pt-1">
        <Label htmlFor="food-description" className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/40">
          Food description
        </Label>
        <Input
          id="food-description"
          placeholder="What did you eat?"
          value={s.description}
          onChange={(e) => s.setDescription(e.target.value)}
          disabled={disabled}
          className="mt-1 h-11 border-white/[0.07] bg-black/15 text-base sm:text-sm"
        />
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => s.setShowEstimateMacros((v) => !v)}
          className="flex min-h-12 w-full items-center justify-between border-b border-white/[0.07] px-1 text-left transition-colors hover:border-primary/20 touch-manipulation"
        >
          <span>
            <span className="block text-[11px] font-semibold text-foreground/80">Macros</span>
            <span className="block text-[9px] text-muted-foreground/45">Protein, carbs and fat are optional</span>
          </span>
          <span className="text-[10px] font-semibold text-primary/70">{s.showEstimateMacros ? "Hide" : "Add"}</span>
        </button>
        {s.showEstimateMacros && (
          <div className="grid grid-cols-3 gap-2 motion-safe:animate-fade-up motion-reduce:animate-none">
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
              className="flex h-12 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-xs font-medium text-primary/75 transition-colors hover:border-primary/20 hover:bg-primary/5 hover:text-primary touch-manipulation"
            >
              <Star className="h-3.5 w-3.5" />
              Save
            </button>
          )}
          <Button
            type="submit"
            variant="glass"
            size="sm"
            className="h-12 flex-1 text-sm font-semibold shadow-[0_0_20px_rgba(248,113,113,0.06)]"
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

function FooterMacro({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="text-center">
      <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted-foreground/35">{label}</p>
      <p className={cn("mt-0.5 text-xs font-semibold tabular-nums", tone)}>{Math.round(value)}g</p>
    </div>
  )
}

function DraftMealsSection({ s }: { s: ReturnType<typeof useLogFoodDialog> }) {
  return (
    <section className="border-b border-primary/15 pb-3 motion-safe:animate-fade-up motion-reduce:animate-none">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-primary/65">Current meal</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground/45">
            {s.draftMealItems.length} item{s.draftMealItems.length === 1 ? "" : "s"} queued
          </p>
        </div>
        <p className="font-heading text-sm font-semibold tabular-nums text-foreground/85">
          {s.draftTotals.calories.toLocaleString()} <span className="text-[9px] font-medium text-muted-foreground/40">cal</span>
        </p>
      </div>
      <div className="food-log-scroll max-h-[12rem] overflow-y-auto overscroll-contain pr-0.5">
        {s.draftMealItems.map((item) => {
          const totals = draftMealItemTotals(item)
          const isNew = s.lastAddedDraftId === item.id
          return (
            <div
              key={item.id}
              className={cn(
                "border-t border-white/[0.055] px-1 py-2.5 text-xs transition-colors duration-300 first:border-t-0",
                isNew && "bg-primary/[0.055]"
              )}
            >
              <div className="flex items-start gap-2">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="h-14 w-12 shrink-0 object-contain drop-shadow-[0_7px_12px_rgba(0,0,0,0.28)]"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight text-foreground/90">{item.description || "Quick add"}</p>
                  <p className="mt-1 text-[10px] capitalize tabular-nums text-muted-foreground/45">
                    {item.mealType} · {totals.calories} cal
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => s.setDraftMealItems((prev) => prev.filter((x) => x.id !== item.id))}
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground/35 transition-colors hover:bg-destructive/10 hover:text-destructive touch-manipulation"
                  aria-label={`Remove ${item.description || "item"}`}
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-white/[0.05] pt-2">
                <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/35">Servings</span>
                <QuantityStepper
                  compact
                  value={String(item.quantity)}
                  onChange={(next) => {
                    const q = parseFloat(next)
                    if (Number.isFinite(q) && q >= 0.5) s.updateDraftItemQuantity(item.id, q)
                  }}
                  onAdjust={(delta) => s.adjustDraftItemQuantity(item.id, delta)}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SavedMealsSection({ s }: { s: ReturnType<typeof useLogFoodDialog> }) {
  const filteredLibraryCount = Array.from(s.savedMealCategoryCounts.values()).reduce(
    (sum, count) => sum + count,
    0,
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col motion-safe:animate-fade-up motion-reduce:animate-none">
      <div className="mb-3 flex items-center justify-between gap-3 px-0.5">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary/65">
            Food library
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground/50">
            {s.mealType
              ? `Available for ${s.mealType}`
              : `${s.savedMeals.length} saved · tap one to add`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            s.setSaveMealError(null)
            s.setEditingSavedMealId(null)
            if (!s.showCreateMeal) s.setNewMealTags(s.mealType ? [s.mealType] : [])
            if (!s.showCreateMeal) {
              s.setNewMealCategory(s.mealType === "snack" ? "snack" : "meal")
            }
            s.setShowCreateMeal(!s.showCreateMeal)
          }}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3.5 py-2 text-xs font-semibold text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition-all hover:border-primary/20 hover:bg-primary/[0.045] active:scale-[0.98] touch-manipulation"
        >
          {s.showCreateMeal ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          {s.showCreateMeal ? "Cancel" : "New food"}
        </button>
      </div>

      {s.showCreateMeal && (
        <div
          data-create-meal
          className="mb-3 space-y-3 border-y border-white/[0.08] px-1 py-4 motion-safe:animate-fade-up motion-reduce:animate-none"
          onKeyDownCapture={(e) => {
            if (e.key === "Enter" && (e.target as HTMLElement).closest("[data-create-meal]")) {
              e.preventDefault()
              e.stopPropagation()
              void s.handleCreateMeal()
            }
          }}
        >
          <div>
            <p className="font-heading text-base font-semibold tracking-tight text-foreground/90">Create saved food</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/50">
              Add it once, then log it from your library in a single tap.
            </p>
          </div>
          <Input
            placeholder="Food name"
            value={s.newMealName}
            onChange={(e) => s.setNewMealName(e.target.value)}
            className="h-12 border-white/[0.08] bg-black/15 text-base sm:text-sm"
          />
          <FoodCategoryPicker
            value={s.newMealCategory}
            onChange={s.setNewMealCategory}
            label="What kind of food is it?"
          />
          <div className="space-y-1">
            <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">
              When do you usually eat it?
            </Label>
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
                      "min-h-10 rounded-xl border px-3 py-2 text-[11px] font-semibold capitalize transition-colors touch-manipulation",
                      on
                        ? "border-primary/25 bg-primary/[0.08] text-primary"
                        : "border-white/[0.06] bg-black/15 text-muted-foreground/60 hover:bg-white/[0.04]"
                    )}
                  >
                    {m}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">Cal *</Label>
              <Input type="number" min="0" placeholder="0" value={s.newMealCal} onChange={(e) => s.setNewMealCal(e.target.value)} className="h-11 border-white/[0.08] bg-black/15 text-base sm:text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">P</Label>
              <Input type="number" min="0" placeholder="g" value={s.newMealProtein} onChange={(e) => s.setNewMealProtein(e.target.value)} className="h-11 border-white/[0.08] bg-black/15 text-base sm:text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">C</Label>
              <Input type="number" min="0" placeholder="g" value={s.newMealCarbs} onChange={(e) => s.setNewMealCarbs(e.target.value)} className="h-11 border-white/[0.08] bg-black/15 text-base sm:text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">F</Label>
              <Input type="number" min="0" placeholder="g" value={s.newMealFat} onChange={(e) => s.setNewMealFat(e.target.value)} className="h-11 border-white/[0.08] bg-black/15 text-base sm:text-sm" />
            </div>
          </div>
          {s.saveMealError && <p className="text-[10px] text-destructive" role="alert">{s.saveMealError}</p>}
          <Button type="button" variant="glass" size="sm" className="h-12 w-full text-sm font-semibold" onClick={() => void s.handleCreateMeal()}>
            Save food
          </Button>
        </div>
      )}

      {s.savedMeals.length > 0 && !s.showCreateMeal && (
        <div className="mb-3 space-y-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/45" />
            <Input
              type="search"
              value={s.savedMealSearch}
              onChange={(event) => s.setSavedMealSearch(event.target.value)}
              placeholder="Search saved foods"
              aria-label="Search saved foods"
              className="h-12 rounded-2xl border-white/[0.08] bg-black/15 pl-10 pr-10 text-base sm:text-sm"
            />
            {s.savedMealSearch ? (
              <button
                type="button"
                onClick={() => s.setSavedMealSearch("")}
                aria-label="Clear saved food search"
                className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground/50 hover:bg-white/[0.05] hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
          <div
            className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Saved food categories"
          >
            <button
              type="button"
              onClick={() => s.setSavedMealCategory("all")}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors touch-manipulation",
                s.savedMealCategory === "all"
                  ? "border-primary/25 bg-primary/[0.08] text-primary"
                  : "border-white/[0.07] bg-white/[0.025] text-muted-foreground/60",
              )}
            >
              All
              <span className="tabular-nums opacity-60">{filteredLibraryCount}</span>
            </button>
            {SAVED_FOOD_CATEGORIES.map((category) => {
              const count = s.savedMealCategoryCounts.get(category.id) ?? 0
              if (count === 0) return null
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => s.setSavedMealCategory(category.id)}
                  className={cn(
                    "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors touch-manipulation",
                    s.savedMealCategory === category.id
                      ? "border-primary/25 bg-primary/[0.08] text-primary"
                      : "border-white/[0.07] bg-white/[0.025] text-muted-foreground/60",
                  )}
                >
                  {category.label}
                  <span className="tabular-nums opacity-60">{count}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {s.savedMeals.length === 0 && !s.showCreateMeal && (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary/[0.07]">
            <Bookmark className="size-5 text-primary/55" />
          </span>
          <p className="text-sm font-medium text-foreground/80">No saved foods yet</p>
          <p className="mt-1 max-w-[16rem] text-[12px] leading-relaxed text-muted-foreground/60">
            Save frequent foods for one-tap logging, or switch to Estimate for a quick calorie entry.
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
                s.setNewMealCategory(s.mealType === "snack" ? "snack" : "meal")
                s.setShowCreateMeal(true)
              }}
            >
              + Add food
            </Button>
          </div>
        </div>
      )}

      {s.savedMeals.length > 0 && s.displayedSavedMeals.length === 0 && (
        <div className="mb-2 border-y border-white/[0.07] px-4 py-5 text-center">
          <p className="text-sm font-medium text-foreground/80">No matching saved foods</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/55">
            Try another category, clear the search, or add a new food.
          </p>
        </div>
      )}

      {s.displayedSavedMeals.length > 0 && !s.showCreateMeal && (
        <div
          className="food-log-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y pr-0.5 [-webkit-overflow-scrolling:touch]"
          aria-label="Saved foods"
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
                    "group flex items-center gap-1.5 border-b border-white/[0.065] px-1 py-3 transition-colors duration-300",
                    inDraftCount > 0
                      ? "border-primary/20 bg-gradient-to-r from-primary/[0.045] to-transparent"
                      : "hover:border-white/[0.11] hover:bg-white/[0.025]",
                    flash && "animate-in zoom-in-95 duration-300 ring-2 ring-primary/45"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => s.handleUseSavedMeal(meal)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left touch-manipulation"
                  >
                    {meal.imageUrl ? (
                      <span className="relative h-16 w-14 shrink-0">
                        <img
                          src={meal.imageUrl}
                          alt=""
                          className="h-full w-full object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.3)]"
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border border-background bg-primary text-[9px] font-bold text-primary-foreground shadow-md">
                          {inDraftCount > 0 ? inDraftCount : <Plus className="size-3" />}
                        </span>
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-300",
                          inDraftCount > 0 ? "bg-primary/[0.11] text-primary" : "bg-white/[0.035] text-primary/65"
                        )}
                      >
                        {inDraftCount > 0 ? (
                          <span className="text-sm font-bold tabular-nums">{inDraftCount}</span>
                        ) : (
                          <Plus className="h-4 w-4 text-primary/70" />
                        )}
                      </span>
                    )}
                      <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
                      <span className="truncate text-sm font-semibold">{meal.name}</span>
                        <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-medium tabular-nums text-muted-foreground/55">
                          {meal.calories} cal
                        </span>
                        <span className="shrink-0 rounded-full border border-white/[0.07] bg-white/[0.025] px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/65">
                          {savedFoodCategoryLabel(meal.foodCategory)}
                        </span>
                        {tags.map((t) => (
                          <span
                            key={t}
                            className={cn(
                              "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium capitalize",
                              t === s.mealType ? "bg-primary/[0.08] text-primary/90" : "bg-muted/40 text-muted-foreground/70"
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
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground/35 transition-colors hover:bg-white/[0.05] hover:text-foreground/70 touch-manipulation [&_svg]:size-3.5"
                    aria-label={`Edit saved meal ${meal.name}`}
                  >
                    <Pencil />
                  </button>
                  <button
                    type="button"
                    onClick={() => s.requestDeleteSavedMeal(meal.id, meal.name)}
                    className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground/30 transition-colors hover:bg-destructive/10 hover:text-destructive touch-manipulation [&_svg]:size-3.5"
                    aria-label={`Delete saved meal ${meal.name}`}
                  >
                    <Trash2 />
                  </button>
                </div>
                {editingThis && (
                  <div
                    data-edit-saved-meal
                    className="mb-2 space-y-3 border-b border-white/[0.08] px-1 py-4 motion-safe:animate-fade-up motion-reduce:animate-none"
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
                      className="h-12 border-white/[0.08] bg-black/15 text-base sm:text-sm"
                      placeholder="Food name"
                    />
                    <FoodCategoryPicker
                      value={s.editSavedCategory}
                      onChange={s.setEditSavedCategory}
                      label="Food type"
                    />
                    <div className="space-y-1">
                      <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">
                        Meal-time tags
                      </Label>
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
                                "min-h-10 rounded-xl border px-3 py-2 text-[11px] font-semibold capitalize transition-colors touch-manipulation",
                                on
                                  ? "border-primary/30 bg-primary/15 text-primary"
                                  : "border-white/[0.06] bg-black/15 text-muted-foreground/60 hover:bg-white/[0.04]"
                              )}
                            >
                              {m}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="space-y-1">
                        <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">Cal *</Label>
                        <Input type="number" min="0" value={s.editSavedCal} onChange={(e) => s.setEditSavedCal(e.target.value)} className="h-11 border-white/[0.08] bg-black/15 text-base sm:text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">P</Label>
                        <Input type="number" min="0" value={s.editSavedProtein} onChange={(e) => s.setEditSavedProtein(e.target.value)} className="h-11 border-white/[0.08] bg-black/15 text-base sm:text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">C</Label>
                        <Input type="number" min="0" value={s.editSavedCarbs} onChange={(e) => s.setEditSavedCarbs(e.target.value)} className="h-11 border-white/[0.08] bg-black/15 text-base sm:text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">F</Label>
                        <Input type="number" min="0" value={s.editSavedFat} onChange={(e) => s.setEditSavedFat(e.target.value)} className="h-11 border-white/[0.08] bg-black/15 text-base sm:text-sm" />
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
                        className="h-11 flex-1"
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

function FoodCategoryPicker({
  value,
  onChange,
  label,
}: {
  value: SavedFoodCategory
  onChange: (category: SavedFoodCategory) => void
  label: string
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
        {label}
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SAVED_FOOD_CATEGORIES.map((category) => {
          const selected = value === category.id
          return (
            <button
              key={category.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(category.id)}
              className={cn(
                "min-h-11 rounded-xl border px-2.5 py-2 text-left text-[10px] font-semibold leading-tight transition-all touch-manipulation",
                selected
                  ? "border-primary/25 bg-gradient-to-br from-primary/[0.085] to-primary/[0.025] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  : "border-white/[0.07] bg-black/15 text-muted-foreground/65 hover:bg-white/[0.045] hover:text-foreground/80",
              )}
            >
              {category.singular}
            </button>
          )
        })}
      </div>
    </fieldset>
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
      <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.06] bg-black/15 p-1">
        <button
          type="button"
          disabled={disabled || numeric <= 0.5}
          onClick={() => onAdjust(-0.5)}
          className={cn(
            "flex touch-manipulation items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.025] transition-colors hover:border-primary/20 hover:bg-primary/[0.07] disabled:cursor-not-allowed disabled:opacity-30",
            compact ? "size-8" : "size-9"
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
            "border-0 bg-transparent px-1 text-center tabular-nums shadow-none focus-visible:ring-1 focus-visible:ring-primary/30",
            compact ? "h-8 w-12 text-sm font-semibold" : "h-9 w-16 text-base font-semibold"
          )}
          aria-label="Quantity"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAdjust(0.5)}
          className={cn(
            "flex touch-manipulation items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.025] transition-colors hover:border-primary/20 hover:bg-primary/[0.07] disabled:opacity-30",
            compact ? "size-8" : "size-9"
          )}
          aria-label="Increase quantity"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
