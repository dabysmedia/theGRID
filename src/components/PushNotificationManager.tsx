"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity,
  BarChart3,
  Bell,
  BellRing,
  CheckSquare,
  Dumbbell,
  Flame,
  Footprints,
  Moon,
  NotebookPen,
  Scale,
  Smartphone,
  Timer,
  Utensils,
  Bed,
} from "lucide-react"
import { useUser } from "@/context/UserContext"
import {
  isPushSupported,
  isStandalonePwa,
  needsIosInstall,
  getCurrentSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  sendTestNotification,
} from "@/lib/notifications/client"
import {
  NOTIFICATION_CATALOG,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_BY_KEY,
  type NotificationDef,
  type NotificationIconName,
  type NotificationKey,
} from "@/lib/notifications/catalog"
import { apiFetch } from "@/lib/api-fetch"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface PreferenceState {
  enabled: boolean
  timeOfDay: string | null
}

type PreferenceMap = Record<NotificationKey, PreferenceState>

const ICON_MAP: Record<NotificationIconName, typeof Bell> = {
  utensils: Utensils,
  scale: Scale,
  bed: Bed,
  moon: Moon,
  pen: NotebookPen,
  footprints: Footprints,
  activity: Activity,
  checkSquare: CheckSquare,
  barChart: BarChart3,
  timer: Timer,
  flame: Flame,
  dumbbell: Dumbbell,
}

function buildInitialMap(): PreferenceMap {
  const out = {} as PreferenceMap
  for (const def of NOTIFICATION_CATALOG) {
    out[def.key] = {
      enabled: def.defaultEnabled,
      timeOfDay: def.defaultTime ?? null,
    }
  }
  return out
}

