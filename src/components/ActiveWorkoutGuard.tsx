"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { apiFetch } from "@/lib/api-fetch"

const noStore: RequestInit = { cache: "no-store" }

/**
 * If an active workout session exists, force navigation to `/workouts`
 * from any other route so the user cannot leave until finish/discard.
 */
export function ActiveWorkoutGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const checkingRef = useRef(false)

  useEffect(() => {
    if (pathname === "/workouts") return
    if (checkingRef.current) return
    checkingRef.current = true

    let cancelled = false
    void apiFetch(`/api/workout-sessions?_=${Date.now()}`, noStore)
      .then((r) => (r.ok ? r.json() : null))
      .then((rows: unknown) => {
        if (cancelled) return
        if (!Array.isArray(rows)) return
        const hasActive = rows.some((s) => {
          if (!s || typeof s !== "object") return false
          const status = String((s as { status?: unknown }).status ?? "")
            .trim()
            .toLowerCase()
          return status === "active"
        })
        if (hasActive) router.replace("/workouts")
      })
      .catch(() => {
        /* ignore — do not block navigation on fetch failure */
      })
      .finally(() => {
        checkingRef.current = false
      })

    return () => {
      cancelled = true
    }
  }, [pathname, router])

  return <>{children}</>
}
