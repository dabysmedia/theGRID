"use client"
/* eslint-disable @next/next/no-img-element -- food images can come from dynamic food sources */

import { useState } from "react"
import {
  BookOpen,
  Camera,
  ChevronLeft,
  ChevronRight,
  Flame,
  ImagePlus,
  Minus,
  PencilLine,
  Plus,
  Save,
  Search,
  Store,
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
import { useActiveDate } from "@/context/DateContext"
import { cn, formatDisplayDate, parseLocalDate } from "@/lib/utils"
import { UnifiedFoodSearch } from "@/components/calories/UnifiedFoodSearch"
import { RestaurantMenuBrowser } from "@/components/calories/RestaurantMenuBrowser"
import { PhotoCalorieEstimator } from "@/components/calories/PhotoCalorieEstimator"
import {
  useLogFoodDialog,
  type UseLogFoodDialogOptions,
} from "@/components/calories/useLogFoodDialog"
import { draftMealItemTotals, mealTypes } from "@/lib/calories/log-food"
import { formatFoodPortion } from "@/lib/calories/measurements"

export type LogFoodDialogProps = UseLogFoodDialogOptions
type DialogState = ReturnType<typeof useLogFoodDialog>
type ComposerScreen = "foods" | "restaurants" | "manual" | "photo" | "meal"

const CALORIES_COLOR = "#ef4444"
const MEAL_ACCENT: Record<string, { dot: string; text: string }> = {
  breakfast: { dot: "#f59e0b", text: "#fbbf24" },
  lunch: { dot: "#38bdf8", text: "#7dd3fc" },
  dinner: { dot: "#f87171", text: "#fca5a5" },
  snack: { dot: "#94a3b8", text: "#cbd5e1" },
}

export function LogFoodDialog(props: LogFoodDialogProps) {
  const { open } = props
  const { activeDate } = useActiveDate()
  const state = useLogFoodDialog(props)
  const [screen, setScreen] = useState<ComposerScreen>(() =>
    props.editingMeal || props.initialMealType ? "meal" : "foods",
  )
  const editingEntry = Boolean(state.editingEntry)
  const editingMeal = Boolean(state.editingMeal)
  const visibleScreen = editingEntry ? "manual" : screen

  function handleOpenChange(next: boolean) {
    if (!next) {
      setScreen(props.initialMealType ? "meal" : "foods")
      state.resetRecipeCreator()
    }
    props.onOpenChange(next)
  }

  function showScreen(next: Exclude<ComposerScreen, "meal">) {
    setScreen(next)
    state.setLogFoodMode(next === "manual" || next === "photo" ? "estimate" : "saved")
    state.setLogFoodPhotoOpen(next === "photo")
  }

  const description = editingEntry && state.editingEntry
    ? `${formatDisplayDate(parseLocalDate(state.editingEntry.date.split("T")[0]))} · ${state.editingEntry.mealType}`
    : state.editingMeal?.entries[0]
      ? `${formatDisplayDate(parseLocalDate(state.editingMeal.entries[0].date.split("T")[0]))} · ${state.editingMeal.mealType}`
    : formatDisplayDate(parseLocalDate(activeDate))

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "glass-frost food-log-surface flex h-[95dvh] max-h-[95dvh] w-[min(100%,calc(100vw-0.75rem))] max-w-none flex-col gap-0 overflow-hidden p-0",
          "sm:h-[min(92dvh,54rem)] sm:max-h-[54rem] sm:max-w-2xl",
          "[&_[data-slot=dialog-close]]:right-3 [&_[data-slot=dialog-close]]:top-3",
        )}
      >
        <header
          className="shrink-0 border-b border-border/20 bg-gradient-to-b from-[#ef4444]/[0.08] to-transparent px-4 pb-3 pt-4 pr-12"
        >
          <DialogHeader className="space-y-0 text-left">
            <DialogTitle className="flex items-center gap-2 font-heading text-lg tracking-tight">
              <span className="flex size-8 items-center justify-center rounded-xl border border-[#ef4444]/20 bg-[#ef4444]/[0.08]">
                <Flame className="size-4 text-[#ef4444]" aria-hidden />
              </span>
              {editingEntry
                ? "Edit food"
                : editingMeal
                  ? `Edit ${state.editingMeal?.mealType ?? "meal"}`
                  : visibleScreen === "meal"
                    ? state.draftMealItems.length === 0
                      ? "Build meal"
                      : "Review meal"
                    : "Add food"}
            </DialogTitle>
            <DialogDescription className="type-hud-caption mt-1 normal-case text-muted-foreground/70">
              {description}
            </DialogDescription>
          </DialogHeader>

          {!editingEntry && visibleScreen !== "meal" ? (
            <div className="mt-3 flex rounded-xl border border-glass-border bg-glass-highlight/20 p-1">
              {mealTypes.map((meal) => {
                const accent = MEAL_ACCENT[meal]
                const selected = state.mealType === meal
                return (
                  <button
                    key={meal}
                    type="button"
                    onClick={() => state.setMealType(meal)}
                    className={cn(
                      "flex-1 rounded-lg py-2 text-[11px] font-semibold capitalize tracking-wide transition-colors",
                      selected
                        ? "bg-background/90 text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span
                      className="mr-1.5 inline-block size-1.5 rounded-full align-middle"
                      style={{ background: accent.dot }}
                    />
                    {meal}
                  </button>
                )
              })}
            </div>
          ) : null}

          {!editingEntry && visibleScreen !== "meal" ? (
            <nav className="mt-2 flex gap-1 overflow-x-auto [scrollbar-width:none]" aria-label="Food logging method">
              {[
                { id: "foods" as const, label: "Foods", icon: Search },
                { id: "restaurants" as const, label: "Restaurants", icon: Store },
                { id: "manual" as const, label: "Quick add", icon: PencilLine },
                { id: "photo" as const, label: "Photo", icon: Camera },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => showScreen(id)}
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 type-hud-micro transition-colors",
                    visibleScreen === id
                      ? "bg-[#ef4444]/[0.08] text-red-100/90"
                      : "text-muted-foreground/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </nav>
          ) : null}
        </header>

        {state.vacationBlocksLog && !editingEntry && !editingMeal ? (
          <div className="mx-4 mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 text-xs text-amber-100/85">
            Food logging is paused by vacation mode until {state.vacationResumeLabel}.
          </div>
        ) : null}

        <main className="food-log-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {visibleScreen === "foods" ? (
            <UnifiedFoodSearch
              savedMeals={state.savedMeals}
              recipes={state.recipes}
              onAddCatalog={state.handleFoodSelect}
              onAddSaved={state.handleUseSavedMeal}
              onAddRecipe={(recipe) => {
                state.handleUseRecipe(recipe)
                setScreen("meal")
              }}
              onSaveCatalog={state.handleSaveSearchFood}
            />
          ) : null}

          {visibleScreen === "restaurants" ? (
            <RestaurantMenuBrowser onAdd={state.handleFoodSelect} />
          ) : null}

          {visibleScreen === "manual" ? (
            <ManualEntryPanel
              state={state}
              onAdded={() => {
                if (!editingEntry && state.estimateCalDisplay != null) setScreen("meal")
              }}
            />
          ) : null}

          {visibleScreen === "photo" ? (
            <PhotoCalorieEstimator
              open
              embedded
              onOpenChange={(next) => {
                state.setLogFoodPhotoOpen(next)
                if (!next) setScreen("manual")
              }}
              onUsePrefill={(prefill) => {
                state.handlePhotoPrefill(prefill)
                setScreen("manual")
              }}
              disabled={state.vacationBlocksLog}
            />
          ) : null}

          {visibleScreen === "meal" ? (
            <MealReview state={state} onBack={() => setScreen("foods")} />
          ) : null}
        </main>

        <DialogFooter
          state={state}
          editingEntry={editingEntry}
          editingMeal={editingMeal}
          screen={visibleScreen}
          onReview={() => setScreen("meal")}
        />
      </DialogContent>
    </Dialog>
  )
}

