"use client"

import { useEffect, useRef } from "react"
import { useUser } from "@/context/UserContext"
import { apiFetch } from "@/lib/api-fetch"

const AUTO_SYNC_WINDOW_MS = 5 * 60 * 1000
const AUTO_SYNC_DAYS = 7

type GoogleHealthStatus = {
  configured?: boolean
  connected?: boolean
  lastSyncAt?: string | null
}

/**
 * Keeps Google Health current when the installed web app is opened or resumed.
 * The server performs the real sync; this client only provides an app-lifecycle
 * trigger and tells mounted data views to refresh after it completes.
 */
export function GoogleHealthAutoSync() {
  const { user, loading } = useUser()
  const syncingRef = useRef(false)

  useEffect(() => {
    if (loading || !user) return

    const userId = user.id
    const controller = new AbortController()

    async function syncIfStale() {
      if (syncingRef.current || document.visibilityState === "hidden") return
      syncingRef.current = true

      try {
        const statusResponse = await apiFetch("/api/google-health/status", {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!statusResponse.ok) return

        const status = (await statusResponse.json()) as GoogleHealthStatus
        if (!status.configured || !status.connected) return

        const lastSyncMs = status.lastSyncAt ? new Date(status.lastSyncAt).getTime() : 0
        if (Number.isFinite(lastSyncMs) && Date.now() - lastSyncMs < AUTO_SYNC_WINDOW_MS) {
          return
        }

        const syncResponse = await apiFetch("/api/google-health/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ days: AUTO_SYNC_DAYS }),
          signal: controller.signal,
        })
        if (!syncResponse.ok) return

        window.dispatchEvent(
          new CustomEvent("grid:google-health-synced", {
            detail: { userId },
          }),
        )
        window.dispatchEvent(new CustomEvent("grid:log-saved"))
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // The status/settings view surfaces persisted sync failures.
        }
      } finally {
        syncingRef.current = false
      }
    }

    void syncIfStale()

    function onVisible() {
      if (document.visibilityState === "visible") void syncIfStale()
    }

    window.addEventListener("focus", syncIfStale)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      controller.abort()
      window.removeEventListener("focus", syncIfStale)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [loading, user])

  return null
}
