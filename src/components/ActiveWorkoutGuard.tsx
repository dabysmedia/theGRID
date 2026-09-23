"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { apiFetch } from "@/lib/api-fetch"
import { useUser } from "@/context/UserContext"

/**
 * A started workout lives until it is finished or discarded: any other route
 * bounces back to `/workouts` while an active session exists.
 */
export function ActiveWorkoutGuard() {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useUser()
  const userId = user?.id ?? null

  useEffect(() => {
    if (!userId || pathname === "/workouts") return
    let cancelled = false
    void apiFetch(`/api/workout-sessions?status=active&_=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((rows: unknown) => {
        if (cancelled || !Array.isArray(rows) || rows.length === 0) return
        router.replace("/workouts")
      })
      .catch(() => {
        /* never block navigation on a failed check */
      })
    return () => {
      cancelled = true
    }
  }, [pathname, router, userId])

  return null
}
