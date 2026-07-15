"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react"
import { format } from "date-fns"
import { useActiveDate } from "@/context/DateContext"
import { useUser } from "@/context/UserContext"
import { parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import { isVacationBlockingCalendarDay } from "@/lib/vacation-mode"
import type { PhotoEstimatePrefill } from "@/components/calories/PhotoCalorieEstimator"
import {
  mealTypes,
  savedMealTagList,
  draftMealItemTotals,
  type CalorieEntry,
  type DraftMealItem,
  type PendingSavedMealDelete,
  type Recipe,
  type SavedMeal,
} from "@/lib/calories/log-food"
import {
  type SavedFoodCategory,
} from "@/lib/calories/saved-food-category"
import type {
  CatalogFoodResult,
  PortionSelection,
} from "@/components/calories/UnifiedFoodSearch"

function mealTypeForCurrentTime() {
  const hour = new Date().getHours()
  if (hour < 11) return "breakfast"
  if (hour < 16) return "lunch"
  if (hour < 21) return "dinner"
  return "snack"
}

export interface UseLogFoodDialogOptions {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingEntry?: CalorieEntry | null
  onEditingEntryChange?: (entry: CalorieEntry | null) => void
  draftMealItems?: DraftMealItem[]
  onDraftMealItemsChange?: Dispatch<SetStateAction<DraftMealItem[]>>
  onPosted?: (created: CalorieEntry[]) => void
  onUpdated?: (entry: CalorieEntry) => void
  initialMealType?: string | null
}

export function useLogFoodDialog({
  open,
  onOpenChange,
  editingEntry: controlledEditingEntry,
  onEditingEntryChange,
  draftMealItems: controlledDraft,
  onDraftMealItemsChange,
  onPosted,
  onUpdated,
  initialMealType,
}: UseLogFoodDialogOptions) {
  const { activeDate } = useActiveDate()
  const { user } = useUser()
  const today = activeDate

  const [internalDraft, setInternalDraft] = useState<DraftMealItem[]>([])
  const draftMealItems = controlledDraft ?? internalDraft
  const setDraftMealItems = onDraftMealItemsChange ?? setInternalDraft

  const editingEntry = controlledEditingEntry ?? null

  const [mealType, setMealType] = useState<string | null>(null)
  const [description, setDescription] = useState("")
  const [calories, setCalories] = useState("")
  const [protein, setProtein] = useState("")
  const [carbs, setCarbs] = useState("")
  const [fat, setFat] = useState("")
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null)
  const [lastAddedDraftId, setLastAddedDraftId] = useState<string | null>(null)

  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [savedMealSearch, setSavedMealSearch] = useState("")
  const [savedMealCategory, setSavedMealCategory] =
    useState<"all" | SavedFoodCategory>("all")
  const [showCreateMeal, setShowCreateMeal] = useState(false)
  const [newMealName, setNewMealName] = useState("")
  const [newMealCal, setNewMealCal] = useState("")
  const [newMealProtein, setNewMealProtein] = useState("")
  const [newMealCarbs, setNewMealCarbs] = useState("")
  const [newMealFat, setNewMealFat] = useState("")
  const [newMealTags, setNewMealTags] = useState<string[]>([])
  const [newMealCategory, setNewMealCategory] = useState<SavedFoodCategory>("meal")
  const [editingSavedMealId, setEditingSavedMealId] = useState<string | null>(null)
  const [editSavedName, setEditSavedName] = useState("")
  const [editSavedCal, setEditSavedCal] = useState("")
  const [editSavedProtein, setEditSavedProtein] = useState("")
  const [editSavedCarbs, setEditSavedCarbs] = useState("")
  const [editSavedFat, setEditSavedFat] = useState("")
  const [editSavedTags, setEditSavedTags] = useState<string[]>([])
  const [editSavedCategory, setEditSavedCategory] = useState<SavedFoodCategory>("meal")
  const [editSavedError, setEditSavedError] = useState<string | null>(null)
  const [savingSavedMealEdit, setSavingSavedMealEdit] = useState(false)
  const [showSavePrompt, setShowSavePrompt] = useState(false)
  const [saveMealError, setSaveMealError] = useState<string | null>(null)
  const [logFoodMode, setLogFoodMode] = useState<"saved" | "search" | "estimate">("saved")
  const [logFoodPhotoOpen, setLogFoodPhotoOpen] = useState(false)
  const [showEstimateMacros, setShowEstimateMacros] = useState(false)
  const [flashSavedMealId, setFlashSavedMealId] = useState<string | null>(null)
  const [postingMeal, setPostingMeal] = useState(false)
  const [postMealError, setPostMealError] = useState<string | null>(null)
  const [showRecipeCreator, setShowRecipeCreator] = useState(false)
  const [recipeName, setRecipeName] = useState("")
  const [recipeImageUrl, setRecipeImageUrl] = useState<string | null>(null)
  const [recipeSaving, setRecipeSaving] = useState(false)
  const [recipeImageUploading, setRecipeImageUploading] = useState(false)
  const [recipeError, setRecipeError] = useState<string | null>(null)
  const [pendingSavedDelete, setPendingSavedDelete] =
    useState<PendingSavedMealDelete | null>(null)
  const [pendingSavedDeleteBusy, setPendingSavedDeleteBusy] = useState(false)

  const vacationBlocksLog = useMemo(
    () => isVacationBlockingCalendarDay(user?.vacationResumeDate, today),
    [user?.vacationResumeDate, today]
  )

  const vacationBlocksEditingEntry = useMemo(
    () =>
      editingEntry
        ? isVacationBlockingCalendarDay(
            user?.vacationResumeDate,
            editingEntry.date.split("T")[0]
          )
        : false,
    [user?.vacationResumeDate, editingEntry]
  )

  const vacationResumeLabel =
    user?.vacationResumeDate != null && user.vacationResumeDate !== ""
      ? format(parseLocalDate(user.vacationResumeDate), "MMM d, yyyy")
      : null

  const fetchSavedMeals = useCallback(async () => {
    try {
      const r = await apiFetch("/api/saved-meals")
      const data = await r.json()
      setSavedMeals(Array.isArray(data) ? data : [])
    } catch {
      setSavedMeals([])
    }
  }, [])

  const fetchRecipes = useCallback(async () => {
    try {
      const response = await apiFetch("/api/recipes")
      const data = await response.json()
      setRecipes(Array.isArray(data) ? data : [])
    } catch {
      setRecipes([])
    }
  }, [])

  useEffect(() => {
    if (open) void Promise.all([fetchSavedMeals(), fetchRecipes()])
  }, [open, fetchSavedMeals, fetchRecipes])

  useEffect(() => {
    if (!open) {
      setLogFoodMode("saved")
      setLogFoodPhotoOpen(false)
      setShowEstimateMacros(false)
      setEditingSavedMealId(null)
      setEditSavedError(null)
      setSavedMealSearch("")
      setSavedMealCategory("all")
      setShowRecipeCreator(false)
      setRecipeError(null)
      setPostMealError(null)
      return
    }
    if (!editingEntry) {
      setMealType(initialMealType ?? mealTypeForCurrentTime())
      setLogFoodMode("saved")
      setLogFoodPhotoOpen(false)
      setShowEstimateMacros(false)
    }
  }, [open, editingEntry, initialMealType])

  useEffect(() => {
    if (!open) return
    const html = document.documentElement
    const body = document.body
    const prevHtml = html.style.overflow
    const prevBody = body.style.overflow
    html.style.overflow = "hidden"
    body.style.overflow = "hidden"
    return () => {
      html.style.overflow = prevHtml
      body.style.overflow = prevBody
    }
  }, [open])

  useEffect(() => {
    if (!editingEntry || !open) return
    setMealType(editingEntry.mealType)
    setDescription(editingEntry.description ?? "")
    setCalories(String(editingEntry.calories))
    setProtein(editingEntry.protein != null ? String(editingEntry.protein) : "")
    setCarbs(editingEntry.carbs != null ? String(editingEntry.carbs) : "")
    setFat(editingEntry.fat != null ? String(editingEntry.fat) : "")
    setCurrentImageUrl(editingEntry.imageUrl)
    setShowSavePrompt(false)
    setLogFoodMode("estimate")
    setShowEstimateMacros(
      editingEntry.protein != null || editingEntry.carbs != null || editingEntry.fat != null
    )
  }, [editingEntry, open])

  const displayedSavedMeals = useMemo(() => {
    const sorted = [...savedMeals].sort((a, b) => b.useCount - a.useCount || a.name.localeCompare(b.name))
    const query = savedMealSearch.trim().toLowerCase()
    const mt = mealType?.toLowerCase()
    return sorted.filter((meal) => {
      if (mt && !savedMealTagList(meal).includes(mt)) return false
      if (savedMealCategory !== "all" && meal.foodCategory !== savedMealCategory) return false
      if (query && !meal.name.toLowerCase().includes(query)) return false
      return true
    })
  }, [savedMeals, mealType, savedMealCategory, savedMealSearch])

  const savedMealCategoryCounts = useMemo(() => {
    const counts = new Map<SavedFoodCategory, number>()
    const mt = mealType?.toLowerCase()
    for (const meal of savedMeals) {
      if (mt && !savedMealTagList(meal).includes(mt)) continue
      counts.set(meal.foodCategory, (counts.get(meal.foodCategory) ?? 0) + 1)
    }
    return counts
  }, [savedMeals, mealType])

  const estimateCalDisplay =
    calories.trim() === ""
      ? null
      : (() => {
          const c = parseFloat(calories)
          if (Number.isNaN(c) || c <= 0) return null
          return Math.round(c)
        })()

  const draftTotals = useMemo(() => {
    return draftMealItems.reduce(
      (acc, item) => {
        const t = draftMealItemTotals(item)
        acc.calories += t.calories
        if (t.protein != null) acc.protein += t.protein
        if (t.carbs != null) acc.carbs += t.carbs
        if (t.fat != null) acc.fat += t.fat
        return acc
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )
  }, [draftMealItems])

  const savedMealCountsInDraft = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of draftMealItems) {
      if (!item.savedMealId) continue
      counts.set(item.savedMealId, (counts.get(item.savedMealId) ?? 0) + item.quantity)
    }
    return counts
  }, [draftMealItems])

  function createDraftItem(
    fields: Omit<DraftMealItem, "id" | "quantity"> & { quantity?: number }
  ): DraftMealItem {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      quantity: fields.quantity ?? 1,
      mealType: fields.mealType,
      description: fields.description,
      unitCalories: fields.unitCalories,
      unitProtein: fields.unitProtein,
      unitCarbs: fields.unitCarbs,
      unitFat: fields.unitFat,
      imageUrl: fields.imageUrl,
      savedMealId: fields.savedMealId,
      recipeId: fields.recipeId,
      portionAmount: fields.portionAmount,
      portionUnit: fields.portionUnit,
    }
  }

  function pushDraftItem(item: DraftMealItem) {
    setDraftMealItems((prev) => {
      const existing = item.savedMealId
        ? prev.find((i) => i.savedMealId === item.savedMealId)
        : prev.find(
            (i) =>
              !i.savedMealId &&
              i.mealType === item.mealType &&
              i.description === item.description &&
              i.unitCalories === item.unitCalories
          )

      if (existing) {
        const nextQty = Math.round((existing.quantity + 1) * 4) / 4
        setLastAddedDraftId(existing.id)
        window.setTimeout(() => {
          setLastAddedDraftId((cur) => (cur === existing.id ? null : cur))
        }, 1200)
        return prev.map((i) => (i.id === existing.id ? { ...i, quantity: nextQty } : i))
      }

      setLastAddedDraftId(item.id)
      window.setTimeout(() => {
        setLastAddedDraftId((cur) => (cur === item.id ? null : cur))
      }, 1200)
      return [...prev, item]
    })
  }

  function handleFoodSelect(
    food: CatalogFoodResult,
    portion: PortionSelection = { amount: 1, unit: "serving", multiplier: 1 },
  ) {
    if (vacationBlocksLog) return
    const cal = food.calories != null ? food.calories * portion.multiplier : null
    if (cal == null || cal <= 0) return

    const label = food.brand_name ? `${food.food_name} (${food.brand_name})` : food.food_name
    const effectiveMealType = mealType || mealTypes[0]
    pushDraftItem(
      createDraftItem({
        mealType: effectiveMealType,
        description: label,
        unitCalories: Math.round(cal),
        unitProtein: food.protein != null ? Math.round(food.protein * portion.multiplier * 10) / 10 : null,
        unitCarbs: food.carbs != null ? Math.round(food.carbs * portion.multiplier * 10) / 10 : null,
        unitFat: food.fat != null ? Math.round(food.fat * portion.multiplier * 10) / 10 : null,
        imageUrl: food.image_url ?? null,
        portionAmount: portion.amount,
        portionUnit: portion.unit,
      })
    )
  }

  const handlePhotoPrefill = useCallback(
    (prefill: PhotoEstimatePrefill) => {
      if (vacationBlocksLog && !editingEntry) return
      setDescription(prefill.description)
      setCalories(String(Math.round(prefill.calories)))
      setProtein(prefill.protein != null ? String(prefill.protein) : "")
      setCarbs(prefill.carbs != null ? String(prefill.carbs) : "")
      setFat(prefill.fat != null ? String(prefill.fat) : "")
      setCurrentImageUrl(prefill.imageUrl)
      setShowSavePrompt(true)
      setShowEstimateMacros(
        prefill.protein != null || prefill.carbs != null || prefill.fat != null
      )
      setLogFoodMode("estimate")
      setLogFoodPhotoOpen(false)
    },
    [vacationBlocksLog, editingEntry]
  )

  function addCalories(n: number) {
    const cur = parseFloat(calories)
    const base = Number.isNaN(cur) ? 0 : cur
    setCalories(String(Math.round(base + n)))
  }

  function resetCurrentItemFields() {
    setDescription("")
    setCalories("")
    setProtein("")
    setCarbs("")
    setFat("")
    setCurrentImageUrl(null)
    setShowSavePrompt(false)
  }

  function addCurrentItemToMeal() {
    if (vacationBlocksLog) return
    const cal = parseFloat(calories)
    if (!Number.isFinite(cal) || cal <= 0) return

    const p = protein.trim() === "" ? null : parseFloat(protein)
    const c = carbs.trim() === "" ? null : parseFloat(carbs)
    const f = fat.trim() === "" ? null : parseFloat(fat)

    const effectiveMealType = mealType || mealTypes[0]
    pushDraftItem(
      createDraftItem({
        mealType: effectiveMealType,
        description: description.trim() || null,
        unitCalories: Math.round(cal),
        unitProtein: Number.isFinite(p) ? p : null,
        unitCarbs: Number.isFinite(c) ? c : null,
        unitFat: Number.isFinite(f) ? f : null,
        imageUrl: currentImageUrl,
      })
    )
    resetCurrentItemFields()
    setShowEstimateMacros(false)
    setLogFoodMode("saved")
  }

  function updateDraftItemQuantity(id: string, nextQuantity: number) {
    if (!Number.isFinite(nextQuantity) || nextQuantity < 0.5) return
    const quantity = Math.round(nextQuantity * 2) / 2
    setDraftMealItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity } : item))
    )
  }

  function adjustDraftItemQuantity(id: string, delta: number) {
    setDraftMealItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const next = Math.max(0.5, Math.round((item.quantity + delta) * 2) / 2)
        return { ...item, quantity: next }
      })
    )
  }

  function cancelEdit() {
    onEditingEntryChange?.(null)
    resetCurrentItemFields()
    setMealType(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!calories) return

    if (editingEntry) {
      if (vacationBlocksEditingEntry) return
      const effectiveMealType = mealType || editingEntry.mealType
      const res = await apiFetch("/api/calories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingEntry.id,
          date: editingEntry.date.split("T")[0],
          mealType: effectiveMealType,
          description: description || null,
          calories,
          protein: protein || null,
          carbs: carbs || null,
          fat: fat || null,
          imageUrl: currentImageUrl,
          portionAmount: editingEntry.portionAmount,
          portionUnit: editingEntry.portionUnit,
        }),
      })

      if (res.ok) {
        const updated = (await res.json()) as CalorieEntry
        onUpdated?.(updated)
        cancelEdit()
        onOpenChange(false)
      }
      return
    }
    addCurrentItemToMeal()
  }

  function handleUseSavedMeal(
    meal: SavedMeal,
    portion: PortionSelection = {
      amount: meal.servingAmount || 1,
      unit: meal.servingUnit || "serving",
      multiplier: 1,
    },
  ) {
    if (vacationBlocksLog) return
    const mealTags = savedMealTagList(meal)
    const effectiveMealType = mealType || (mealTags.length > 0 ? mealTags[0] : mealTypes[0])
    pushDraftItem(
      createDraftItem({
        mealType: effectiveMealType,
        description: meal.name,
        unitCalories: Math.round(meal.calories * portion.multiplier),
        unitProtein: meal.protein != null ? Math.round(meal.protein * portion.multiplier * 10) / 10 : null,
        unitCarbs: meal.carbs != null ? Math.round(meal.carbs * portion.multiplier * 10) / 10 : null,
        unitFat: meal.fat != null ? Math.round(meal.fat * portion.multiplier * 10) / 10 : null,
        imageUrl: meal.imageUrl,
        savedMealId: meal.id,
        portionAmount: portion.amount,
        portionUnit: portion.unit,
      })
    )
    setFlashSavedMealId(meal.id)
    window.setTimeout(() => setFlashSavedMealId(null), 900)
    void apiFetch(`/api/saved-meals?id=${meal.id}`, { method: "PATCH" })
      .then(() => fetchSavedMeals())
      .catch(() => {})
  }

  function handleUseRecipe(recipe: Recipe) {
    if (vacationBlocksLog) return
    const recipeTags = savedMealTagList(recipe)
    const effectiveMealType =
      mealType || (recipeTags.length > 0 ? recipeTags[0] : mealTypes[0])
    const nextItems = recipe.ingredients.map((ingredient) =>
      createDraftItem({
        mealType: effectiveMealType,
        description: ingredient.name,
        unitCalories: ingredient.calories,
        unitProtein: ingredient.protein,
        unitCarbs: ingredient.carbs,
        unitFat: ingredient.fat,
        imageUrl: ingredient.imageUrl,
        recipeId: recipe.id,
        portionAmount: ingredient.portionAmount,
        portionUnit: ingredient.portionUnit,
      }),
    )
    setDraftMealItems((current) => [...current, ...nextItems])
    if (nextItems[0]) setLastAddedDraftId(nextItems[0].id)
    void apiFetch(`/api/recipes?id=${recipe.id}`, { method: "PATCH" })
      .then(() => fetchRecipes())
      .catch(() => {})
  }

  function openEditSavedMeal(meal: SavedMeal) {
    setSaveMealError(null)
    setShowCreateMeal(false)
    setEditingSavedMealId(meal.id)
    setEditSavedError(null)
    setEditSavedName(meal.name)
    setEditSavedCal(String(meal.calories))
    setEditSavedProtein(meal.protein != null ? String(meal.protein) : "")
    setEditSavedCarbs(meal.carbs != null ? String(meal.carbs) : "")
    setEditSavedFat(meal.fat != null ? String(meal.fat) : "")
    setEditSavedTags(savedMealTagList(meal))
    setEditSavedCategory(meal.foodCategory)
  }

  function cancelEditSavedMeal() {
    setEditingSavedMealId(null)
    setEditSavedError(null)
  }

  async function handleUpdateSavedMeal() {
    if (!editingSavedMealId || savingSavedMealEdit) return
    setEditSavedError(null)
    if (!editSavedName.trim() || !editSavedCal.trim()) {
      setEditSavedError("Name and calories are required.")
      return
    }
    if (editSavedTags.length === 0) {
      setEditSavedError("Pick at least one meal tag.")
      return
    }
    setSavingSavedMealEdit(true)
    try {
      const res = await apiFetch(`/api/saved-meals?id=${editingSavedMealId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editSavedName.trim(),
          mealTags: editSavedTags,
          foodCategory: editSavedCategory,
          calories: editSavedCal,
          protein: editSavedProtein || null,
          carbs: editSavedCarbs || null,
          fat: editSavedFat || null,
        }),
      })
      if (!res.ok) {
        let message = "Could not update meal."
        try {
          const err = await res.json()
          if (err && typeof err.error === "string") message = err.error
        } catch {
          /* ignore */
        }
        setEditSavedError(message)
        return
      }
      await fetchSavedMeals()
      cancelEditSavedMeal()
    } finally {
      setSavingSavedMealEdit(false)
    }
  }

  async function handlePostMealToDay() {
    if (vacationBlocksLog || draftMealItems.length === 0 || postingMeal) return
    setPostingMeal(true)
    setPostMealError(null)
    try {
      const entries = draftMealItems.map((item) => {
        const totals = draftMealItemTotals(item)
        return {
          date: today,
          mealType: item.mealType,
          description: item.description,
          calories: totals.calories,
          protein: totals.protein,
          carbs: totals.carbs,
          fat: totals.fat,
          imageUrl: item.imageUrl ?? null,
          portionAmount:
            item.portionAmount != null
              ? Math.round(item.portionAmount * item.quantity * 100) / 100
              : item.quantity,
          portionUnit: item.portionUnit ?? "serving",
        }
      })
      const response = await apiFetch("/api/calories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        setPostMealError(
          data && typeof data.error === "string"
            ? data.error
            : "Your meal could not be posted. Nothing was changed.",
        )
        return
      }
      const created = (await response.json()) as CalorieEntry[]
      onPosted?.(created)
      setDraftMealItems([])
      onOpenChange(false)
    } catch {
      setPostMealError("Your meal could not be posted. Check your connection and try again.")
    } finally {
      setPostingMeal(false)
    }
  }

  async function handleRecipeImage(file: File) {
    if (recipeImageUploading) return
    setRecipeError(null)
    setRecipeImageUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const response = await apiFetch("/api/recipes/upload", {
        method: "POST",
        body: formData,
      })
      const data = await response.json()
      if (!response.ok || typeof data.url !== "string") {
        setRecipeError(
          typeof data.error === "string" ? data.error : "Picture upload failed.",
        )
        return
      }
      setRecipeImageUrl(data.url)
    } catch {
      setRecipeError("Picture upload failed.")
    } finally {
      setRecipeImageUploading(false)
    }
  }

  function resetRecipeCreator() {
    setShowRecipeCreator(false)
    setRecipeName("")
    setRecipeImageUrl(null)
    setRecipeError(null)
  }

  async function handleSaveRecipe() {
    if (recipeSaving || draftMealItems.length === 0) return
    if (!recipeName.trim()) {
      setRecipeError("Give this recipe a name.")
      return
    }
    setRecipeSaving(true)
    setRecipeError(null)
    try {
      const ingredients = draftMealItems.map((item) => {
        const totals = draftMealItemTotals(item)
        return {
          name: item.description || "Recipe ingredient",
          ...totals,
          portionAmount:
            item.portionAmount != null
              ? Math.round(item.portionAmount * item.quantity * 100) / 100
              : item.quantity,
          portionUnit: item.portionUnit ?? "serving",
          imageUrl: item.imageUrl ?? null,
        }
      })
      const response = await apiFetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: recipeName.trim(),
          mealTags: [mealType || draftMealItems[0]?.mealType || mealTypes[0]],
          imageUrl: recipeImageUrl,
          ingredients,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setRecipeError(
          data && typeof data.error === "string"
            ? data.error
            : "Could not save recipe.",
        )
        return
      }
      setRecipes((current) => [
        data as Recipe,
        ...current.filter((recipe) => recipe.id !== data.id),
      ])
      resetRecipeCreator()
    } finally {
      setRecipeSaving(false)
    }
  }

  async function handleDeleteRecipe(recipe: Recipe) {
    const response = await apiFetch(`/api/recipes?id=${recipe.id}`, {
      method: "DELETE",
    })
    if (response.ok) {
      setRecipes((current) => current.filter((item) => item.id !== recipe.id))
    }
  }

  async function handleCreateMeal() {
    setSaveMealError(null)
    if (!newMealName.trim() || !newMealCal.trim()) return
    if (newMealTags.length === 0) {
      setSaveMealError("Pick at least one meal tag (breakfast, lunch, …).")
      return
    }

    const res = await apiFetch("/api/saved-meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newMealName.trim(),
        mealTags: newMealTags,
        foodCategory: newMealCategory,
        calories: newMealCal,
        protein: newMealProtein || null,
        carbs: newMealCarbs || null,
        fat: newMealFat || null,
      }),
    })

    if (!res.ok) {
      let message = "Could not save meal."
      try {
        const err = await res.json()
        if (err && typeof err.error === "string") message = err.error
      } catch {
        /* ignore */
      }
      setSaveMealError(message)
      return
    }

    await fetchSavedMeals()
    setShowCreateMeal(false)
    setNewMealName("")
    setNewMealCal("")
    setNewMealProtein("")
    setNewMealCarbs("")
    setNewMealFat("")
    setNewMealTags(mealType ? [mealType] : [])
    setNewMealCategory(mealType === "snack" ? "snack" : "meal")
  }

  async function handleSaveCurrentAsFrequent() {
    if (!description.trim() || !calories.trim()) return

    const tags = mealType ? [mealType] : [mealTypes[0]]
    await apiFetch("/api/saved-meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: description.trim(),
        mealTags: tags,
        calories,
        protein: protein || null,
        carbs: carbs || null,
        fat: fat || null,
        imageUrl: currentImageUrl,
      }),
    })

    fetchSavedMeals()
    setShowSavePrompt(false)
  }

  async function handleSaveSearchFood(food: CatalogFoodResult): Promise<boolean> {
    if (food.calories == null || food.calories <= 0) return false
    const roundedCalories = Math.round(food.calories)
    const name = food.brand_name ? `${food.food_name} (${food.brand_name})` : food.food_name
    const existing = savedMeals.find(
      (meal) =>
        meal.name.toLowerCase() === name.toLowerCase() && meal.calories === roundedCalories,
    )
    if (existing) {
      setFlashSavedMealId(existing.id)
      return true
    }

    const res = await apiFetch("/api/saved-meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mealTags: [mealType || mealTypes[0]],
        calories: roundedCalories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        imageUrl: food.image_url ?? null,
        servingAmount: 1,
        servingUnit: "serving",
        servingWeightG: food.serving_size_g,
      }),
    })
    if (!res.ok) return false
    const saved = (await res.json()) as SavedMeal
    setSavedMeals((current) => [saved, ...current.filter((meal) => meal.id !== saved.id)])
    setFlashSavedMealId(saved.id)
    return true
  }

  function requestDeleteSavedMeal(id: string, name: string) {
    setPendingSavedDelete({ id, name })
  }

  async function executePendingSavedDelete() {
    if (!pendingSavedDelete || pendingSavedDeleteBusy) return
    setPendingSavedDeleteBusy(true)
    try {
      const id = pendingSavedDelete.id
      const res = await apiFetch(`/api/saved-meals?id=${id}`, { method: "DELETE" })
      if (res.ok) {
        setSavedMeals((prev) => prev.filter((m) => m.id !== id))
        setEditingSavedMealId((cur) => (cur === id ? null : cur))
        setDraftMealItems((prev) => prev.filter((i) => i.savedMealId !== id))
      }
      setPendingSavedDelete(null)
    } finally {
      setPendingSavedDeleteBusy(false)
    }
  }

  return {
    editingEntry,
    mealType,
    setMealType,
    description,
    setDescription,
    calories,
    setCalories,
    protein,
    setProtein,
    carbs,
    setCarbs,
    fat,
    setFat,
    currentImageUrl,
    lastAddedDraftId,
    updateDraftItemQuantity,
    adjustDraftItemQuantity,
    savedMeals,
    recipes,
    savedMealSearch,
    setSavedMealSearch,
    savedMealCategory,
    setSavedMealCategory,
    savedMealCategoryCounts,
    showCreateMeal,
    setShowCreateMeal,
    newMealName,
    setNewMealName,
    newMealCal,
    setNewMealCal,
    newMealProtein,
    setNewMealProtein,
    newMealCarbs,
    setNewMealCarbs,
    newMealFat,
    setNewMealFat,
    newMealTags,
    setNewMealTags,
    newMealCategory,
    setNewMealCategory,
    editingSavedMealId,
    setEditingSavedMealId,
    editSavedName,
    setEditSavedName,
    editSavedCal,
    setEditSavedCal,
    editSavedProtein,
    setEditSavedProtein,
    editSavedCarbs,
    setEditSavedCarbs,
    editSavedFat,
    setEditSavedFat,
    editSavedTags,
    setEditSavedTags,
    editSavedCategory,
    setEditSavedCategory,
    editSavedError,
    savingSavedMealEdit,
    showSavePrompt,
    saveMealError,
    setSaveMealError: setSaveMealError,
    logFoodMode,
    setLogFoodMode,
    logFoodPhotoOpen,
    setLogFoodPhotoOpen,
    showEstimateMacros,
    setShowEstimateMacros,
    flashSavedMealId,
    postingMeal,
    postMealError,
    showRecipeCreator,
    setShowRecipeCreator,
    recipeName,
    setRecipeName,
    recipeImageUrl,
    recipeSaving,
    recipeImageUploading,
    recipeError,
    draftMealItems,
    setDraftMealItems,
    vacationBlocksLog,
    vacationBlocksEditingEntry,
    vacationResumeLabel,
    displayedSavedMeals,
    estimateCalDisplay,
    draftTotals,
    savedMealCountsInDraft,
    handleFoodSelect,
    handlePhotoPrefill,
    addCalories,
    handleSubmit,
    handleUseSavedMeal,
    handleUseRecipe,
    openEditSavedMeal,
    cancelEditSavedMeal,
    handleUpdateSavedMeal,
    handlePostMealToDay,
    handleCreateMeal,
    handleSaveCurrentAsFrequent,
    handleSaveSearchFood,
    handleRecipeImage,
    handleSaveRecipe,
    resetRecipeCreator,
    handleDeleteRecipe,
    requestDeleteSavedMeal,
    cancelEdit,
    pendingSavedDelete,
    setPendingSavedDelete,
    pendingSavedDeleteBusy,
    executePendingSavedDelete,
  }
}

export type LogFoodDialogState = ReturnType<typeof useLogFoodDialog>
