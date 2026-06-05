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
  type CalorieEntry,
  type DraftMealItem,
  type PendingSavedMealDelete,
  type SavedMeal,
} from "@/lib/calories/log-food"

export interface UseLogFoodDialogOptions {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingEntry?: CalorieEntry | null
  onEditingEntryChange?: (entry: CalorieEntry | null) => void
  draftMealItems?: DraftMealItem[]
  onDraftMealItemsChange?: Dispatch<SetStateAction<DraftMealItem[]>>
  onPosted?: (created: CalorieEntry[]) => void
  onUpdated?: (entry: CalorieEntry) => void
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
}: UseLogFoodDialogOptions) {
  const { activeDate } = useActiveDate()
  const { user } = useUser()
  const today = activeDate

  const [internalDraft, setInternalDraft] = useState<DraftMealItem[]>([])
  const draftMealItems = controlledDraft ?? internalDraft
  const setDraftMealItems = onDraftMealItemsChange ?? setInternalDraft

  const editingEntry = controlledEditingEntry ?? null

  const [mealType, setMealType] = useState("lunch")
  const [description, setDescription] = useState("")
  const [calories, setCalories] = useState("")
  const [protein, setProtein] = useState("")
  const [carbs, setCarbs] = useState("")
  const [fat, setFat] = useState("")

  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([])
  const [showCreateMeal, setShowCreateMeal] = useState(false)
  const [newMealName, setNewMealName] = useState("")
  const [newMealCal, setNewMealCal] = useState("")
  const [newMealProtein, setNewMealProtein] = useState("")
  const [newMealCarbs, setNewMealCarbs] = useState("")
  const [newMealFat, setNewMealFat] = useState("")
  const [newMealTags, setNewMealTags] = useState<string[]>(["lunch"])
  const [editingSavedMealId, setEditingSavedMealId] = useState<string | null>(null)
  const [editSavedName, setEditSavedName] = useState("")
  const [editSavedCal, setEditSavedCal] = useState("")
  const [editSavedProtein, setEditSavedProtein] = useState("")
  const [editSavedCarbs, setEditSavedCarbs] = useState("")
  const [editSavedFat, setEditSavedFat] = useState("")
  const [editSavedTags, setEditSavedTags] = useState<string[]>([])
  const [editSavedError, setEditSavedError] = useState<string | null>(null)
  const [savingSavedMealEdit, setSavingSavedMealEdit] = useState(false)
  const [showSavePrompt, setShowSavePrompt] = useState(false)
  const [saveMealError, setSaveMealError] = useState<string | null>(null)
  const [logFoodSearchOpen, setLogFoodSearchOpen] = useState(false)
  const [logFoodManualOpen, setLogFoodManualOpen] = useState(false)
  const [logFoodPhotoOpen, setLogFoodPhotoOpen] = useState(false)
  const [flashSavedMealId, setFlashSavedMealId] = useState<string | null>(null)
  const [postingMeal, setPostingMeal] = useState(false)
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

  useEffect(() => {
    if (open) void fetchSavedMeals()
  }, [open, fetchSavedMeals])

  useEffect(() => {
    if (!open) {
      setLogFoodSearchOpen(false)
      setLogFoodManualOpen(false)
      setLogFoodPhotoOpen(false)
      setEditingSavedMealId(null)
      setEditSavedError(null)
    }
  }, [open])

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
    setShowSavePrompt(false)
    setLogFoodManualOpen(true)
  }, [editingEntry, open])

  const displayedSavedMeals = useMemo(() => {
    const mt = mealType.toLowerCase()
    return savedMeals.filter((m) => savedMealTagList(m).includes(mt))
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
        acc.calories += item.calories
        if (item.protein != null) acc.protein += item.protein
        if (item.carbs != null) acc.carbs += item.carbs
        if (item.fat != null) acc.fat += item.fat
        return acc
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )
  }, [draftMealItems])

  const savedMealIdsInDraft = useMemo(
    () =>
      new Set(
        draftMealItems
          .map((i) => i.savedMealId)
          .filter((x): x is string => Boolean(x))
      ),
    [draftMealItems]
  )

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
    setShowSavePrompt(true)
  }

  const handlePhotoPrefill = useCallback(
    (prefill: PhotoEstimatePrefill) => {
      if (vacationBlocksLog && !editingEntry) return
      setDescription(prefill.description)
      setCalories(String(Math.round(prefill.calories)))
      setProtein(prefill.protein != null ? String(prefill.protein) : "")
      setCarbs(prefill.carbs != null ? String(prefill.carbs) : "")
      setFat(prefill.fat != null ? String(prefill.fat) : "")
      setShowSavePrompt(true)
      setLogFoodManualOpen(true)
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
    setShowSavePrompt(false)
  }

  function addCurrentItemToMeal() {
    if (vacationBlocksLog) return
    const cal = parseFloat(calories)
    if (!Number.isFinite(cal) || cal <= 0) return

    const p = protein.trim() === "" ? null : parseFloat(protein)
    const c = carbs.trim() === "" ? null : parseFloat(carbs)
    const f = fat.trim() === "" ? null : parseFloat(fat)

    const item: DraftMealItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      mealType,
      description: description.trim() || null,
      calories: Math.round(cal),
      protein: Number.isFinite(p) ? p : null,
      carbs: Number.isFinite(c) ? c : null,
      fat: Number.isFinite(f) ? f : null,
    }

    setDraftMealItems((prev) => [...prev, item])
    resetCurrentItemFields()
  }

  function cancelEdit() {
    onEditingEntryChange?.(null)
    resetCurrentItemFields()
    setMealType("lunch")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!calories) return

    if (editingEntry) {
      if (vacationBlocksEditingEntry) return
      const res = await apiFetch("/api/calories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingEntry.id,
          date: editingEntry.date.split("T")[0],
          mealType,
          description: description || null,
          calories,
          protein: protein || null,
          carbs: carbs || null,
          fat: fat || null,
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

  function handleUseSavedMeal(meal: SavedMeal) {
    if (vacationBlocksLog) return
    const alreadyIn = draftMealItems.some((i) => i.savedMealId === meal.id)
    if (alreadyIn) {
      setDraftMealItems((prev) => prev.filter((i) => i.savedMealId !== meal.id))
      return
    }
    const item: DraftMealItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      mealType,
      description: meal.name,
      calories: meal.calories,
      protein: meal.protein,
      carbs: meal.carbs,
      fat: meal.fat,
      savedMealId: meal.id,
    }
    setFlashSavedMealId(meal.id)
    window.setTimeout(() => setFlashSavedMealId(null), 900)
    setDraftMealItems((prev) => [...prev, item])
    void apiFetch(`/api/saved-meals?id=${meal.id}`, { method: "PATCH" })
      .then(() => fetchSavedMeals())
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
    try {
      const created: CalorieEntry[] = []
      for (const item of draftMealItems) {
        const res = await apiFetch("/api/calories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: today,
            mealType: item.mealType,
            description: item.description,
            calories: String(item.calories),
            protein: item.protein != null ? String(item.protein) : null,
            carbs: item.carbs != null ? String(item.carbs) : null,
            fat: item.fat != null ? String(item.fat) : null,
          }),
        })
        if (res.ok) {
          created.push(await res.json())
        }
      }
      if (created.length > 0) {
        onPosted?.(created)
        onOpenChange(false)
      }
      setDraftMealItems([])
    } finally {
      setPostingMeal(false)
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
    setNewMealTags([mealType])
  }

  async function handleSaveCurrentAsFrequent() {
    if (!description.trim() || !calories.trim()) return

    await apiFetch("/api/saved-meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: description.trim(),
        mealTags: [mealType],
        calories,
        protein: protein || null,
        carbs: carbs || null,
        fat: fat || null,
      }),
    })

    fetchSavedMeals()
    setShowSavePrompt(false)
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
    calories,
    setCalories,
    savedMeals,
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
    editSavedError,
    savingSavedMealEdit,
    showSavePrompt,
    saveMealError,
    setSaveMealError: setSaveMealError,
    logFoodSearchOpen,
    setLogFoodSearchOpen,
    logFoodManualOpen,
    setLogFoodManualOpen,
    logFoodPhotoOpen,
    setLogFoodPhotoOpen,
    flashSavedMealId,
    postingMeal,
    draftMealItems,
    setDraftMealItems,
    vacationBlocksLog,
    vacationBlocksEditingEntry,
    vacationResumeLabel,
    displayedSavedMeals,
    estimateCalDisplay,
    draftTotals,
    savedMealIdsInDraft,
    handleFoodSelect,
    handlePhotoPrefill,
    addCalories,
    handleSubmit,
    handleUseSavedMeal,
    openEditSavedMeal,
    cancelEditSavedMeal,
    handleUpdateSavedMeal,
    handlePostMealToDay,
    handleCreateMeal,
    handleSaveCurrentAsFrequent,
    requestDeleteSavedMeal,
    cancelEdit,
    pendingSavedDelete,
    setPendingSavedDelete,
    pendingSavedDeleteBusy,
    executePendingSavedDelete,
  }
}

export type LogFoodDialogState = ReturnType<typeof useLogFoodDialog>
