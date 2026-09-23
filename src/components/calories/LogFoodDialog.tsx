"use client"
/* eslint-disable @next/next/no-img-element -- food images can come from dynamic food sources */

import { useEffect, useRef, useState } from "react"
import {
  Barcode,
  BookOpen,
  Camera,
  ChevronLeft,
  ChevronDown,
  Trash2,
  Check,
  ChevronRight,
  ImagePlus,
  Minus,
  PencilLine,
  Plus,
  Save,
  Search,
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
import { FoodFallbackIcon } from "@/components/calories/FoodFallbackIcon"
import { MACRO_COLOR, MacroPill } from "@/components/calories/FoodTimeline"
import { RestaurantMenuBrowser } from "@/components/calories/RestaurantMenuBrowser"
import {
  PhotoCalorieEstimator,
  type PhotoEstimatePrefill,
} from "@/components/calories/PhotoCalorieEstimator"
import {
  useLogFoodDialog,
  type UseLogFoodDialogOptions,
} from "@/components/calories/useLogFoodDialog"
import { draftMealItemTotals } from "@/lib/calories/log-food"
import { formatFoodPortion, isFoodMeasurementUnit, portionStep } from "@/lib/calories/measurements"
import {
  MEAL_SLOT_ACCENT,
  MEAL_SLOT_LABEL,
  MEAL_SLOT_RANGE_LABEL,
  resolveMealSlot,
} from "@/lib/calories/meal-slots"
import { SAVED_FOOD_CATEGORIES } from "@/lib/calories/saved-food-category"

export type LogFoodDialogProps = UseLogFoodDialogOptions
type DialogState = ReturnType<typeof useLogFoodDialog>
type ComposerScreen = "search" | "library" | "manual" | "recipe"

/**
 * Three places to get a food, and that is all. Scanning is a button in the
 * search area, photo estimation lives inside Quick add (it only ever prefills that
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
const BUILDER_SCREENS = new Set<ComposerScreen>(["recipe"])


export function LogFoodDialog(props: LogFoodDialogProps) {
  const { open } = props
  const { activeDate } = useActiveDate()
  const state = useLogFoodDialog(props)
  const [screen, setScreen] = useState<ComposerScreen>("search")
  const [portionOpen, setPortionOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [barcodeScan, setBarcodeScan] = useState<{ code: string; id: number } | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const editingEntry = Boolean(state.editingEntry)
  const editingMeal = Boolean(state.editingMeal)
  const visibleScreen = editingEntry ? "manual" : screen
  const editingSaved = Boolean(state.editingSavedMealId)
  const activeSlot =
    state.mealSlot ?? state.editingMeal?.mealSlot ?? props.initialMealSlot ?? null

  function handleOpenChange(next: boolean) {
    if (!next) {
      setPortionOpen(false)
      setScreen("search")
      setQuery("")
      setBarcodeScan(null)
      setPhotoOpen(false)
      state.cancelEditSavedMeal()
      state.setPendingSavedDelete(null)
      state.resetRecipeCreator()
    }
    props.onOpenChange(next)
  }

  function showScreen(next: ComposerScreen) {
    state.cancelEditSavedMeal()
    setScreen(next)
    state.setLogFoodMode(next === "manual" ? "estimate" : "saved")
    if (next !== "manual") setPhotoOpen(false)
  }

  function handleTab(id: (typeof COMPOSER_TABS)[number]["id"]) {
    showScreen(id)
  }

  const browsing = BROWSE_SCREENS.has(visibleScreen) && !editingSaved

  // Resize the whole composer to the visible viewport, keeping every region
  // in normal flow. iOS can pan the viewport as well as shrink it for a keyboard.
  useEffect(() => {
    const surface = bodyEl?.closest<HTMLElement>(".food-log-surface")
    if (!surface || !open) return
    const viewport = window.visualViewport
    const sync = () => {
      const height = viewport?.height ?? window.innerHeight
      surface.style.setProperty("--food-viewport-height", `${height}px`)
      surface.style.setProperty("--food-viewport-top", `${viewport?.offsetTop ?? 0}px`)
      setKeyboardOpen(window.innerHeight - height > 120)
    }
    sync()
    window.addEventListener("resize", sync)
    viewport?.addEventListener("resize", sync)
    viewport?.addEventListener("scroll", sync)
    return () => {
      window.removeEventListener("resize", sync)
      viewport?.removeEventListener("resize", sync)
      viewport?.removeEventListener("scroll", sync)
    }
  }, [bodyEl, open])

  const description = editingEntry && state.editingEntry
    ? `${formatDisplayDate(parseLocalDate(state.editingEntry.date.split("T")[0]))} · ${MEAL_SLOT_LABEL[resolveMealSlot(state.editingEntry)]}`
    : state.editingMeal?.entries[0]
      ? `${formatDisplayDate(parseLocalDate(state.editingMeal.entries[0].date.split("T")[0]))} · ${MEAL_SLOT_LABEL[state.editingMeal.mealSlot]}`
    : formatDisplayDate(parseLocalDate(activeDate))

  const foodSearch = BROWSE_SCREENS.has(visibleScreen) ? (
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
        // Ingredients drop into the tray below, where the meal is assembled.
        state.handleUseRecipe(recipe)
      }}
      onSaveCatalog={state.handleSaveSearchFood}
      onEditSaved={state.openEditSavedMeal}
      onPortionChange={setPortionOpen}
    />
  ) : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        initialFocus={false}
        data-keyboard-open={keyboardOpen ? "true" : undefined}
        showCloseButton
        className={cn(
          "glass-frost food-log-surface flex h-[calc(100dvh-1.5rem)] max-h-[calc(100dvh-1.5rem)] w-[min(100%,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0",
          "sm:max-w-2xl",
          "[&_[data-slot=dialog-close]]:right-3 [&_[data-slot=dialog-close]]:top-3",
        )}
      >
        <header className="shrink-0 border-b border-white/[0.07] px-4 pb-0 pt-4">
          <DialogHeader className="space-y-0 pr-8 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2 font-heading text-base tracking-tight">
              {portionOpen ? "Food details" : editingSaved ? "Edit saved food" : editingEntry
                ? "Edit food"
                : editingMeal
                  ? `Edit ${state.editingMeal ? MEAL_SLOT_LABEL[state.editingMeal.mealSlot].toLowerCase() : "meal"}`
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

          {!portionOpen && !editingSaved && !editingEntry && !BUILDER_SCREENS.has(visibleScreen) ? (
            <nav
              className="-mx-1 mt-3 grid grid-cols-3 gap-0.5 px-1"
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
                      "relative flex h-11 min-w-0 items-center justify-center gap-1.5 px-2 type-hud-micro transition-colors",
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

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {browsing && !portionOpen ? (
            <div className="shrink-0 border-b border-white/[0.06]">
              <FoodSearchBar inputRef={searchInputRef} query={query}
                mode={visibleScreen === "library" ? "library" : "search"}
                onQueryChange={setQuery} onScan={() => setScannerOpen(true)} />
            </div>
          ) : null}
          <div ref={setBodyEl} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <main
            className="food-log-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
          >
            {browsing ? foodSearch : null}
            {editingSaved ? <SavedFoodEditor state={state} /> : null}

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
                  if (!editingEntry && state.estimateCalDisplay != null) setScreen("search")
                }}
              />
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

          </div>

          {!editingSaved && !portionOpen ? <DialogFooter
            keyboardOpen={keyboardOpen}
            state={state}
            editingEntry={editingEntry}
            editingMeal={editingMeal}
            screen={visibleScreen}
            slotLabel={activeSlot ? MEAL_SLOT_LABEL[activeSlot] : "meal"}
            buildingRecipe={state.showRecipeCreator}
            onBackToRecipe={() => setScreen("recipe")}
          /> : null}
        </div>

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

/**
 * Search stays in normal flow above the independently scrolling results.
 */
function FoodSearchBar({
  inputRef,
  query,
  mode,
  onQueryChange,
  onScan,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  query: string
  mode: "search" | "library"
  onQueryChange: (value: string) => void
  onScan: () => void
}) {
  const placeholder = mode === "library" ? "Search your library" : "Search for a food"

  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground/50"
          aria-hidden
        />
        <Input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Enter") {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
          enterKeyHint="search"
          autoComplete="off"
          placeholder={placeholder}
          className="food-search-input h-11 rounded-xl pl-10 pr-9 text-base"
          aria-label={placeholder}
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              onQueryChange("")
              inputRef.current?.focus()
            }}
            className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
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
  )
}

