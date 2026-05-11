/**
 * Browser-side helpers for Web Push subscription.
 *
 * iOS quirks to remember:
 *  - PushManager.subscribe() only works inside an installed PWA on iOS 16.4+.
 *  - Notification.requestPermission() must be called from a user gesture handler.
 *  - Subscriptions can disappear when iOS wipes PWA storage; always re-check
 *    `getSubscription()` on mount.
 */

import { apiFetch } from "@/lib/api-fetch"

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false
  if (window.matchMedia("(display-mode: standalone)").matches) return true
  // iOS Safari legacy property
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return Boolean(nav.standalone)
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

/** True if the device is iOS Safari that needs install-to-home-screen first. */
export function needsIosInstall(): boolean {
  return isIos() && !isStandalonePwa()
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null
  try {
    const reg = await navigator.serviceWorker.ready
    return reg
  } catch {
    return null
  }
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const reg = await getRegistration()
  if (!reg) return null
  return reg.pushManager.getSubscription()
}

export interface SubscribeOutcome {
  ok: boolean
  error?: string
  subscription?: PushSubscription
}

export async function subscribeToPush(): Promise<SubscribeOutcome> {
  if (!isPushSupported()) {
    return { ok: false, error: "Push notifications aren't supported in this browser." }
  }
  if (needsIosInstall()) {
    return {
      ok: false,
      error:
        "Install THEGRID to your home screen first: tap the Share button, then \"Add to Home Screen\".",
    }
  }

  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapid) {
    return { ok: false, error: "Server is missing a VAPID public key." }
  }

  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    return { ok: false, error: "Notifications permission was denied." }
  }

  const reg = await getRegistration()
  if (!reg) return { ok: false, error: "Service worker isn't ready yet — refresh and retry." }

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    try {
      // PushManager.subscribe accepts a BufferSource; the generic Uint8Array
      // typing under modern TS lib defs needs an explicit cast.
      const applicationServerKey = urlBase64ToUint8Array(vapid) as unknown as BufferSource
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      })
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Subscription failed.",
      }
    }
  }

  const json = sub.toJSON()
  const tz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : null

  const res = await apiFetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: {
        endpoint: json.endpoint,
        keys: json.keys,
      },
      timeZone: tz,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return {
      ok: false,
      error: data.error ?? `Server rejected subscription (${res.status}).`,
    }
  }
  return { ok: true, subscription: sub }
}

export async function unsubscribeFromPush(): Promise<{ ok: boolean; error?: string }> {
  const sub = await getCurrentSubscription()
  if (!sub) return { ok: true }
  const endpoint = sub.endpoint
  try {
    await sub.unsubscribe()
  } catch {
    /* ignore */
  }
  const res = await apiFetch(
    `/api/notifications/subscribe?endpoint=${encodeURIComponent(endpoint)}`,
    { method: "DELETE" }
  )
  if (!res.ok) {
    return { ok: false, error: `Failed to remove subscription (${res.status}).` }
  }
  return { ok: true }
}

export async function sendTestNotification(): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch("/api/notifications/test", { method: "POST" })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: data.error ?? `Test failed (${res.status}).` }
  }
  return { ok: true }
}
