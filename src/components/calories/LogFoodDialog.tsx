"use client"
/* eslint-disable @next/next/no-img-element -- food images can come from dynamic food sources */

import { useState } from "react"
import { format } from "date-fns"
import {
  BookOpen,
  Camera,
  ChevronDown,
  Flame,
  ImagePlus,
  Minus,
  PencilLine,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Utensils,
  X,
} from "lucide-react"
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
import { cn, parseLocalDate } from "@/lib/utils"
import {
  UnifiedFoodSearch,
} from "@/components/calories/UnifiedFoodSearch"
import { PhotoCalorieEstimator } from "@/components/calories/PhotoCalorieEstimator"
import { useLogFoodDialog, type UseLogFoodDialogOptions } from "@/components/calories/useLogFoodDialog"
import { draftMealItemTotals, mealTypes } from "@/lib/calories/log-food"
import { formatFoodPortion } from "@/lib/calories/measurements"

export type LogFoodDialogProps = UseLogFoodDialogOptions
type DialogState = ReturnType<typeof useLogFoodDialog>

export function LogFoodDialog(props: LogFoodDialogProps) {
  const { open, onOpenChange } = props
  const state = useLogFoodDialog(props)
  const [mobileTrayOpen, setMobileTrayOpen] = useState(false)
  const editing = Boolean(state.editingEntry)
  const manualMode = editing || state.logFoodMode === "estimate"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "food-log-surface food-log-composer flex h-[calc(100dvh-0.5rem)] max-h-[calc(100dvh-0.5rem)] w-[calc(100vw-0.5rem)] max-w-none flex-col gap-0 overflow-hidden rounded-[1.5rem] p-0",
          "sm:h-[min(92dvh,58rem)] sm:max-h-[58rem] sm:w-[min(96vw,68rem)] sm:rounded-[2rem]",
          "[&_[data-slot=dialog-close]]:right-3 [&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:z-50",
          "[&_[data-slot=dialog-close]]:size-10 [&_[data-slot=dialog-close]]:rounded-xl [&_[data-slot=dialog-close]]:border [&_[data-slot=dialog-close]]:border-white/[0.08] [&_[data-slot=dialog-close]]:bg-black/20",
        )}
      >
        <ComposerHeader state={state} editing={editing} />

        {state.vacationBlocksLog && !editing ? (
          <div className="m-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs text-amber-100/85">
            Food logging is paused by vacation mode until {state.vacationResumeLabel}.
          </div>
        ) : null}

        {!editing && state.draftMealItems.length > 0 ? (
          <button
            type="button"
            onClick={() => setMobileTrayOpen((value) => !value)}
            className="mx-3 mt-3 flex min-h-12 items-center gap-3 rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 text-left md:hidden"
          >
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Utensils className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold">
                Review meal · {state.draftMealItems.length} item
                {state.draftMealItems.length === 1 ? "" : "s"}
              </span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                {state.draftTotals.calories.toLocaleString()} calories
              </span>
            </span>
            <ChevronDown
              className={cn("size-4 transition-transform", mobileTrayOpen && "rotate-180")}
            />
          </button>
        ) : null}

        {!editing && mobileTrayOpen && state.draftMealItems.length > 0 ? (
          <div className="mx-3 max-h-[40dvh] overflow-y-auto border-b border-white/[0.08] py-3 md:hidden">
            <MealTray state={state} compact />
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_20rem]">
          <main className="food-log-scroll min-h-0 overflow-y-auto overscroll-contain px-3.5 py-3 sm:px-6 sm:py-5">
            {manualMode ? (
              <ManualEntryPanel state={state} />
            ) : (
              <UnifiedFoodSearch
                savedMeals={state.savedMeals}
                recipes={state.recipes}
                onAddCatalog={state.handleFoodSelect}
                onAddSaved={state.handleUseSavedMeal}
                onAddRecipe={state.handleUseRecipe}
                onSaveCatalog={state.handleSaveSearchFood}
              />
            )}
          </main>

          {!editing ? (
            <aside className="hidden min-h-0 border-l border-white/[0.08] bg-black/[0.09] md:flex md:flex-col">
              <MealTray state={state} />
            </aside>
          ) : null}
        </div>

        {editing ? (
          <div className="shrink-0 border-t border-white/[0.08] bg-black/15 px-4 py-3 sm:px-6">
            <div className="ml-auto flex max-w-sm gap-2">
              <Button type="button" variant="outline" className="h-12 flex-1" onClick={state.cancelEdit}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="manual-food-form"
                variant="glass"
                className="h-12 flex-1"
                disabled={state.vacationBlocksEditingEntry}
              >
                Save changes
              </Button>
            </div>
          </div>
        ) : state.draftMealItems.length > 0 ? (
          <div className="shrink-0 border-t border-white/[0.08] bg-[oklch(0.105_0.008_250/94%)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-2xl md:hidden">
            {state.postMealError ? (
              <p className="mb-2 text-center text-[11px] text-destructive" role="alert">
                {state.postMealError}
              </p>
            ) : null}
            <Button
              type="button"
              variant="glass"
              className="h-13 w-full text-sm font-semibold"
              disabled={state.postingMeal || state.vacationBlocksLog}
              onClick={() => void state.handlePostMealToDay()}
            >
              {state.postingMeal
                ? "Adding meal…"
                : `Add meal · ${state.draftTotals.calories.toLocaleString()} cal`}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ComposerHeader({ state, editing }: { state: DialogState; editing: boolean }) {
  return (
    <header className="relative z-30 shrink-0 border-b border-white/[0.08] px-4 pb-3 pt-4 pr-14 sm:px-6 sm:pb-4 sm:pt-5">
      <DialogHeader className="space-y-0 text-left">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Utensils className="size-4" />
          </span>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary/70">
              Nutrition
            </p>
            <DialogTitle className="mt-0.5 font-heading text-xl font-semibold tracking-tight sm:text-2xl">
              {editing ? "Edit food" : "Add food"}
            </DialogTitle>
          </div>
        </div>
        <DialogDescription className="sr-only">
          {editing ? "Edit a logged food" : "Search foods and build a meal"}
        </DialogDescription>
      </DialogHeader>

      {editing && state.editingEntry ? (
        <p className="mt-2 text-[11px] capitalize text-muted-foreground">
          {format(parseLocalDate(state.editingEntry.date.split("T")[0]), "MMM d")} ·{" "}
          {state.editingEntry.mealType}
        </p>
      ) : (
        <>
          <div className="mt-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {mealTypes.map((meal) => (
              <button
                key={meal}
                type="button"
                onClick={() => state.setMealType(meal)}
                className={cn(
                  "h-10 min-w-[4.75rem] flex-1 rounded-xl border px-3 text-[10px] font-bold capitalize tracking-wide transition-colors",
                  state.mealType === meal
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-white/[0.07] bg-white/[0.02] text-muted-foreground/60 hover:bg-white/[0.04]",
                )}
              >
                {meal}
              </button>
            ))}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                state.setLogFoodMode("saved")
                state.setLogFoodPhotoOpen(false)
              }}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-semibold transition-colors",
                state.logFoodMode !== "estimate"
                  ? "border-white/[0.1] bg-white/[0.045] text-foreground"
                  : "border-white/[0.06] text-muted-foreground/55",
              )}
            >
              <Sparkles className="size-3.5" />
              Search
            </button>
            <button
              type="button"
              onClick={() => {
                state.setLogFoodMode("estimate")
                state.setLogFoodPhotoOpen(false)
              }}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-semibold transition-colors",
                state.logFoodMode === "estimate" && !state.logFoodPhotoOpen
                  ? "border-white/[0.1] bg-white/[0.045] text-foreground"
                  : "border-white/[0.06] text-muted-foreground/55",
              )}
            >
              <PencilLine className="size-3.5" />
              Quick add
            </button>
            <button
              type="button"
              onClick={() => {
                state.setLogFoodMode("estimate")
                state.setLogFoodPhotoOpen(true)
              }}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-semibold transition-colors",
                state.logFoodPhotoOpen
                  ? "border-white/[0.1] bg-white/[0.045] text-foreground"
                  : "border-white/[0.06] text-muted-foreground/55",
              )}
            >
              <Camera className="size-3.5" />
              Photo
            </button>
          </div>
        </>
      )}
    </header>
  )
}