export function PushNotificationManager() {
  const { user } = useUser()
  const [supported, setSupported] = useState(false)
  const [standalone, setStandalone] = useState(false)
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>("default")
  const [subscribed, setSubscribed] = useState(false)
  const [loadingPrefs, setLoadingPrefs] = useState(true)
  const [busy, setBusy] = useState(false)
  const [savingKey, setSavingKey] = useState<NotificationKey | null>(null)
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const [prefs, setPrefs] = useState<PreferenceMap>(buildInitialMap)

  useEffect(() => {
    setSupported(isPushSupported())
    setStandalone(isStandalonePwa())
    setIosNeedsInstall(needsIosInstall())
    if (typeof Notification !== "undefined") setPermission(Notification.permission)
  }, [])

  const refreshSubscriptionState = useCallback(async () => {
    const sub = await getCurrentSubscription()
    setSubscribed(!!sub)
  }, [])

  const loadPrefs = useCallback(async () => {
    if (!user) return
    setLoadingPrefs(true)
    try {
      const res = await apiFetch("/api/notifications/preferences")
      if (!res.ok) return
      const data = (await res.json()) as {
        preferences: { key: NotificationKey; enabled: boolean; timeOfDay: string | null }[]
      }
      const next = buildInitialMap()
      for (const row of data.preferences) {
        if (row.key in NOTIFICATION_BY_KEY) {
          next[row.key] = { enabled: row.enabled, timeOfDay: row.timeOfDay }
        }
      }
      setPrefs(next)
    } finally {
      setLoadingPrefs(false)
    }
  }, [user])

  useEffect(() => {
    if (!supported || !user) return
    void refreshSubscriptionState()
    void loadPrefs()
  }, [supported, user, refreshSubscriptionState, loadPrefs])

  const handleSubscribe = useCallback(async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await subscribeToPush()
      if (!result.ok) {
        setMessage({ kind: "err", text: result.error ?? "Subscription failed." })
        return
      }
      setSubscribed(true)
      if (typeof Notification !== "undefined") setPermission(Notification.permission)
      await loadPrefs()
      setMessage({
        kind: "ok",
        text: "Notifications enabled. Reminders will arrive at your chosen times.",
      })
    } finally {
      setBusy(false)
    }
  }, [loadPrefs])

  const handleUnsubscribe = useCallback(async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await unsubscribeFromPush()
      if (!result.ok) {
        setMessage({ kind: "err", text: result.error ?? "Failed to unsubscribe." })
        return
      }
      setSubscribed(false)
      setMessage({ kind: "ok", text: "Push notifications disabled on this device." })
    } finally {
      setBusy(false)
    }
  }, [])

  const handleTest = useCallback(async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await sendTestNotification()
      if (!result.ok) {
        setMessage({ kind: "err", text: result.error ?? "Test failed." })
        return
      }
      setMessage({
        kind: "ok",
        text: "Test sent — check your lock screen or notification centre.",
      })
    } finally {
      setBusy(false)
    }
  }, [])

  const savePref = useCallback(
    async (key: NotificationKey, partial: Partial<PreferenceState>) => {
      setSavingKey(key)
      const previous = prefs[key]
      const next: PreferenceState = { ...previous, ...partial }
      setPrefs((p) => ({ ...p, [key]: next }))
      try {
        const res = await apiFetch("/api/notifications/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            updates: [
              {
                key,
                ...("enabled" in partial ? { enabled: partial.enabled } : {}),
                ...("timeOfDay" in partial ? { timeOfDay: partial.timeOfDay } : {}),
              },
            ],
          }),
        })
        if (!res.ok) {
          setPrefs((p) => ({ ...p, [key]: previous }))
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          setMessage({ kind: "err", text: data.error ?? "Failed to save." })
        }
      } catch (e) {
        setPrefs((p) => ({ ...p, [key]: previous }))
        setMessage({
          kind: "err",
          text: e instanceof Error ? e.message : "Failed to save.",
        })
      } finally {
        setSavingKey(null)
      }
    },
    [prefs]
  )

  const groupedByCategory = useMemo(() => {
    const map: Record<string, NotificationDef[]> = {}
    for (const def of NOTIFICATION_CATALOG) {
      map[def.category] = map[def.category] ?? []
      map[def.category].push(def)
    }
    return map
  }, [])

  if (!user) return null

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/30 bg-muted/15">
          <Bell className="h-4 w-4 text-muted-foreground/70" />
        </div>
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold tracking-wide text-foreground">
            Push notifications
          </h3>
          <p className="text-[11px] leading-relaxed text-muted-foreground/80">
            Get reminders at the right time — log lunch when it&apos;s noon, hear when your fast
            ends, never forget weigh-in.
          </p>
        </div>
      </div>

      {!supported && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90">
          This browser doesn&apos;t support web push notifications.
        </p>
      )}

      {supported && iosNeedsInstall && (
        <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-[11px] leading-relaxed text-amber-200/90">
          <p className="flex items-center gap-1.5 font-semibold text-amber-200">
            <Smartphone className="h-3.5 w-3.5" aria-hidden /> Install required on iOS
          </p>
          <p>
            iPhone and iPad only deliver web push notifications to home-screen apps. Tap the Share
            icon in Safari, then <span className="font-semibold">Add to Home Screen</span>, and
            open THEGRID from the new icon to finish enabling.
          </p>
        </div>
      )}

      {supported && !iosNeedsInstall && permission === "denied" && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive/90">
          Notification permission was blocked. Re-enable it in your device&apos;s settings for
          THEGRID, then come back here.
        </p>
      )}

      {supported && (
        <div className="flex flex-wrap gap-2">
          {!subscribed ? (
            <Button
              type="button"
              variant="glass"
              size="sm"
              disabled={busy || (iosNeedsInstall && !standalone)}
              onClick={() => void handleSubscribe()}
            >
              <BellRing className="h-3.5 w-3.5" aria-hidden />
              {busy ? "Enabling…" : "Enable notifications"}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void handleTest()}
              >
                Send test
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => void handleUnsubscribe()}
              >
                Disable on this device
              </Button>
            </>
          )}
        </div>
      )}

      {message && (
        <p
          className={cn(
            "text-[11px] leading-snug",
            message.kind === "err" ? "text-destructive/90" : "text-muted-foreground/90"
          )}
        >
          {message.text}
        </p>
      )}

      {supported && subscribed && (
        <div className="space-y-5 pt-2">
          <div className="hud-divider" />
          <div className="space-y-1">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/55">
              Reminders
            </h4>
            <p className="text-[11px] leading-relaxed text-muted-foreground/70">
              Toggle each reminder, and pick the local time you want to hear from THEGRID.
            </p>
          </div>

          {loadingPrefs ? (
            <p className="text-[11px] text-muted-foreground/70">Loading preferences…</p>
          ) : (
            <div className="space-y-5">
              {NOTIFICATION_CATEGORIES.map((category) => {
                const defs = groupedByCategory[category.key]
                if (!defs || defs.length === 0) return null
                return (
                  <div key={category.key} className="space-y-2">
                    <h5 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/55">
                      {category.label}
                    </h5>
                    <ul className="space-y-1.5">
                      {defs.map((def) => {
                        const state = prefs[def.key]
                        const Icon = ICON_MAP[def.icon]
                        const saving = savingKey === def.key
                        return (
                          <li
                            key={def.key}
                            className="flex items-start gap-3 rounded-lg border border-border/20 bg-muted/5 px-3 py-2.5"
                          >
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/30 bg-muted/15">
                              <Icon className="h-3.5 w-3.5 text-muted-foreground/80" aria-hidden />
                            </div>
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-[12px] font-medium leading-snug text-foreground">
                                  {def.title}
                                </p>
                                <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 select-none">
                                  <span className="sr-only">Enable {def.title}</span>
                                  <input
                                    type="checkbox"
                                    checked={state.enabled}
                                    disabled={saving}
                                    onChange={(e) =>
                                      void savePref(def.key, { enabled: e.target.checked })
                                    }
                                    className="h-4 w-4 cursor-pointer accent-primary"
                                  />
                                </label>
                              </div>
                              <p className="text-[11px] leading-snug text-muted-foreground/75">
                                {def.description}
                              </p>
                              {def.timeEditable && state.enabled && (
                                <div className="pt-1">
                                  <Input
                                    type="time"
                                    value={state.timeOfDay ?? def.defaultTime ?? "09:00"}
                                    disabled={saving}
                                    onChange={(e) =>
                                      void savePref(def.key, {
                                        timeOfDay: e.target.value || null,
                                      })
                                    }
                                    className="h-8 w-[7rem] text-xs"
                                  />
                                </div>
                              )}
                              {!def.timeEditable && (
                                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/55">
                                  Event-based
                                </p>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