function DialogFooter({
  keyboardOpen,
  state,
  editingEntry,
  editingMeal,
  screen,
  slotLabel,
  buildingRecipe,
  onBackToRecipe,
}: {
  keyboardOpen: boolean
  state: DialogState
  editingEntry: boolean
  editingMeal: boolean
  screen: ComposerScreen
  slotLabel: string
  /** Items being gathered belong to a recipe, not to today's log. */
  buildingRecipe: boolean
  onBackToRecipe: () => void
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

  const draftCount = state.draftMealItems.length
  // The recipe builder carries its own Save button; everywhere else the footer
  // exists only to hold the meal tray.
  if (screen === "recipe") return null
  if (draftCount === 0 && !editingMeal) return null

  return (
    <div className="shrink-0 border-t border-border/30 bg-background/70 px-4 py-3 pb-[max(0.75rem,calc(0.5rem+env(safe-area-inset-bottom)))] backdrop-blur-md">
      {state.postMealError ? (
        <p className="mb-2 text-center text-[11px] text-destructive" role="alert">
          {state.postMealError}
        </p>
      ) : null}

      {/* The meal as it is being built, in full, right where it is assembled —
          no separate review screen to bounce through to see what is in it. */}
      <MealTray
        keyboardOpen={keyboardOpen}
        state={state}
        slotLabel={slotLabel}
        buildingRecipe={buildingRecipe}
        editingMeal={editingMeal}
        onBackToRecipe={onBackToRecipe}
      />

    </div>
  )
}

/**
 * A compact meal summary expands on demand; typing always leaves results room.
 */
function MealTray({
  keyboardOpen,
  state,
  slotLabel,
  buildingRecipe,
  editingMeal,
  onBackToRecipe,
}: {
  keyboardOpen: boolean
  state: DialogState
  slotLabel: string
  buildingRecipe: boolean
  editingMeal: boolean
  onBackToRecipe: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const showItems = expanded && !keyboardOpen
  const items = state.draftMealItems
  const blocked = editingMeal ? state.vacationBlocksEditingEntry : state.vacationBlocksLog

  return (
    <div className="mb-2 overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.022]">
      <div className="flex items-center gap-2 px-3.5">
        <button type="button" aria-expanded={showItems} aria-controls="food-meal-items"
          onClick={() => { if (keyboardOpen) (document.activeElement as HTMLElement)?.blur(); setExpanded(!showItems) }}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
          aria-label={showItems ? "Collapse meal" : "Review meal"}>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", showItems && "rotate-180")} />
        <p className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="truncate text-[12px] font-semibold uppercase tracking-[0.1em] text-foreground/75">
            {buildingRecipe ? "Recipe" : slotLabel}
          </span>
          <span aria-live="polite" className="shrink-0 text-[11px] font-medium text-muted-foreground/55">
            {items.length} {buildingRecipe ? "ingredient" : "item"}
            {items.length === 1 ? "" : "s"}
          </span>
        </p>
        <span className="shrink-0 text-[13px] font-bold tabular-nums text-red-200/85">
          {state.draftTotals.calories.toLocaleString()}
          <span className="ml-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            cal
          </span>
        </span>
        </button>
        {showItems ? <button
          type="button"
          onClick={() => state.setDraftMealItems([])}
          className="ml-0.5 flex h-9 shrink-0 items-center rounded-lg px-2.5 type-hud-micro text-muted-foreground/55 transition-colors hover:bg-white/[0.05] hover:text-foreground/80"
        >
          Clear
        </button> : null}
      </div>

      {/* Capped so a long meal never swallows the results above it. */}
      <div className="food-tray-reveal" data-expanded={showItems} inert={!showItems}><div className="min-h-0 overflow-hidden">
      <ul id="food-meal-items" className="max-h-[min(25dvh,13.5rem)] divide-y divide-white/[0.05] overflow-y-auto overscroll-contain">
        {items.map((item) => {
          const totals = draftMealItemTotals(item)
          const label = item.description || "Food"
          const portion = formatFoodPortion(
            item.portionAmount != null
              ? Math.round(item.portionAmount * item.quantity * 100) / 100
              : item.quantity,
            item.portionUnit ?? "serving",
          )
          const basisAmount = item.portionAmount && item.portionAmount > 0 ? item.portionAmount : 1
          const actualAmount = Math.round(basisAmount * item.quantity * 10000) / 10000
          const actualUnit = isFoodMeasurementUnit(item.portionUnit) ? item.portionUnit : "serving"
          const step = portionStep(actualUnit)
          const updateAmount = (amount: number) => {
            if (!Number.isFinite(amount) || amount <= 0) return
            state.setDraftMealItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, quantity: amount / basisAmount } : candidate))
          }
          return (
            <li key={item.id} className="px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="size-10 shrink-0 rounded-lg object-contain"
                  />
                ) : (
                  <FoodFallbackIcon label={label} className="size-10 shrink-0 rounded-lg text-lg" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium leading-snug text-foreground/90">
                    {label}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[11px] tabular-nums">
                    {totals.protein != null ? (
                      <MacroPill value={totals.protein} letter="P" color={MACRO_COLOR.protein} />
                    ) : null}
                    {totals.fat != null ? (
                      <MacroPill value={totals.fat} letter="F" color={MACRO_COLOR.fat} />
                    ) : null}
                    {totals.carbs != null ? (
                      <MacroPill value={totals.carbs} letter="C" color={MACRO_COLOR.carbs} />
                    ) : null}
                    {portion ? (
                      <span className="truncate text-[10px] text-muted-foreground/50">
                        · {portion}
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-semibold tabular-nums text-red-100/90">
                    {totals.calories.toLocaleString()}
                  </p>
                  <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/45">
                    cal
                  </p>
                </div>
              </div>

              <div className="mt-1.5 flex items-center gap-1 pl-[3.125rem]">
                <button
                  type="button"
                  disabled={actualAmount <= step}
                  onClick={() => updateAmount(Math.max(step, actualAmount - step))}
                  className="flex size-9 items-center justify-center rounded-lg border border-white/[0.09] text-muted-foreground/75 transition-colors hover:border-white/[0.2] hover:bg-white/[0.05] hover:text-foreground disabled:opacity-25"
                  aria-label={`Decrease ${label} quantity`}
                >
                  <Minus className="size-3.5" />
                </button>
                <Input key={`${item.id}-${actualAmount}`} defaultValue={actualAmount} type="number" min="0.01" step="any" inputMode="decimal" aria-label={`${label} amount in ${actualUnit}`} onFocus={(event) => event.currentTarget.select()} onBlur={(event) => { const value = Number(event.target.value); if (value > 0) updateAmount(value); else event.target.value = String(actualAmount) }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }} className="h-11 w-20 rounded-lg text-center tabular-nums" />
                <span className="text-xs text-muted-foreground">{actualUnit}</span>
                <button
                  type="button"
                  onClick={() => updateAmount(actualAmount + step)}
                  className="flex size-9 items-center justify-center rounded-lg border border-white/[0.09] text-muted-foreground/75 transition-colors hover:border-white/[0.2] hover:bg-white/[0.05] hover:text-foreground"
                  aria-label={`Increase ${label} quantity`}
                >
                  <Plus className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    state.setDraftMealItems((current) =>
                      current.filter((candidate) => candidate.id !== item.id),
                    )
                  }
                  className="ml-auto flex size-9 items-center justify-center rounded-lg text-muted-foreground/45 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Remove ${label}`}
                >
                  <X className="size-4" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      </div></div>

      <div className="border-t border-white/[0.06] p-2">
        {buildingRecipe ? (
          <Button
            type="button"
            variant="glass"
            className="h-12 w-full text-[13px] font-semibold"
            onClick={onBackToRecipe}
          >
            Back to recipe
          </Button>
        ) : (
          <Button
            type="button"
            variant="glass"
            className="h-12 w-full press-scale text-[13px] font-semibold"
            disabled={state.postingMeal || blocked}
            onClick={() => void state.handlePostMealToDay()}
          >
            {state.postingMeal
              ? editingMeal
                ? "Saving…"
                : "Logging…"
              : editingMeal
                ? `Save ${slotLabel.toLowerCase()} · ${state.draftTotals.calories.toLocaleString()} cal`
                : `Log ${items.length} item${items.length === 1 ? "" : "s"} · ${state.draftTotals.calories.toLocaleString()} cal`}
          </Button>
        )}
      </div>
    </div>
  )
}

function SavedFoodEditor({ state }: { state: DialogState }) {
  const food = state.savedMeals.find((meal) => meal.id === state.editingSavedMealId)
  const fields = [
    ["Name", state.editSavedName, state.setEditSavedName, "text"],
    ["Calories", state.editSavedCal, state.setEditSavedCal, "number"],
    ["Protein (g)", state.editSavedProtein, state.setEditSavedProtein, "number"],
    ["Carbs (g)", state.editSavedCarbs, state.setEditSavedCarbs, "number"],
    ["Fat (g)", state.editSavedFat, state.setEditSavedFat, "number"],
  ] as const
  return (
    <form className="mx-auto max-w-lg space-y-5" onSubmit={(event) => { event.preventDefault(); void state.handleUpdateSavedMeal() }}>
      <button type="button" onClick={state.cancelEditSavedMeal} className="flex min-h-11 items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="size-4" /> Back to foods</button>
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
        <p className="text-sm font-medium">Your food, your numbers</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Nutrition per {food ? `${food.servingAmount} ${food.servingUnit}` : "serving"}. Changes apply to future additions; your logged meals stay as they are.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {fields.map(([label, value, setValue, type], index) => <label key={label} className={cn("space-y-2 text-xs text-muted-foreground", index === 0 && "col-span-2")}>
          <span>{label}</span><Input aria-label={label} value={value} type={type} min={type === "number" ? 0 : undefined} step="any" required={index < 2} onChange={(event) => setValue(event.target.value)} className="h-12 rounded-xl" />
        </label>)}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Category</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SAVED_FOOD_CATEGORIES.map((category) => {
            const active = state.editSavedCategory === category.id
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => state.setEditSavedCategory(category.id)}
                aria-pressed={active}
                className={cn(
                  "h-8 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                  active
                    ? "border-foreground/30 bg-white/[0.08] text-foreground"
                    : "border-white/[0.08] text-muted-foreground/70 hover:border-white/[0.16] hover:text-foreground",
                )}
              >
                {category.label}
              </button>
            )
          })}
        </div>
      </div>
      {state.editSavedError ? <p role="alert" className="text-sm text-destructive">{state.editSavedError}</p> : null}
      <Button type="submit" variant="glass" className="h-12 w-full" disabled={state.savingSavedMealEdit || state.pendingSavedDeleteBusy}>{state.savingSavedMealEdit ? "Saving…" : "Save food"}</Button>
      {state.pendingSavedDelete ? <div className="space-y-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4">
        <p className="text-sm">Delete “{state.pendingSavedDelete.name}” from your library? Previously logged meals will remain.</p>
        <div className="flex gap-2"><Button type="button" variant="outline" className="h-11 flex-1" disabled={state.pendingSavedDeleteBusy} onClick={() => state.setPendingSavedDelete(null)}>Keep food</Button><Button type="button" variant="destructive" className="h-11 flex-1" disabled={state.pendingSavedDeleteBusy} onClick={() => void state.executePendingSavedDelete()}>{state.pendingSavedDeleteBusy ? "Deleting…" : "Delete food"}</Button></div>
      </div> : <button type="button" disabled={state.savingSavedMealEdit} onClick={() => { if (food) state.requestDeleteSavedMeal(food.id, food.name) }} className="flex min-h-11 w-full items-center justify-center gap-2 text-sm text-destructive"><Trash2 className="size-4" /> Delete saved food</button>}
    </form>
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
        <div className="space-y-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground/60">
            Add to meal logs this once. Save food keeps it in your library.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-12"
              disabled={state.quickSaveBusy || state.quickFoodSaved}
              onClick={() => void state.handleSaveCurrentAsFrequent()}
            >
              {state.quickFoodSaved ? (
                <Check className="size-4" />
              ) : (
                <Save className="size-4" />
              )}
              {state.quickSaveBusy ? "Saving…" : state.quickFoodSaved ? "Saved" : "Save food"}
            </Button>
            <Button type="submit" variant="glass" className="h-12 flex-1" disabled={disabled}>
              <Plus className="size-4" />
              Add to meal
            </Button>
          </div>
          {state.quickSaveError ? (
            <p className="text-xs text-destructive" role="alert">
              {state.quickSaveError}
            </p>
          ) : null}
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

