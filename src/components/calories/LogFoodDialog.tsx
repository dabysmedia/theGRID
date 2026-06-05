"use client"

import { createPortal } from "react-dom"
import { format } from "date-fns"
import {
  ChevronDown,
  Search,
  Trash2,
  Plus,
  Star,
  X,
  Pencil,
  Target,
  Check,
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
import { mealTypes, savedMealTagList } from "@/lib/calories/log-food"
import { useLogFoodDialog, type UseLogFoodDialogOptions } from "@/components/calories/useLogFoodDialog"

export type LogFoodDialogProps = UseLogFoodDialogOptions

export function LogFoodDialog(props: LogFoodDialogProps) {
  const { open, onOpenChange } = props
  const s = useLogFoodDialog(props)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton
          className={cn(
            "glass-frost flex min-h-0 flex-col gap-0 overflow-hidden p-0",
            "[&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3"
          )}
        >
          <div className="shrink-0 px-4 pt-4 pb-3 pr-12">
            <DialogHeader className="space-y-0">
              <DialogTitle>{s.editingEntry ? "Edit entry" : "Log food"}</DialogTitle>
              <DialogDescription className="sr-only">
                {s.editingEntry ? "Edit a calorie entry" : "Add food to your daily log"}
              </DialogDescription>
            </DialogHeader>
            {s.editingEntry && (
              <p className="mt-1 truncate text-[10px] capitalize text-muted-foreground/60">
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
            <div className="mt-3 flex rounded-lg bg-muted/20 p-0.5">
              {mealTypes.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={s.vacationBlocksLog && !s.editingEntry}
                  onClick={() => s.setMealType(m)}
                  className={cn(
                    "flex-1 rounded-md py-2.5 text-xs font-medium capitalize transition-all duration-150",
                    s.mealType === m
                      ? "bg-background text-foreground shadow-sm shadow-black/10"
                      : "text-muted-foreground/50 hover:text-muted-foreground",
                    s.vacationBlocksLog && !s.editingEntry && "opacity-45"
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
              disabled={s.vacationBlocksLog && !s.editingEntry}
              onClick={() => s.setLogFoodSearchOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 rounded-lg py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-45"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Search className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <span className="truncate">Search foods</span>
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 opacity-50 transition-transform duration-200",
                  s.logFoodSearchOpen && "rotate-180"
                )}
              />
            </button>
            {s.logFoodSearchOpen && (
              <div className="overflow-visible pt-2.5">
                <FoodSearch onSelect={s.handleFoodSelect} compact />
              </div>
            )}
          </div>

          <div className="relative z-0 min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-4">
              {!s.editingEntry && (
                <SavedMealsSection s={s} />
              )}

              {!s.editingEntry && (
                <PhotoCalorieEstimator
                  open={s.logFoodPhotoOpen}
                  onOpenChange={s.setLogFoodPhotoOpen}
                  onUsePrefill={s.handlePhotoPrefill}
                  disabled={s.vacationBlocksLog}
                />
              )}

              {!s.editingEntry && (
                <button
                  type="button"
                  disabled={s.vacationBlocksLog && !s.editingEntry}
                  onClick={() => s.setLogFoodManualOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-border/25 bg-glass-highlight/[0.04] py-2.5 px-3 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-glass-highlight/10 disabled:pointer-events-none disabled:opacity-45"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Target className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    <span className="truncate">Estimate calories</span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 opacity-40 transition-transform duration-200",
                      s.logFoodManualOpen && "rotate-180"
                    )}
                  />
                </button>
              )}

              {(s.editingEntry || s.logFoodManualOpen) && (
                <form id="log-food-form" onSubmit={s.handleSubmit} className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center gap-2">
                    <Input
                      id="calories"
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      placeholder="Calories"
                      value={s.calories}
                      onChange={(e) => s.setCalories(e.target.value)}
                      className="flex-1 min-w-0 h-11"
                      required
                      disabled={s.vacationBlocksLog && !s.editingEntry ? true : s.vacationBlocksEditingEntry}
                    />
                    {([
                      { n: 250, label: "+250" },
                      { n: 500, label: "+500" },
                      { n: 1000, label: "+1k" },
                    ] as const).map(({ n, label }) => (
                      <button
                        key={n}
                        type="button"
                        disabled={(s.vacationBlocksLog && !s.editingEntry) || s.vacationBlocksEditingEntry}
                        onClick={() => s.addCalories(n)}
                        className="h-11 rounded-md border border-glass-border px-3 text-xs font-medium tabular-nums text-muted-foreground/50 hover:bg-glass-highlight/15 hover:text-foreground transition-colors touch-manipulation disabled:pointer-events-none disabled:opacity-40"
                        title={`Add ${n.toLocaleString()} cal`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {s.showSavePrompt && s.description && s.calories && (
                      <button
                        type="button"
                        onClick={() => void s.handleSaveCurrentAsFrequent()}
                        className="flex items-center gap-1.5 rounded-md border border-dashed border-primary/20 px-3 py-2.5 text-xs font-medium text-primary/50 hover:text-primary hover:bg-primary/5 transition-colors touch-manipulation"
                      >
                        <Star className="h-3.5 w-3.5" />
                        Save
                      </button>
                    )}
                    {!s.editingEntry && (
                      <Button type="submit" variant="glass" size="sm" className="flex-1 h-11 text-sm" disabled={s.vacationBlocksLog}>
                        {s.estimateCalDisplay != null
                          ? `Add ${s.estimateCalDisplay.toLocaleString()} cal`
                          : "Add to meal"}
                      </Button>
                    )}
                  </div>
                </form>
              )}

              {!s.editingEntry && s.draftMealItems.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40 mb-1.5">
                    Draft · {s.draftMealItems.length}
                  </p>
                  <div className="rounded-lg border border-glass-border/30 divide-y divide-glass-border/20 overflow-hidden">
                    {s.draftMealItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-3 text-xs">
                        <div className="min-w-0">
                          <p className="truncate font-medium leading-tight text-sm">{item.description || "Quick add"}</p>
                          <p className="mt-0.5 text-[11px] capitalize tabular-nums text-muted-foreground/40">
                            {item.mealType} · {item.calories} cal
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => s.setDraftMealItems((prev) => prev.filter((x) => x.id !== item.id))}
                          className="p-2 rounded-md hover:bg-destructive/10 shrink-0 touch-manipulation"
                        >
                          <X className="h-4 w-4 text-muted-foreground/30" />
                        </button>
                      </div>
                    ))}
                    <div className="px-3 py-1.5 text-[10px] tabular-nums font-medium text-muted-foreground/50 bg-glass-highlight/5">
                      {s.draftTotals.calories.toLocaleString()} cal
                      {(s.draftTotals.protein > 0 || s.draftTotals.carbs > 0 || s.draftTotals.fat > 0) && (
                        <span className="text-muted-foreground/30">
                          {" "}
                          · P {Math.round(s.draftTotals.protein)}g · C {Math.round(s.draftTotals.carbs)}g · F{" "}
                          {Math.round(s.draftTotals.fat)}g
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {(s.editingEntry || s.draftMealItems.length > 0 || s.postingMeal) && (
            <div className="shrink-0 border-t border-border/30 px-4 py-3 bg-background/60 backdrop-blur-sm">
              {s.editingEntry ? (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1 h-11" size="default" onClick={s.cancelEdit}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="glass"
                    form="log-food-form"
                    className="flex-1 press-scale h-11"
                    size="default"
                    disabled={s.vacationBlocksEditingEntry}
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="glass"
                  className="w-full press-scale h-11 text-sm"
                  size="default"
                  disabled={s.postingMeal || s.vacationBlocksLog}
                  onClick={() => void s.handlePostMealToDay()}
                >
                  {s.postingMeal
                    ? "Posting..."
                    : `Post meal · ${s.draftMealItems.length} item${s.draftMealItems.length === 1 ? "" : "s"}`}
                </Button>
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

function SavedMealsSection({ s }: { s: ReturnType<typeof useLogFoodDialog> }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Saved</p>
        <button
          type="button"
          onClick={() => {
            s.setSaveMealError(null)
            s.setEditingSavedMealId(null)
            if (!s.showCreateMeal) s.setNewMealTags([s.mealType])
            s.setShowCreateMeal(!s.showCreateMeal)
          }}
          className="min-h-10 shrink-0 rounded-lg border border-primary/25 bg-primary/10 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-primary transition-colors hover:border-primary/40 hover:bg-primary/18 active:scale-[0.98] touch-manipulation"
        >
          {s.showCreateMeal ? "Cancel" : "+ New"}
        </button>
      </div>

      {s.showCreateMeal && (
        <div
          data-create-meal
          className="glass-subtle rounded-lg p-3 mb-2 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200"
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

      {s.savedMeals.length > 0 && s.displayedSavedMeals.length === 0 && (
        <p className="mb-2 text-[11px] text-muted-foreground/70">
          No saved meals tagged for <span className="capitalize font-medium text-foreground/80">{s.mealType}</span>. Switch
          meal type or add one with this tag.
        </p>
      )}

      {s.displayedSavedMeals.length > 0 && (
        <div
          className="max-h-[min(42vh,300px)] overflow-y-auto overscroll-y-contain touch-pan-y space-y-0.5 pr-0.5 [-webkit-overflow-scrolling:touch]"
          aria-label="Saved meals for this meal type"
        >
          {s.displayedSavedMeals.map((meal) => {
            const inDraft = s.savedMealIdsInDraft.has(meal.id)
            const flash = s.flashSavedMealId === meal.id
            const tags = savedMealTagList(meal)
            const editingThis = s.editingSavedMealId === meal.id
            return (
              <div key={meal.id} className="space-y-0">
                <div
                  className={cn(
                    "group flex items-center gap-2 rounded-xl px-2.5 py-2.5 transition-all duration-300",
                    inDraft
                      ? "ring-1 ring-primary/35 bg-gradient-to-r from-primary/[0.09] to-transparent shadow-[inset_0_1px_0_0_oklch(1_0_0/6%)]"
                      : "hover:bg-glass-highlight/15",
                    flash && "animate-in zoom-in-95 duration-300 ring-2 ring-primary/45"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => s.handleUseSavedMeal(meal)}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left touch-manipulation"
                  >
                    <div
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-md shrink-0 transition-colors duration-300",
                        inDraft ? "bg-primary/20 text-primary" : "bg-primary/10"
                      )}
                    >
                      {inDraft ? (
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                      ) : (
                        <Plus className="h-3.5 w-3.5 text-primary/60" />
                      )}
                    </div>
                    <span className="flex min-w-0 flex-1 flex-col gap-1 text-left sm:flex-row sm:items-center sm:flex-wrap sm:gap-2">
                      <span className="text-sm font-medium truncate">{meal.name}</span>
                      <span className="flex flex-wrap items-center gap-1">
                        {tags.map((t) => (
                          <span
                            key={t}
                            className={cn(
                              "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium capitalize",
                              t === s.mealType ? "bg-primary/15 text-primary/90" : "bg-muted/40 text-muted-foreground/80"
                            )}
                          >
                            {t}
                          </span>
                        ))}
                        {inDraft && (
                          <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary/80">
                            In meal
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                  <span className="text-xs tabular-nums text-muted-foreground/40 shrink-0">{meal.calories}</span>
                  <button
                    type="button"
                    onClick={() => s.requestDeleteSavedMeal(meal.id, meal.name)}
                    className="history-row-delete rounded-md"
                    aria-label={`Delete saved meal ${meal.name}`}
                  >
                    <Trash2 />
                  </button>
                  <button
                    type="button"
                    onClick={() => s.openEditSavedMeal(meal)}
                    className="history-row-delete rounded-md"
                    aria-label={`Edit saved meal ${meal.name}`}
                  >
                    <Pencil />
                  </button>
                </div>
                {editingThis && (
                  <div
                    data-edit-saved-meal
                    className="glass-subtle mt-1 mb-2 rounded-lg p-3 space-y-2 border border-border/25"
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
