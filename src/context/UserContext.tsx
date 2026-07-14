"use client"

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
  useEffect,
  type ReactNode,
} from "react"

const STORAGE_KEY = "theGRID_activeUser"

export interface UserProfile {
  id: string
  name: string
  avatarColor: string
  avatarUrl?: string | null
  /** yyyy-MM-dd — first day calorie & weight logging resume; omitted/null = off */
  vacationResumeDate?: string | null
  workCycleEnabled?: boolean
  /** yyyy-MM-dd key for rotation day one. */
  workCycleAnchorDate?: string | null
  workCycleLength?: number
  workCyclePatternJson?: string
  workoutGoalPerCycle?: number
}

interface UserContextValue {
  user: UserProfile | null
  users: UserProfile[]
  loading: boolean
  switchUser: (user: UserProfile) => void
  logout: () => void
  /** Returns users on success, or `undefined` if the request failed (state is left unchanged). */
  refreshUsers: () => Promise<UserProfile[] | undefined>
}

const UserContext = createContext<UserContextValue | null>(null)

function readStoredUser(): UserProfile | null {
  if (typeof window === "undefined") return null
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v) return JSON.parse(v) as UserProfile
  } catch {}
  return null
}

function storeUser(user: UserProfile | null) {
  try {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {}
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = readStoredUser()
    if (stored) setUser(stored)
    setHydrated(true)
  }, [])

  const refreshUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users")
      if (res.ok) {
        const list = (await res.json()) as UserProfile[]
        setUsers(list)
        return list
      }
    } catch {}
    return undefined
  }, [])

  useEffect(() => {
    if (!hydrated) return
    let cancelled = false

    async function init() {
      const list = await refreshUsers()
      if (cancelled) return
      if (list === undefined) {
        setLoading(false)
        return
      }

      if (list.length === 1 && !user) {
        const solo = list[0]
        setUser(solo)
        storeUser(solo)
      } else if (user && !list.find((u) => u.id === user.id)) {
        setUser(null)
        storeUser(null)
      }
      setLoading(false)
    }

    init()
    return () => { cancelled = true }
  }, [hydrated]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || users.length === 0) return
    const f = users.find((u) => u.id === user.id)
    if (!f) return
    const nameSame = f.name === user.name
    const colorSame = f.avatarColor === user.avatarColor
    const urlSame = (f.avatarUrl ?? null) === (user.avatarUrl ?? null)
    const vacationSame = (f.vacationResumeDate ?? null) === (user.vacationResumeDate ?? null)
    const workCycleSame =
      Boolean(f.workCycleEnabled) === Boolean(user.workCycleEnabled) &&
      (f.workCycleAnchorDate ?? null) === (user.workCycleAnchorDate ?? null) &&
      (f.workCycleLength ?? 8) === (user.workCycleLength ?? 8) &&
      (f.workCyclePatternJson ?? "") === (user.workCyclePatternJson ?? "") &&
      (f.workoutGoalPerCycle ?? 3) === (user.workoutGoalPerCycle ?? 3)
    if (nameSame && colorSame && urlSame && vacationSame && workCycleSame) return
    setUser(f)
    storeUser(f)
  }, [users, user])

  const switchUser = useCallback((u: UserProfile) => {
    setUser(u)
    storeUser(u)
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    storeUser(null)
  }, [])

  const value = useMemo<UserContextValue>(
    () => ({ user, users, loading, switchUser, logout, refreshUsers }),
    [user, users, loading, switchUser, logout, refreshUsers]
  )

  return <UserContext value={value}>{children}</UserContext>
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error("useUser must be used within UserProvider")
  return ctx
}
