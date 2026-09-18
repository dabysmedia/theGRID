"use client"

import { useCallback, useEffect, useState } from "react"
import { apiFetch } from "@/lib/api-fetch"
import { useActiveDate } from "@/context/DateContext"
import { useUser } from "@/context/UserContext"
import type { ProgressSnapshot } from "@/lib/grid-progress"

export function useGridProgress() {
  const { activeDate } = useActiveDate()
  const { user } = useUser()
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!user?.id) return
      if (!opts?.silent) setLoading(true)
      try {
        const res = await apiFetch(`/api/progress?d=${activeDate}&_ts=${Date.now()}`, {
          cache: "no-store",
        })
        if (res.ok) {
          setSnapshot((await res.json()) as ProgressSnapshot)
        }
      } catch {
        // DB not ready
      } finally {
        setLoading(false)
      }
    },
    [activeDate, user?.id],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    function onLogSaved(event: Event) {
      const silent =
        event instanceof CustomEvent &&
        Boolean((event.detail as { silent?: unknown } | undefined)?.silent)
      void refresh({ silent })
    }
    window.addEventListener("grid:log-saved", onLogSaved)
    return () => window.removeEventListener("grid:log-saved", onLogSaved)
  }, [refresh])

  return { snapshot, loading, refresh }
}
