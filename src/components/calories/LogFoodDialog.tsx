"use client"
/* eslint-disable @next/next/no-img-element -- food images can come from dynamic food sources */

import { useEffect, useRef, useState } from "react"
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
import { formatFoodPortion } from "@/lib/calories/measurements"
import {
  MEAL_SLOT_ACCENT,
  MEAL_SLOT_LABEL,
  MEAL_SLOT_RANGE_LABEL,
  resolveMealSlot,
} from "@/lib/calories/meal-slots"

export type LogFoodDialogProps = UseLogFoodDialogOptions
type DialogState = ReturnType<typeof useLogFoodDialog>
type ComposerScreen = "search" | "library" | "manual" | "recipe"

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
const BUILDER_SCREENS = new Set<ComposerScreen>(["recipe"])

/** Breathing room between the search bar and the top of the keyboard. */
const KEYBOARD_GAP_PX = 8

export function LogFoodDialog(props: LogFoodDialogProps) {
  const { open } = props
  const { activeDate } = useActiveDate()
  const state = useLogFoodDialog(props)
  const [screen, setScreen] = useState<ComposerScreen>("search")
  const [query, setQuery] = useState("")
  // Callback refs, not object refs: the dialog's content mounts a commit after
  // `open` flips, so an effect keyed on `open` alone would measure nothing.
  const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null)
  const [dockEl, setDockEl] = useState<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
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
      setScreen("search")
      setQuery("")
      setBarcodeScan(null)
      setPhotoOpen(false)
      state.resetRecipeCreator()
    }
    props.onOpenChange(next)
  }

  function showScreen(next: ComposerScreen) {
    setScreen(next)
    state.setLogFoodMode(next === "manual" ? "estimate" : "saved")
    if (next !== "manual") setPhotoOpen(false)
  }

  function handleTab(id: (typeof COMPOSER_TABS)[number]["id"]) {
    showScreen(id)
  }

  const browsing = BROWSE_SCREENS.has(visibleScreen)

  /**
   * The bar rests at the bottom of the results area and lifts only far enough
   * to clear the on-screen keyboard — it stays put on desktop, where there is
   * no keyboard, so opening search never rearranges the screen.
   */
  useEffect(() => {
    const body = bodyEl
    const dock = dockEl
    if (!body || !dock) return

    const sync = () => {
      const height = dock.offsetHeight
      const travel = Math.max(0, body.clientHeight - height)
      body.style.setProperty("--dock-height", `${height}px`)
      body.style.setProperty("--dock-travel", `${travel}px`)

      // visualViewport shrinks by the keyboard; anything below its bottom edge
      // is covered.
      const viewport = window.visualViewport
      const viewportBottom = viewport
        ? viewport.offsetTop + viewport.height
        : window.innerHeight
      const restingBottom = body.getBoundingClientRect().top + travel + height
      const lift = Math.max(0, restingBottom - viewportBottom + KEYBOARD_GAP_PX)
      body.style.setProperty("--keyboard-lift", `${lift}px`)
    }

    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(body)
    observer.observe(dock)
    const viewport = window.visualViewport
    viewport?.addEventListener("resize", sync)
    viewport?.addEventListener("scroll", sync)
    return () => {
      observer.disconnect()
      viewport?.removeEventListener("resize", sync)
      viewport?.removeEventListener("scroll", sync)
    }
  }, [bodyEl, dockEl])

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
    />
  ) : null

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
        <header className="shrink-0 border-b border-white/[0.07] px-4 pb-0 pt-4">
          <DialogHeader className="space-y-0 pr-8 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2 font-heading text-base tracking-tight">
              {editingEntry
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

          {!editingEntry && !BUILDER_SCREENS.has(visibleScreen) ? (
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
          <div ref={setBodyEl} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <main
            className="food-log-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
            style={
              browsing
                ? { paddingBottom: "calc(var(--dock-height, 4rem) + 0.5rem)" }
                : undefined
            }
          >
            {browsing ? foodSearch : null}

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

          {browsing ? (
            <div ref={setDockEl} className="food-search-dock">
              <FoodSearchBar
                inputRef={searchInputRef}
                query={query}
                mode={visibleScreen === "library" ? "library" : "search"}
                onQueryChange={setQuery}
                onScan={() => setScannerOpen(true)}
              />
            </div>
          ) : null}
          </div>

          <DialogFooter
            state={state}
            editingEntry={editingEntry}
            editingMeal={editingMeal}
            screen={visibleScreen}
            slotLabel={activeSlot ? MEAL_SLOT_LABEL[activeSlot] : "meal"}
            buildingRecipe={state.showRecipeCreator}
            onBackToRecipe={() => setScreen("recipe")}
          />
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
 * The one search field in the composer. It lives in a dock that slides between
 * the bottom of the body and the top, so this renders the same element in both
 * places rather than swapping in a second copy.
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
    <div className="flex items-center gap-2 bg-gradient-to-t from-background/92 to-transparent px-4 pb-3 pt-5">
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
            if (event.key === "Escape") event.currentTarget.blur()
          }}
          placeholder={placeholder}
          className="food-search-input h-11 rounded-full pl-10 pr-9 text-sm"
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
  state,
  editingEntry,
  editingMeal,
  screen,
  slotLabel,
  buildingRecipe,
  onBackToRecipe,
}: {
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
  if (draftCount === 0) return null

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
 * The draft meal, expanded in place at the bottom of the composer: every item
 * with its quantity and a way off the list, the running total, and the button
 * that commits it.
 */
function MealTray({
  state,
  slotLabel,
  buildingRecipe,
  editingMeal,
  onBackToRecipe,
}: {
  state: DialogState
  slotLabel: string
  buildingRecipe: boolean
  editingMeal: boolean
  onBackToRecipe: () => void
}) {
  const items = state.draftMealItems
  const blocked = editingMeal ? state.vacationBlocksEditingEntry : state.vacationBlocksLog

  return (
    <div className="mb-2 overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.022]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3.5 py-2.5">
        <p className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="truncate text-[12px] font-semibold uppercase tracking-[0.1em] text-foreground/75">
            {buildingRecipe ? "Recipe" : slotLabel}
          </span>
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground/55">
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
        <button
          type="button"
          onClick={() => state.setDraftMealItems([])}
          className="ml-0.5 flex h-9 shrink-0 items-center rounded-lg px-2.5 type-hud-micro text-muted-foreground/55 transition-colors hover:bg-white/[0.05] hover:text-foreground/80"
        >
          Clear
        </button>
      </div>

      {/* Capped so a long meal never swallows the results above it. */}
      <ul className="max-h-[min(32vh,13.5rem)] divide-y divide-white/[0.05] overflow-y-auto overscroll-contain">
        {items.map((item) => {
          const totals = draftMealItemTotals(item)
          const label = item.description || "Food"
          const portion = formatFoodPortion(
            item.portionAmount != null
              ? Math.round(item.portionAmount * item.quantity * 100) / 100
              : item.quantity,
            item.portionUnit ?? "serving",
          )
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
                  disabled={item.quantity <= 0.5}
                  onClick={() => state.adjustDraftItemQuantity(item.id, -0.5)}
                  className="flex size-9 items-center justify-center rounded-lg border border-white/[0.09] text-muted-foreground/75 transition-colors hover:border-white/[0.2] hover:bg-white/[0.05] hover:text-foreground disabled:opacity-25"
                  aria-label={`Decrease ${label} quantity`}
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="w-10 text-center text-[12px] font-semibold tabular-nums text-foreground/85">
                  {item.quantity}×
                </span>
                <button
                  type="button"
                  onClick={() => state.adjustDraftItemQuantity(item.id, 0.5)}
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

