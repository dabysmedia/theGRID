import { normalizeExerciseKey } from "@/lib/workouts/progressive-overload"

/*
 * Remembers exercise substitutions so the next time a routine starts,
 * the preferred movement is already in place — and the swap picker can
 * surface recent alternatives for that slot.
 */

const STORAGE_KEY = "thegrid:exercise-substitutions"
const MAX_RECENT = 6

export interface SubstitutionRecord {
  /** Normalized original (template) exercise name. */
  fromKey: string
  fromName: string
  /** Preferred substitute. */
  toName: string
  /** Recent alternatives (newest first), including current `toName`. */
  recentTo: string[]
  useCount: number
  lastUsedAt: number
}

export interface SubstitutionStore {
  /** Keyed by normalizeExerciseKey(fromName). */
  byFrom: Record<string, SubstitutionRecord>
  /** Keyed by templateId:templateExerciseId for slot-stable memory. */
  bySlot: Record<
    string,
    {
      templateId: string
      templateExerciseId: string
      fromName: string
      toName: string
      recentTo: string[]
      useCount: number
      lastUsedAt: number
    }
  >
}

const EMPTY: SubstitutionStore = { byFrom: {}, bySlot: {} }

function slotKey(templateId: string, templateExerciseId: string): string {
  return `${templateId}:${templateExerciseId}`
}

export function loadSubstitutionStore(): SubstitutionStore {
  if (typeof window === "undefined") return EMPTY
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const p = JSON.parse(raw) as Partial<SubstitutionStore>
    return {
      byFrom: p.byFrom && typeof p.byFrom === "object" ? { ...p.byFrom } : {},
      bySlot: p.bySlot && typeof p.bySlot === "object" ? { ...p.bySlot } : {},
    }
  } catch {
    return EMPTY
  }
}

function persist(store: SubstitutionStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* ignore quota */
  }
}

function pushRecent(list: string[], name: string): string[] {
  const key = normalizeExerciseKey(name)
  const next = [name, ...list.filter((n) => normalizeExerciseKey(n) !== key)]
  return next.slice(0, MAX_RECENT)
}

/** Record a swap so future sessions / pickers can reuse it. */
export function rememberSubstitution(input: {
  fromName: string
  toName: string
  templateId?: string | null
  templateExerciseId?: string | null
}): SubstitutionStore {
  const store = loadSubstitutionStore()
  const fromKey = normalizeExerciseKey(input.fromName)
  const now = Date.now()

  const prev = store.byFrom[fromKey]
  store.byFrom[fromKey] = {
    fromKey,
    fromName: input.fromName,
    toName: input.toName,
    recentTo: pushRecent(prev?.recentTo ?? [], input.toName),
    useCount: (prev?.useCount ?? 0) + 1,
    lastUsedAt: now,
  }

  if (input.templateId && input.templateExerciseId) {
    const sk = slotKey(input.templateId, input.templateExerciseId)
    const slotPrev = store.bySlot[sk]
    store.bySlot[sk] = {
      templateId: input.templateId,
      templateExerciseId: input.templateExerciseId,
      fromName: input.fromName,
      toName: input.toName,
      recentTo: pushRecent(slotPrev?.recentTo ?? [], input.toName),
      useCount: (slotPrev?.useCount ?? 0) + 1,
      lastUsedAt: now,
    }
  }

  persist(store)
  return store
}

/** Preferred substitute for a template slot (slot wins over name). */
export function getPreferredSubstitute(input: {
  fromName: string
  templateId?: string | null
  templateExerciseId?: string | null
}): { toName: string; recentTo: string[] } | null {
  const store = loadSubstitutionStore()
  if (input.templateId && input.templateExerciseId) {
    const slot = store.bySlot[slotKey(input.templateId, input.templateExerciseId)]
    if (slot?.toName) {
      return { toName: slot.toName, recentTo: slot.recentTo }
    }
  }
  const byName = store.byFrom[normalizeExerciseKey(input.fromName)]
  if (byName?.toName) {
    return { toName: byName.toName, recentTo: byName.recentTo }
  }
  return null
}

/** Recent substitutes for the swap picker (newest first). */
export function getRecentSubstitutes(input: {
  fromName: string
  templateId?: string | null
  templateExerciseId?: string | null
}): string[] {
  const pref = getPreferredSubstitute(input)
  if (!pref) return []
  return pref.recentTo
}
