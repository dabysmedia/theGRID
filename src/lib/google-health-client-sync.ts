import { apiFetch } from "@/lib/api-fetch"
import { PULL_REFRESH_SYNC_DAYS } from "@/lib/pull-refresh"

export const GOOGLE_HEALTH_SYNCED_EVENT = "grid:google-health-synced"
export const LOG_SAVED_EVENT = "grid:log-saved"
export const VIEWS_REFRESHED_EVENT = "grid:views-refreshed"

type GoogleHealthStatus = {
  configured?: boolean
  connected?: boolean
}

export type GoogleHealthSyncResult =
  | { synced: true }
  | { synced: false; reason: "disconnected" | "unconfigured" | "aborted" | "error" }

let inFlight: Promise<GoogleHealthSyncResult> | null = null

export function shouldRequestGoogleHealthSync(status: GoogleHealthStatus): boolean {
  return Boolean(status.configured && status.connected)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError"
}

async function doGoogleHealthSync(opts: {
  days: number
  signal?: AbortSignal
}): Promise<GoogleHealthSyncResult> {
  if (opts.signal?.aborted) return { synced: false, reason: "aborted" }

  const statusResponse = await apiFetch("/api/google-health/status", {
    cache: "no-store",
    signal: opts.signal,
  })
  if (!statusResponse.ok) return { synced: false, reason: "error" }

  const status = (await statusResponse.json()) as GoogleHealthStatus
  if (!status.configured) return { synced: false, reason: "unconfigured" }
  if (!status.connected) return { synced: false, reason: "disconnected" }

  const syncResponse = await apiFetch("/api/google-health/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days: opts.days }),
    signal: opts.signal,
  })
  if (!syncResponse.ok) return { synced: false, reason: "error" }
  return { synced: true }
}

/**
 * One in-flight Google Health POST at a time. Callers still apply their own
 * stale-window / force-refresh policy before invoking this.
 */
export async function requestGoogleHealthSync(opts: {
  days: number
  signal?: AbortSignal
}): Promise<GoogleHealthSyncResult> {
  if (opts.signal?.aborted) return { synced: false, reason: "aborted" }

  if (!inFlight) {
    inFlight = doGoogleHealthSync(opts).finally(() => {
      inFlight = null
    })
  }

  try {
    const result = await inFlight
    if (opts.signal?.aborted) return { synced: false, reason: "aborted" }
    return result
  } catch (error) {
    if (opts.signal?.aborted || isAbortError(error)) {
      return { synced: false, reason: "aborted" }
    }
    return { synced: false, reason: "error" }
  }
}

export function notifyAppDataRefreshed(detail?: Record<string, unknown>): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent(GOOGLE_HEALTH_SYNCED_EVENT, { detail }),
  )
  window.dispatchEvent(
    new CustomEvent(LOG_SAVED_EVENT, {
      detail: { silent: true, ...detail },
    }),
  )
}

/** Pull-to-refresh: quick Health sync when connected, then reload mounted views. */
export async function refreshAppData(opts?: {
  days?: number
  signal?: AbortSignal
  source?: string
}): Promise<GoogleHealthSyncResult> {
  let result: GoogleHealthSyncResult = { synced: false, reason: "error" }
  try {
    result = await requestGoogleHealthSync({
      days: opts?.days ?? PULL_REFRESH_SYNC_DAYS,
      signal: opts?.signal,
    })
  } catch {
    result = { synced: false, reason: "error" }
  }
  notifyAppDataRefreshed({
    source: opts?.source ?? "pull-refresh",
    synced: result.synced,
  })
  return result
}
