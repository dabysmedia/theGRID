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
import type { TrainingStyle } from "@/lib/workouts/training-style"
import type { TrainingSplit } from "@/lib/workouts/training-split"

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
  trainingStyle?: TrainingStyle
  trainingSplit?: TrainingSplit
  protocolEnabled?: boolean
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

  const refreshUsers = useCallback(async () => {
    try {
      const [profilesResponse, sessionResponse] = await Promise.all([
        fetch("/api/users", { cache: "no-store" }),
        fetch("/api/users/session", { cache: "no-store", credentials: "same-origin" }),
      ])
      if (!profilesResponse.ok) return undefined

      const list = (await profilesResponse.json()) as UserProfile[]
      setUsers(list)
      if (sessionResponse.ok) {
        const session = (await sessionResponse.json()) as { user?: UserProfile }
        if (session.user) {
          const publicIdentity = list.find((candidate) => candidate.id === session.user?.id)
          const restored = { ...publicIdentity, ...session.user }
          setUser(restored)
          storeUser(restored)
        }
      } else if (sessionResponse.status === 401) {
        setUser(null)
        storeUser(null)
      }
      return list
    } catch {}
    return undefined
  }, [])

  useEffect(() => {
    let cancelled = false

    async function init() {
      await refreshUsers()
      if (!cancelled) setLoading(false)
    }

    void init()
    return () => { cancelled = true }
  }, [refreshUsers])

  const switchUser = useCallback((u: UserProfile) => {
    setUser(u)
    storeUser(u)
  }, [])

  const logout = useCallback(() => {
    void fetch("/api/users/session", { method: "DELETE", credentials: "same-origin" }).catch(() => {})
    setUser(null)
    storeUser(null)
  }, [])

  useEffect(() => {
    const onExpired = () => logout()
    window.addEventListener("grid:session-expired", onExpired)
    return () => window.removeEventListener("grid:session-expired", onExpired)
  }, [logout])

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