function DialogFooter({
  state,
  editingEntry,
  editingMeal,
  screen,
  onReview,
}: {
  state: DialogState
  editingEntry: boolean
  editingMeal: boolean
  screen: ComposerScreen
  onReview: () => void
}) {
  if (editingEntry) {
    return (
      <div className="shrink-0 border-t border-border/30 bg-background/70 px-4 py-3 pb-[max(0.75rem,calc(0.5rem+env(safe-area-inset-bottom)))] backdrop-blur-md">
        <div className="flex gap-2">
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
    )
  }

  if (state.draftMealItems.length === 0 && !editingMeal) return null

  return (
    <div className="shrink-0 border-t border-border/30 bg-background/70 px-4 py-3 pb-[max(0.75rem,calc(0.5rem+env(safe-area-inset-bottom)))] backdrop-blur-md">
      {state.postMealError ? (
        <p className="mb-2 text-center text-[11px] text-destructive" role="alert">
          {state.postMealError}
        </p>
      ) : null}
      {screen === "meal" ? (
        <Button
          type="button"
          variant="glass"
          className="h-12 w-full press-scale text-sm font-semibold"
          disabled={
            state.postingMeal ||
            (editingMeal ? state.vacationBlocksEditingEntry : state.vacationBlocksLog)
          }
          onClick={() => void state.handlePostMealToDay()}
        >
          {state.postingMeal
            ? editingMeal
              ? "Saving meal…"
              : "Adding meal…"
            : editingMeal
              ? state.draftMealItems.length === 0
                ? "Delete meal"
                : `Save meal · ${state.draftTotals.calories.toLocaleString()} cal`
              : `Add ${state.draftMealItems.length} item${state.draftMealItems.length === 1 ? "" : "s"} · ${state.draftTotals.calories.toLocaleString()} cal`}
        </Button>
      ) : (
        <button
          type="button"
          onClick={onReview}
          className="flex h-14 w-full items-center gap-3 rounded-xl border border-red-300/20 bg-red-400/[0.06] px-3 text-left press-scale transition-colors hover:bg-red-400/[0.1]"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-red-400/[0.09] text-red-200">
            <Utensils className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-red-50/90">Review current meal</span>
            <span className="type-hud-caption mt-0.5 block normal-case">
              {state.draftMealItems.length} item{state.draftMealItems.length === 1 ? "" : "s"} ·{" "}
              {state.draftTotals.calories.toLocaleString()} cal
            </span>
          </span>
          <ChevronRight className="size-4 text-red-200/65" />
        </button>
      )}
    </div>
  )
}

