"use client"
/* eslint-disable @next/next/no-img-element -- food images can come from dynamic food sources */

import { useState } from "react"
import {
  Barcode,
  BookOpen,
  Camera,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Minus,
  PencilLine,
  Plus,
  Save,
  Search,
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
import { BarcodeScanner } from "@/components/calories/BarcodeScanner"
import { RestaurantMenuBrowser } from "@/components/calories/RestaurantMenuBrowser"
import {
  PhotoCalorieEstimator,
  type PhotoEstimatePrefill,
} from "@/components/calories/PhotoCalorieEstimator"
import { FoodFallbackIcon } from "@/components/calories/FoodFallbackIcon"
import {
  useLogFoodDialog,
  type UseLogFoodDialogOptions,
} from "@/components/calories/useLogFoodDialog"
import { draftMealItemTotals } from "@/lib/calories/log-food"
import {
  MEAL_SLOT_ACCENT,
  MEAL_SLOT_LABEL,
  MEAL_SLOT_RANGE_LABEL,
  asMealSlot,
  resolveMealSlot,
} from "@/lib/calories/meal-slots"
import { formatFoodPortion } from "@/lib/calories/measurements"

export type LogFoodDialogProps = UseLogFoodDialogOptions
type DialogState = ReturnType<typeof useLogFoodDialog>
type ComposerScreen = "search" | "library" | "manual" | "meal" | "recipe"

/**
 * Three places to get a food, and that is all. Scanning is a button in the
 * footer, photo estimation lives inside Quick add (it only ever prefills that
 * form), and restaurant menus are a shelf in the Library.
 */
const COMPOSER_TABS = [
  { id: "search", label: "Search", icon: Search },
  { id: "library", label: "Library", icon: BookOpen },
  { id: "manual", label: "Quick add", icon: PencilLine },
] as const

/** Screens that browse foods and therefore keep the search field in view. */
const BROWSE_SCREENS = new Set<ComposerScreen>(["search", "library"])

/** Screens that are building something rather than browsing. */
const BUILDER_SCREENS = new Set<ComposerScreen>(["meal", "recipe"])

const CALORIES_COLOR = "#ef4444"

export function LogFoodDialog(props: LogFoodDialogProps) {
  const { open } = props
  const { activeDate } = useActiveDate()
  const state = useLogFoodDialog(props)
  const [screen, setScreen] = useState<ComposerScreen>(() =>
    props.editingMeal || (props.initialMealSlot && !props.startInFoodSearch)
      ? "meal"
      : "search",
  )
  const [query, setQuery] = useState("")
  const [barcodeScan, setBarcodeScan] = useState<{ code: string; id: number } | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const editingEntry = Boolean(state.editingEntry)
  const editingMeal = Boolean(state.editingMeal)
  const visibleScreen = editingEntry ? "manual" : screen
  const activeSlot =
    state.mealSlot ?? state.editingMeal?.mealSlot ?? props.initialMealSlot ?? null

  function handleOpenChange(next: boolean) {
    if (!next) {
      setScreen(
        props.initialMealSlot && !props.startInFoodSearch ? "meal" : "search",
      )
      setQuery("")
      setBarcodeScan(null)
      setPhotoOpen(false)
      state.resetRecipeCreator()
    }
    props.onOpenChange(next)
  }

  function showScreen(next: Exclude<ComposerScreen, "meal">) {
    setScreen(next)
    state.setLogFoodMode(next === "manual" ? "estimate" : "saved")
    if (next !== "manual") setPhotoOpen(false)
  }

  function handleTab(id: (typeof COMPOSER_TABS)[number]["id"]) {
    showScreen(id)
  }

  const description = editingEntry && state.editingEntry
    ? `${formatDisplayDate(parseLocalDate(state.editingEntry.date.split("T")[0]))} · ${MEAL_SLOT_LABEL[resolveMealSlot(state.editingEntry)]}`
    : state.editingMeal?.entries[0]
      ? `${formatDisplayDate(parseLocalDate(state.editingMeal.entries[0].date.split("T")[0]))} · ${MEAL_SLOT_LABEL[state.editingMeal.mealSlot]}`
    : formatDisplayDate(parseLocalDate(activeDate))

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "glass-frost food-log-surface flex h-[calc(100dvh-1.5rem)] max-h-[calc(100dvh-1.5rem)] w-[min(100%,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0",
          "sm:max-w-2xl",
          "[&_[data-slot=dialog-close]]:right-3 [&_[data-slot=dialog-close]]:top-3",
        )}
      >
        <header className="shrink-0 border-b border-white/[0.07] px-4 pb-0 pt-4 pr-12">
          <DialogHeader className="space-y-0 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2 font-heading text-base tracking-tight">
              {editingEntry
                ? "Edit food"
                : editingMeal
                  ? `Edit ${state.editingMeal ? MEAL_SLOT_LABEL[state.editingMeal.mealSlot].toLowerCase() : "meal"}`
                  : visibleScreen === "meal"
                    ? state.draftMealItems.length === 0
                      ? "Build meal"
                      : "Review meal"
                    : "Add food"}
              {activeSlot ? (
                <span
                  className="ml-0.5 inline-flex h-6 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.025] px-2 font-sans text-[10px] font-semibold tracking-wide text-foreground/75"
                  aria-label={`Logging into the ${MEAL_SLOT_LABEL[activeSlot].toLowerCase()} block`}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: MEAL_SLOT_ACCENT[activeSlot] }}
                    aria-hidden
                  />
                  {MEAL_SLOT_LABEL[activeSlot]}
                  <span className="font-normal text-muted-foreground/50">
                    {MEAL_SLOT_RANGE_LABEL[activeSlot]}
                  </span>
                </span>
              ) : null}
            </DialogTitle>
            <DialogDescription className="type-hud-caption mt-0.5 normal-case text-muted-foreground/60">
              {description}
            </DialogDescription>
          </DialogHeader>

          {!editingEntry && !BUILDER_SCREENS.has(visibleScreen) ? (
            <nav
              className="-mx-1 mt-3 flex gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Food logging method"
            >
              {COMPOSER_TABS.map(({ id, label, icon: Icon }) => {
                const active = visibleScreen === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleTab(id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex h-11 shrink-0 items-center gap-1.5 px-3 type-hud-micro transition-colors",
                      "after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors",
                      active
                        ? "text-foreground after:bg-foreground/75"
                        : "text-muted-foreground/55 after:bg-transparent hover:text-foreground/85",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                )
              })}
            </nav>
          ) : null}
        </header>

        {state.vacationBlocksLog && !editingEntry && !editingMeal ? (
          <div className="mx-4 mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 text-xs text-amber-100/85">
            Food logging is paused by vacation mode until {state.vacationResumeLabel}.
          </div>
        ) : null}

        <main className="food-log-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {BROWSE_SCREENS.has(visibleScreen) ? (
            <UnifiedFoodSearch
              savedMeals={state.savedMeals}
              recipes={state.recipes}
              mealSlot={state.mealSlot}
              query={query}
              mode={visibleScreen === "library" ? "library" : "search"}
              barcodeScan={barcodeScan}
              renderRestaurants={() => (
                <RestaurantMenuBrowser onAdd={state.handleFoodSelect} />
              )}
              onCreateRecipe={() => {
                state.setDraftMealItems([])
                state.setShowRecipeCreator(true)
                setScreen("recipe")
              }}
              onAddCatalog={state.handleFoodSelect}
              onAddSaved={state.handleUseSavedMeal}
              onAddFrequent={state.handleUseFrequentFood}
              onAddRecipe={(recipe) => {
                state.handleUseRecipe(recipe)
                setScreen("meal")
              }}
              onSaveCatalog={state.handleSaveSearchFood}
            />
          ) : null}

          {visibleScreen === "manual" ? (
            <ManualEntryPanel
              state={state}
              photoOpen={photoOpen}
              onTogglePhoto={() => setPhotoOpen((open) => !open)}
              onPhotoPrefill={(prefill) => {
                state.handlePhotoPrefill(prefill)
                setPhotoOpen(false)
              }}
              onAdded={() => {
                if (!editingEntry && state.estimateCalDisplay != null) setScreen("meal")
              }}
            />
          ) : null}

          {visibleScreen === "meal" ? (
            <MealReview state={state} onBack={() => setScreen("search")} />
          ) : null}

          {visibleScreen === "recipe" ? (
            <RecipeCreator
              state={state}
              onBack={() => {
                state.setDraftMealItems([])
                state.resetRecipeCreator()
                setScreen("library")
              }}
              onAddIngredients={() => setScreen("search")}
              onSaved={() => {
                // The ingredients belonged to the recipe, not to today's log.
                state.setDraftMealItems([])
                setScreen("library")
              }}
            />
          ) : null}
        </main>

        <DialogFooter
          state={state}
          editingEntry={editingEntry}
          editingMeal={editingMeal}
          screen={visibleScreen}
          slotLabel={activeSlot ? MEAL_SLOT_LABEL[activeSlot] : "meal"}
          query={query}
          onQueryChange={setQuery}
          onScan={() => setScannerOpen(true)}
          buildingRecipe={state.showRecipeCreator}
          onReview={() => setScreen(state.showRecipeCreator ? "recipe" : "meal")}
        />

        {scannerOpen ? (
          <BarcodeScanner
            onClose={() => setScannerOpen(false)}
            onDetected={(value) => {
              setScannerOpen(false)
              setScreen("search")
              setQuery(value)
              setBarcodeScan({ code: value, id: Date.now() })
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function DialogFooter({
  state,
  editingEntry,
  editingMeal,
  screen,
  slotLabel,
  query,
  onQueryChange,
  onScan,
  buildingRecipe,
  onReview,
}: {
  state: DialogState
  editingEntry: boolean
  editingMeal: boolean
  screen: ComposerScreen
  slotLabel: string
  query: string
  onQueryChange: (value: string) => void
  onScan: () => void
  /** Items being gathered belong to a recipe, not to today's log. */
  buildingRecipe: boolean
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

  const browsing = BROWSE_SCREENS.has(screen)
  const draftCount = state.draftMealItems.length
  // The recipe builder carries its own Save button.
  if (screen === "recipe") return null
  if (draftCount === 0 && !editingMeal && !browsing) return null

  return (
    <div className="shrink-0 border-t border-border/30 bg-background/70 px-4 py-3 pb-[max(0.75rem,calc(0.5rem+env(safe-area-inset-bottom)))] backdrop-blur-md">
      {state.postMealError ? (
        <p className="mb-2 text-center text-[11px] text-destructive" role="alert">
          {state.postMealError}
        </p>
      ) : null}

      {/* What is already in the draft, above the search row — the only place
          the running total needs to live while browsing. */}
      {browsing && draftCount > 0 ? (
        <button
          type="button"
          onClick={onReview}
          className="mb-2 flex h-11 w-full items-center gap-2.5 rounded-xl border border-white/[0.09] bg-white/[0.025] px-3 text-left transition-colors hover:border-white/[0.16] hover:bg-white/[0.045]"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-white/[0.05] text-foreground/70">
            <Utensils className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1 text-[12px] font-medium text-foreground/85">
            {draftCount} {buildingRecipe ? "ingredient" : "item"}
            {draftCount === 1 ? "" : "s"} {buildingRecipe ? "added" : "ready"}
            <span className="ml-1.5 tabular-nums text-muted-foreground/60">
              {state.draftTotals.calories.toLocaleString()} cal
            </span>
          </span>
          <span className="type-hud-micro text-muted-foreground/70">
            {buildingRecipe ? "Back to recipe" : "Review"}
          </span>
          <ChevronRight className="size-3.5 text-muted-foreground/50" />
        </button>
      ) : null}

      {/* Search and scan sit at the bottom, in thumb reach, and stay put
          while results scroll behind them. */}
      {browsing ? (
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground/50"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={screen === "library" ? "Search your library" : "Search for a food"}
              className="food-search-input h-11 rounded-full pl-10 pr-9 text-sm"
              aria-label="Search for a food"
            />
            {query ? (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-white/[0.05]"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onScan}
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.025] text-foreground/75 transition-colors hover:border-white/[0.2] hover:bg-white/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
            aria-label="Scan a barcode"
          >
            <Barcode className="size-5" />
          </button>
        </div>
      ) : screen === "meal" ? (
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
          className="flex h-14 w-full items-center gap-3 rounded-xl border border-white/[0.09] bg-white/[0.025] px-3 text-left press-scale transition-colors hover:border-white/[0.16] hover:bg-white/[0.045]"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-white/[0.05] text-foreground/70">
            <Utensils className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground/90">
              Review {slotLabel.toLowerCase()}
            </span>
            <span className="type-hud-caption mt-0.5 block normal-case">
              {draftCount} item{draftCount === 1 ? "" : "s"} ·{" "}
              {state.draftTotals.calories.toLocaleString()} cal
            </span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground/50" />
        </button>
      )}
    </div>
  )
}

function MealReview({ state, onBack }: { state: DialogState; onBack: () => void }) {
  const slot = asMealSlot(state.mealSlot)
  const accent = {
    dot: slot ? MEAL_SLOT_ACCENT[slot] : CALORIES_COLOR,
    text: slot ? MEAL_SLOT_ACCENT[slot] : "#fca5a5",
  }
  const slotLabel = slot ? MEAL_SLOT_LABEL[slot] : "Meal"

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

      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
        <div className="flex items-center gap-3 px-4 py-4">
          <span
            className="h-9 w-1 shrink-0 rounded-full"
            style={{ background: accent.dot, boxShadow: `0 0 12px ${accent.dot}55` }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: accent.text }}>
              {slotLabel}
              {slot ? (
                <span className="ml-2 font-medium normal-case tracking-normal text-muted-foreground/55">
                  {MEAL_SLOT_RANGE_LABEL[slot]}
                </span>
              ) : null}
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
          <div className="rounded-2xl border border-dashed border-white/[0.09] px-5 py-10 text-center">
            <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-white/[0.04] text-muted-foreground/60">
              <Utensils className="size-5" />
            </span>
            <p className="mt-3 text-sm font-medium">Your {slotLabel.toLowerCase()} block is empty</p>
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
                    state.lastAddedDraftId === item.id && "border-white/[0.2] bg-white/[0.05]",
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
                      <FoodFallbackIcon
                        label={item.description || "Food"}
                        className="rounded-xl"
                      />
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

    </div>
  )
}

function RecipeCreator({
  state,
  onBack,
  onAddIngredients,
  onSaved,
}: {
  state: DialogState
  onBack: () => void
  onAddIngredients: () => void
  onSaved: () => void
}) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex h-9 items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to library
      </button>

      <div>
        <p className="type-hud-subsection">New recipe</p>
        <h3 className="mt-1 font-heading text-lg font-semibold">
          Build it once, log it in a tap
        </h3>
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

      <label className="group relative flex aspect-[16/9] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border/30 bg-glass-highlight/[0.04] text-center transition-colors hover:border-white/[0.18] hover:bg-white/[0.03]">
        {state.recipeImageUrl ? (
          <>
            <img src={state.recipeImageUrl} alt="" className="absolute inset-0 size-full object-cover" />
            <span className="relative rounded-full bg-black/65 px-3 py-1.5 text-[10px] font-semibold text-white backdrop-blur-md">
              Change picture
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center">
            <ImagePlus className="size-6 text-muted-foreground/60" />
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

      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="type-hud-label-soft">Ingredients</p>
          <p className="text-[11px] tabular-nums text-muted-foreground/60">
            {state.draftTotals.calories.toLocaleString()} cal
          </p>
        </div>
        {state.draftMealItems.length === 0 ? (
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/55">
            No ingredients yet — search for the foods that make up this recipe.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {state.draftMealItems.map((item) => {
              const totals = draftMealItemTotals(item)
              return (
                <li
                  key={item.id}
                  className="flex items-baseline justify-between gap-3 text-[12px]"
                >
                  <span className="min-w-0 flex-1 truncate text-foreground/85">
                    {item.description || "Ingredient"}
                    {item.quantity !== 1 ? (
                      <span className="ml-1 text-muted-foreground/50">×{item.quantity}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground/60">
                    {totals.calories.toLocaleString()}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <button
          type="button"
          onClick={onAddIngredients}
          className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/[0.12] type-hud-micro text-muted-foreground/75 transition-colors hover:border-white/[0.22] hover:bg-white/[0.03] hover:text-foreground/85"
        >
          <Plus className="size-3.5" />
          {state.draftMealItems.length === 0 ? "Add ingredients" : "Add another ingredient"}
        </button>
      </div>

      {state.recipeError ? (
        <p className="text-xs text-destructive" role="alert">{state.recipeError}</p>
      ) : null}

      <Button
        type="button"
        variant="glass"
        className="h-12 w-full"
        disabled={state.recipeSaving || state.recipeImageUploading}
        onClick={() => {
          void state.handleSaveRecipe().then((saved) => {
            if (saved) onSaved()
          })
        }}
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
  photoOpen,
  onTogglePhoto,
  onPhotoPrefill,
  onAdded,
}: {
  state: DialogState
  photoOpen: boolean
  onTogglePhoto: () => void
  onPhotoPrefill: (prefill: PhotoEstimatePrefill) => void
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
      className="space-y-4"
    >
      {/* Photo estimation only ever fills in this form, so it lives here
          rather than behind its own tab. */}
      {!state.editingEntry ? (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.018]">
          <button
            type="button"
            onClick={onTogglePhoto}
            disabled={state.vacationBlocksLog}
            aria-expanded={photoOpen}
            className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-white/[0.02] disabled:opacity-50"
          >
            <span className="flex size-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-foreground/70">
              <Camera className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-medium text-foreground/85">
                Estimate from a photo
              </span>
              <span className="block type-hud-caption normal-case tracking-normal">
                Fills the fields below for you
              </span>
            </span>
            <ChevronRight
              className={cn(
                "size-4 shrink-0 text-muted-foreground/50 transition-transform",
                photoOpen && "rotate-90",
              )}
            />
          </button>
          {photoOpen ? (
            <div className="border-t border-white/[0.06] p-3">
              <PhotoCalorieEstimator
                open
                embedded
                onOpenChange={(next) => {
                  if (!next) onTogglePhoto()
                }}
                onUsePrefill={onPhotoPrefill}
                disabled={state.vacationBlocksLog}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-4 text-center">
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