function MealTray({ state, compact = false }: { state: DialogState; compact?: boolean }) {
  if (state.showRecipeCreator) return <RecipeCreator state={state} />

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", !compact && "p-4")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-primary/70">
            Current meal
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {state.draftMealItems.length === 0
              ? "Foods you add appear here"
              : `${state.draftMealItems.length} item${state.draftMealItems.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {state.draftMealItems.length > 0 ? (
          <button
            type="button"
            onClick={() => state.setDraftMealItems([])}
            className="flex size-9 items-center justify-center rounded-xl text-muted-foreground/45 hover:bg-destructive/10 hover:text-destructive"
            aria-label="Clear current meal"
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>

      {state.draftMealItems.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-9 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-white/[0.035] text-muted-foreground/35">
            <Utensils className="size-5" />
          </span>
          <p className="mt-3 max-w-[13rem] text-[11px] leading-relaxed text-muted-foreground/55">
            Search once across the food database, your saved foods, and recipes.
          </p>
        </div>
      ) : (
        <div className="food-log-scroll mt-3 min-h-0 flex-1 overflow-y-auto">
          {state.draftMealItems.map((item) => {
            const totals = draftMealItemTotals(item)
            const portion = formatFoodPortion(
              item.portionAmount != null
                ? item.portionAmount * item.quantity
                : item.quantity,
              item.portionUnit ?? "serving",
            )
            return (
              <div key={item.id} className="border-t border-white/[0.065] py-3 first:border-t-0">
                <div className="flex items-start gap-2.5">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="size-11 shrink-0 rounded-xl object-contain" />
                  ) : (
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.035] text-primary/55">
                      <Utensils className="size-4" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-xs font-semibold leading-snug">
                      {item.description || "Quick add"}
                    </p>
                    <p className="mt-1 text-[9px] text-muted-foreground/50">
                      {portion ? `${portion} · ` : ""}
                      {totals.calories} cal
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      state.setDraftMealItems((current) =>
                        current.filter((candidate) => candidate.id !== item.id),
                      )
                    }
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/35 hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remove ${item.description || "food"}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    disabled={item.quantity <= 0.5}
                    onClick={() => state.adjustDraftItemQuantity(item.id, -0.5)}
                    className="flex size-8 items-center justify-center rounded-lg border border-white/[0.07] text-muted-foreground disabled:opacity-30"
                    aria-label="Decrease portion"
                  >
                    <Minus className="size-3" />
                  </button>
                  <span className="w-11 text-center text-xs font-semibold tabular-nums">
                    {item.quantity}×
                  </span>
                  <button
                    type="button"
                    onClick={() => state.adjustDraftItemQuantity(item.id, 0.5)}
                    className="flex size-8 items-center justify-center rounded-lg border border-white/[0.07] text-muted-foreground"
                    aria-label="Increase portion"
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {state.draftMealItems.length > 0 ? (
        <div className="mt-3 shrink-0 border-t border-white/[0.08] pt-3">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2">
            <div>
              <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-muted-foreground/45">
                Total
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {state.draftTotals.calories.toLocaleString()}
                <span className="ml-1 text-[9px] text-muted-foreground">cal</span>
              </p>
            </div>
            <Macro label="P" value={state.draftTotals.protein} />
            <Macro label="C" value={state.draftTotals.carbs} />
            <Macro label="F" value={state.draftTotals.fat} />
          </div>
          <button
            type="button"
            onClick={() => state.setShowRecipeCreator(true)}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/25 hover:bg-primary/[0.06] hover:text-primary"
          >
            <BookOpen className="size-4" />
            Save meal as recipe
          </button>
          {!compact ? (
            <>
              {state.postMealError ? (
                <p className="mt-2 text-[10px] text-destructive" role="alert">
                  {state.postMealError}
                </p>
              ) : null}
              <Button
                type="button"
                variant="glass"
                className="mt-2 h-12 w-full text-sm font-semibold"
                disabled={state.postingMeal || state.vacationBlocksLog}
                onClick={() => void state.handlePostMealToDay()}
              >
                {state.postingMeal ? "Adding meal…" : "Add meal to today"}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function RecipeCreator({ state }: { state: DialogState }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-primary/70">
            New recipe
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Save this entire meal for later
          </p>
        </div>
        <button
          type="button"
          onClick={state.resetRecipeCreator}
          className="flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-white/[0.05]"
          aria-label="Close recipe form"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <Label htmlFor="recipe-name" className="text-[9px] uppercase tracking-wider text-muted-foreground">
            Recipe name
          </Label>
          <Input
            id="recipe-name"
            value={state.recipeName}
            onChange={(event) => state.setRecipeName(event.target.value)}
            placeholder="Chicken rice bowl"
            className="mt-1.5 h-12 bg-black/15"
            autoFocus
          />
        </div>
        <label className="group relative flex aspect-[16/10] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.025] text-center transition-colors hover:border-primary/30 hover:bg-primary/[0.04]">
          {state.recipeImageUrl ? (
            <>
              <img src={state.recipeImageUrl} alt="" className="absolute inset-0 size-full object-cover" />
              <span className="relative rounded-full bg-black/65 px-3 py-1.5 text-[10px] font-semibold text-white backdrop-blur-md">
                Change picture
              </span>
            </>
          ) : (
            <span className="flex flex-col items-center">
              <ImagePlus className="size-6 text-primary/65" />
              <span className="mt-2 text-xs font-semibold">Add a recipe picture</span>
              <span className="mt-1 text-[9px] text-muted-foreground">JPEG, PNG or WebP · 6 MB max</span>
            </span>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={state.recipeImageUploading}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void state.handleRecipeImage(file)
            }}
          />
        </label>
        <div className="rounded-2xl border border-white/[0.07] bg-black/10 px-3 py-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground/50">
            Recipe contents
          </p>
          <p className="mt-1.5 text-xs font-semibold">
            {state.draftMealItems.length} ingredient
            {state.draftMealItems.length === 1 ? "" : "s"} ·{" "}
            {state.draftTotals.calories.toLocaleString()} cal
          </p>
        </div>
        {state.recipeError ? (
          <p className="text-[10px] text-destructive" role="alert">{state.recipeError}</p>
        ) : null}
      </div>

      <Button
        type="button"
        variant="glass"
        className="mt-auto h-12 w-full"
        disabled={state.recipeSaving || state.recipeImageUploading}
        onClick={() => void state.handleSaveRecipe()}
      >
        {state.recipeImageUploading ? (
          "Uploading picture…"
        ) : state.recipeSaving ? (
          "Saving recipe…"
        ) : (
          <>
            <Save className="size-4" />
            Save recipe
          </>
        )}
      </Button>
    </div>
  )
}

function ManualEntryPanel({ state }: { state: DialogState }) {
  if (state.logFoodPhotoOpen && !state.editingEntry) {
    return (
      <div className="mx-auto w-full max-w-xl">
        <PhotoCalorieEstimator
          open
          embedded
          onOpenChange={state.setLogFoodPhotoOpen}
          onUsePrefill={state.handlePhotoPrefill}
          disabled={state.vacationBlocksLog}
        />
      </div>
    )
  }

  const disabled =
    (state.vacationBlocksLog && !state.editingEntry) ||
    state.vacationBlocksEditingEntry

  return (
    <form
      id="manual-food-form"
      onSubmit={state.handleSubmit}
      className="mx-auto w-full max-w-xl space-y-6 py-2"
    >
      <div>
        <Label htmlFor="calories" className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-primary/75">
          <Flame className="size-3.5" />
          Calories
        </Label>
        <div className="mt-1 flex items-end gap-2 border-b border-white/[0.09]">
          <Input
            id="calories"
            type="number"
            min="1"
            value={state.calories}
            onChange={(event) => state.setCalories(event.target.value)}
            placeholder="0"
            required
            disabled={disabled}
            className="h-24 flex-1 border-0 bg-transparent px-0 font-heading text-6xl font-semibold tracking-[-0.05em] shadow-none focus-visible:ring-0"
            autoFocus
          />
          <span className="mb-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            cal
          </span>
        </div>
      </div>
      <div>
        <Label htmlFor="food-description" className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">
          Food description
        </Label>
        <Input
          id="food-description"
          value={state.description}
          onChange={(event) => state.setDescription(event.target.value)}
          placeholder="What did you eat?"
          disabled={disabled}
          className="mt-1.5 h-13 bg-black/15 text-base"
        />
      </div>
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">
          Macros <span className="font-normal normal-case tracking-normal">(optional)</span>
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <MacroInput label="Protein" value={state.protein} onChange={state.setProtein} disabled={disabled} />
          <MacroInput label="Carbs" value={state.carbs} onChange={state.setCarbs} disabled={disabled} />
          <MacroInput label="Fat" value={state.fat} onChange={state.setFat} disabled={disabled} />
        </div>
      </div>
      {!state.editingEntry ? (
        <div className="flex gap-2">
          {state.showSavePrompt && state.description ? (
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={() => void state.handleSaveCurrentAsFrequent()}
            >
              <Save className="size-4" />
              Save food
            </Button>
          ) : null}
          <Button type="submit" variant="glass" className="h-12 flex-1" disabled={disabled}>
            <Plus className="size-4" />
            Add to meal
          </Button>
        </div>
      ) : null}
    </form>
  )
}

function MacroInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  return (
    <label>
      <span className="text-[9px] text-muted-foreground">{label}</span>
      <span className="relative mt-1 block">
        <Input
          type="number"
          min="0"
          step="0.1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0"
          disabled={disabled}
          className="h-12 bg-black/15 pr-7"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
          g
        </span>
      </span>
    </label>
  )
}

function Macro({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-[8px] font-bold text-muted-foreground/45">{label}</p>
      <p className="mt-1 text-[10px] font-semibold tabular-nums">{Math.round(value)}g</p>
    </div>
  )
}