function MealReview({ state, onBack }: { state: DialogState; onBack: () => void }) {
  if (state.showRecipeCreator) return <RecipeCreator state={state} />

  const accent = MEAL_ACCENT[state.mealType ?? ""] ?? {
    dot: CALORIES_COLOR,
    text: "#fca5a5",
  }

  return (
    <div className="space-y-4">
      {state.draftMealItems.length > 0 ? (
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Add more food
        </button>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-border/25 bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-[#ef4444]/[0.06]">
        <div className="flex items-center gap-3 px-4 py-4">
          <span
            className="h-9 w-1 shrink-0 rounded-full"
            style={{ background: accent.dot, boxShadow: `0 0 12px ${accent.dot}55` }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: accent.text }}>
              {state.mealType ?? "Meal"}
            </p>
            <p className="type-hud-caption mt-0.5 normal-case">
              {state.draftMealItems.length === 0
                ? "Empty meal"
                : `${state.draftMealItems.length} item${state.draftMealItems.length === 1 ? "" : "s"} ${
                    state.editingMeal ? "in this meal" : "ready to log"
                  }`}
            </p>
          </div>
          <p className="font-heading text-3xl font-semibold tabular-nums text-red-100/90">
            {state.draftTotals.calories.toLocaleString()}
            <span className="type-hud-unit ml-1">cal</span>
          </p>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-border/25 border-t border-border/20 py-3">
          <NutritionTotal label="Protein" value={state.draftTotals.protein} />
          <NutritionTotal label="Carbs" value={state.draftTotals.carbs} />
          <NutritionTotal label="Fat" value={state.draftTotals.fat} />
        </dl>
      </section>

      <section>
        <div className="flex items-center justify-between pb-2">
          <p className="type-hud-subsection">Meal contents</p>
          {state.draftMealItems.length > 0 ? (
            <button
              type="button"
              onClick={() => state.setDraftMealItems([])}
              className="flex h-8 items-center gap-1.5 rounded-lg px-2 type-hud-micro text-muted-foreground/55 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              Clear
            </button>
          ) : null}
        </div>

        {state.draftMealItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-red-300/15 bg-red-400/[0.025] px-5 py-10 text-center">
            <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-red-400/[0.07] text-red-200/65">
              <Utensils className="size-5" />
            </span>
            <p className="mt-3 text-sm font-medium">Your {state.mealType ?? "meal"} is empty</p>
            <p className="mt-1 text-xs text-muted-foreground/55">
              Add foods, a restaurant item, or a quick entry.
            </p>
            <Button type="button" variant="glass" className="mt-5 h-11" onClick={onBack}>
              <Plus className="size-4" />
              Add food
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {state.draftMealItems.map((item) => {
              const totals = draftMealItemTotals(item)
              const portion = formatFoodPortion(
                item.portionAmount != null
                  ? item.portionAmount * item.quantity
                  : item.quantity,
                item.portionUnit ?? "serving",
              )
              return (
                <li
                  key={item.id}
                  className={cn(
                    "rounded-2xl border border-border/25 bg-glass-highlight/[0.035] px-3 py-3 transition-colors",
                    state.lastAddedDraftId === item.id && "border-[#ef4444]/30 bg-[#ef4444]/[0.045]",
                  )}
                >
                  <div className="flex items-center gap-3">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="size-12 shrink-0 rounded-xl object-contain"
                      />
                    ) : (
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#ef4444]/[0.06] text-[#ef4444]/65">
                        <Utensils className="size-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[13px] font-medium leading-snug">
                        {item.description || "Quick add"}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {portion ? (
                          <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/65">
                            {portion}
                          </span>
                        ) : null}
                        <span className="text-[10px] tabular-nums text-muted-foreground/55">
                          {[
                            totals.protein != null ? `P ${totals.protein}g` : null,
                            totals.carbs != null ? `C ${totals.carbs}g` : null,
                            totals.fat != null ? `F ${totals.fat}g` : null,
                          ].filter(Boolean).join(" · ") || "Macros unavailable"}
                        </span>
                      </div>
                    </div>
                    <div className="w-14 shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums text-red-100/90">
                        {totals.calories.toLocaleString()}
                      </p>
                      <p className="type-hud-micro">cal</p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between border-t border-border/20 pt-2.5">
                    <span className="type-hud-micro">Quantity</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={item.quantity <= 0.5}
                        onClick={() => state.adjustDraftItemQuantity(item.id, -0.5)}
                        className="flex size-8 items-center justify-center rounded-lg border border-border/25 text-muted-foreground disabled:opacity-30"
                        aria-label={`Decrease ${item.description || "food"} quantity`}
                      >
                        <Minus className="size-3" />
                      </button>
                      <span className="w-12 text-center text-xs font-semibold tabular-nums">
                        {item.quantity}×
                      </span>
                      <button
                        type="button"
                        onClick={() => state.adjustDraftItemQuantity(item.id, 0.5)}
                        className="flex size-8 items-center justify-center rounded-lg border border-border/25 text-muted-foreground"
                        aria-label={`Increase ${item.description || "food"} quantity`}
                      >
                        <Plus className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          state.setDraftMealItems((current) =>
                            current.filter((candidate) => candidate.id !== item.id),
                          )
                        }
                        className="ml-1 flex size-8 items-center justify-center rounded-lg text-muted-foreground/45 hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Remove ${item.description || "food"}`}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {state.draftMealItems.length > 0 ? (
        <button
          type="button"
          onClick={() => state.setShowRecipeCreator(true)}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border/25 type-hud-micro text-muted-foreground transition-colors hover:border-[#ef4444]/25 hover:bg-[#ef4444]/[0.05] hover:text-red-100/85"
        >
          <BookOpen className="size-4" />
          Save this meal as a recipe
        </button>
      ) : null}
    </div>
  )
}

function RecipeCreator({ state }: { state: DialogState }) {
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={state.resetRecipeCreator}
        className="flex h-9 items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to meal
      </button>

      <div>
        <p className="type-hud-subsection">New recipe</p>
        <h3 className="mt-1 font-heading text-xl font-semibold">Save this meal for later</h3>
      </div>

      <div>
        <Label htmlFor="recipe-name" className="type-hud-label-soft">Recipe name</Label>
        <Input
          id="recipe-name"
          value={state.recipeName}
          onChange={(event) => state.setRecipeName(event.target.value)}
          placeholder="Chicken rice bowl"
          className="mt-1.5 h-12"
          autoFocus
        />
      </div>

      <label className="group relative flex aspect-[16/9] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border/30 bg-glass-highlight/[0.04] text-center transition-colors hover:border-[#ef4444]/30 hover:bg-[#ef4444]/[0.04]">
        {state.recipeImageUrl ? (
          <>
            <img src={state.recipeImageUrl} alt="" className="absolute inset-0 size-full object-cover" />
            <span className="relative rounded-full bg-black/65 px-3 py-1.5 text-[10px] font-semibold text-white backdrop-blur-md">
              Change picture
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center">
            <ImagePlus className="size-6 text-[#ef4444]/65" />
            <span className="mt-2 text-xs font-semibold">Add a recipe picture</span>
            <span className="type-hud-caption mt-1 normal-case">JPEG, PNG or WebP · 6 MB max</span>
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

      <div className="rounded-2xl border border-border/25 bg-gradient-to-b from-glass-highlight/[0.12] to-transparent px-4 py-4">
        <p className="type-hud-label-soft">Recipe contents</p>
        <p className="mt-1.5 text-sm font-semibold">
          {state.draftMealItems.length} ingredient{state.draftMealItems.length === 1 ? "" : "s"} ·{" "}
          {state.draftTotals.calories.toLocaleString()} cal
        </p>
      </div>

      {state.recipeError ? (
        <p className="text-xs text-destructive" role="alert">{state.recipeError}</p>
      ) : null}

      <Button
        type="button"
        variant="glass"
        className="h-12 w-full"
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

function ManualEntryPanel({
  state,
  onAdded,
}: {
  state: DialogState
  onAdded: () => void
}) {
  const disabled =
    (state.vacationBlocksLog && !state.editingEntry) ||
    state.vacationBlocksEditingEntry

  return (
    <form
      id="manual-food-form"
      onSubmit={(event) => {
        state.handleSubmit(event)
        onAdded()
      }}
      className="space-y-5"
    >
      <div className="rounded-2xl border border-border/25 bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-[#ef4444]/[0.06] px-4 py-5 text-center">
        <Label htmlFor="calories" className="type-hud-label-soft">Calories</Label>
        <Input
          id="calories"
          type="number"
          min="1"
          value={state.calories}
          onChange={(event) => state.setCalories(event.target.value)}
          placeholder="0"
          required
          disabled={disabled}
          className="h-16 border-0 bg-transparent px-0 text-center font-heading text-5xl font-semibold tabular-nums tracking-tight shadow-none focus-visible:ring-0"
          autoFocus
        />
        <p className="type-hud-unit">cal</p>
      </div>

      <div>
        <Label htmlFor="food-description" className="type-hud-label-soft">Food description</Label>
        <Input
          id="food-description"
          value={state.description}
          onChange={(event) => state.setDescription(event.target.value)}
          placeholder="What did you eat?"
          disabled={disabled}
          className="mt-1.5 h-12"
        />
      </div>

      <div>
        <p className="type-hud-label-soft">
          Macros <span className="normal-case tracking-normal">(optional)</span>
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
      <span className="type-hud-micro">{label}</span>
      <span className="relative mt-1 block">
        <Input
          type="number"
          min="0"
          step="0.1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0"
          disabled={disabled}
          className="h-12 pr-7"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
          g
        </span>
      </span>
    </label>
  )
}

function NutritionTotal({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 text-center">
      <p className="type-hud-stat-sm">{Math.round(value * 10) / 10}g</p>
      <p className="type-hud-micro mt-1">{label}</p>
    </div>
  )
}
