"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

const ACTIVE_USER_STORAGE_KEY = "theGRID_activeUserId"
const UNLOCKED_USER_STORAGE_KEY = "theGRID_unlockedUserId"

export interface UserProfile {
  id: string
  name: string
  avatarColor: string
  createdAt: string
}

interface UserContextValue {
  users: UserProfile[]
  activeUserId: string | null
  activeUser: UserProfile | null
  loading: boolean
  refreshUsers: () => Promise<void>
  unlockAndSwitchUser: (userId: string, pin: string) => Promise<void>
  createUser: (payload: { name: string; pin: string; avatarColor?: string }) => Promise<void>
}

const UserContext = createContext<UserContextValue | null>(null)

async function fetchUsersList(): Promise<UserProfile[]> {
  const res = await fetch("/api/users", { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to fetch users")
  return res.json()
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [activeUserId, setActiveUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUsers = useCallback(async () => {
    const list = await fetchUsersList()
    setUsers(list)
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const list = await fetchUsersList()
        if (!mounted) return
        setUsers(list)

        const storedUnlocked = sessionStorage.getItem(UNLOCKED_USER_STORAGE_KEY)
        const storedActive = localStorage.getItem(ACTIVE_USER_STORAGE_KEY)
        const candidate = storedUnlocked || storedActive || list[0]?.id || null
        const valid = candidate && list.some((u) => u.id === candidate) ? candidate : list[0]?.id ?? null
        setActiveUserId(valid)
      } catch {
        if (mounted) setUsers([])
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!activeUserId) return
    try {
      localStorage.setItem(ACTIVE_USER_STORAGE_KEY, activeUserId)
      sessionStorage.setItem(UNLOCKED_USER_STORAGE_KEY, activeUserId)
    } catch {}
  }, [activeUserId])

  // Attach active user id to all same-origin API requests.
  useEffect(() => {
    if (typeof window === "undefined") return
    const originalFetch = window.fetch.bind(window)

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const reqUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url

      const isApiRequest =
        reqUrl.startsWith("/api/") ||
        reqUrl.startsWith(`${window.location.origin}/api/`)

      if (!isApiRequest || !activeUserId) {
        return originalFetch(input, init)
      }

      const headers = new Headers(init?.headers)
      headers.set("x-user-id", activeUserId)
      return originalFetch(input, { ...init, headers })
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [activeUserId])

  const unlockAndSwitchUser = useCallback(async (userId: string, pin: string) => {
    const res = await fetch("/api/users/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, pin }),
    })
    const payload = await res.json()
    if (!res.ok) throw new Error(payload.error || "Failed to unlock user")
    setActiveUserId(userId)
  }, [])

  const createUser = useCallback(async (payload: { name: string; pin: string; avatarColor?: string }) => {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || "Failed to create user")
    await refreshUsers()
  }, [refreshUsers])

  const activeUser = useMemo(
    () => users.find((u) => u.id === activeUserId) ?? null,
    [users, activeUserId]
  )

  const value = useMemo<UserContextValue>(
    () => ({
      users,
      activeUserId,
      activeUser,
      loading,
      refreshUsers,
      unlockAndSwitchUser,
      createUser,
    }),
    [users, activeUserId, activeUser, loading, refreshUsers, unlockAndSwitchUser, createUser]
  )

  return <UserContext value={value}>{children}</UserContext>
}

export function useUserContext(): UserContextValue {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error("useUserContext must be used within UserProvider")
  return ctx
}

