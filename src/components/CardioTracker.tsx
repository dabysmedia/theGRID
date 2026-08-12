"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Check, Pencil, Plus, Trash2, X, Zap } from "lucide-react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  getDialogMotionOrigin,
  type DialogMotionOrigin,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useActiveDate } from "@/context/DateContext"
import { useUser } from "@/context/UserContext"
import { apiFetch } from "@/lib/api-fetch"
import {
  CARDIO_ACTIVITIES,
  CARDIO_ACTIVITY_LABELS,
  cardioActivityLabel,
  type CardioActivity,
} from "@/lib/cardio"
import { TRACKING_TARGET_DEFAULTS } from "@/lib/tracking-targets"
import { cn, formatDisplayDate, parseLocalDate } from "@/lib/utils"

const DEFAULT_GOAL_MIN: number = TRACKING_TARGET_DEFAULTS.cardio
const QUICK_MINUTES = [15, 30, 45] as const
const DEFAULT_ACTIVITY: CardioActivity = "cycling"

interface CardioSession {
  id: string
  activityType: string
  displayName: string | null
  minutes: number
  calories: number | null
  distanceMeters: number | null
  avgHeartRate: number | null
  startTime: string
  source: string | null
}

interface CardioResponse {
  sessions: CardioSession[]
  totalMinutes: number
  goalMinutes: number
}

function formatMinutes(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function formatSessionTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

function LightningBolt({
  minutes,
  goal,
  compact = false,
  animateFill = false,
}: {
  minutes: number
  goal: number
  compact?: boolean
  animateFill?: boolean
}) {
  const percent = Math.min(100, Math.max(0, (minutes / Math.max(goal, 1)) * 100))

  return (
    <div
      className={cn(
        "cardio-bolt-scene",
        compact && "cardio-bolt-scene--compact",
        percent >= 100 && "cardio-bolt-scene--charged",
      )}
      aria-hidden
    >
      <div className="cardio-bolt-shadow" />
      <div className="cardio-bolt-shell">
        <div className="cardio-bolt-core">
          <div
            className={cn("cardio-bolt-charge", animateFill && "cardio-bolt-charge--enter")}
            style={{ height: `${percent}%` }}
          >
            <div className="cardio-bolt-surface" />
            <span className="cardio-spark cardio-spark--one" />
            <span className="cardio-spark cardio-spark--two" />
            <span className="cardio-spark cardio-spark--three" />
          </div>
          <div className="cardio-bolt-arc" />
          <div className="cardio-bolt-gloss" />
        </div>
      </div>
    </div>
  )
}

export function CardioTracker() {
  const { activeDate } = useActiveDate()
  const { user } = useUser()
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState<CardioSession[]>([])
  const [totalMinutes, setTotalMinutes] = useState(0)
  const [goalMinutes, setGoalMinutes] = useState(DEFAULT_GOAL_MIN)
  const [goalInput, setGoalInput] = useState(String(DEFAULT_GOAL_MIN))
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalBusy, setGoalBusy] = useState(false)
  const [activity, setActivity] = useState<CardioActivity>(DEFAULT_ACTIVITY)
  const [customMinutes, setCustomMinutes] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [motionOrigin, setMotionOrigin] = useState<DialogMotionOrigin>()

  const loadCardio = useCallback(async () => {
    if (!user?.id) {
      setSessions([])
      setTotalMinutes(0)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const response = await apiFetch(`/api/cardio?date=${activeDate}`, {
        cache: "no-store",
      })
      if (!response.ok) return
      const data = (await response.json()) as CardioResponse
      setSessions(Array.isArray(data.sessions) ? data.sessions : [])
      setTotalMinutes(Number.isFinite(data.totalMinutes) ? data.totalMinutes : 0)
      const nextGoal = Number.isFinite(data.goalMinutes) ? data.goalMinutes : DEFAULT_GOAL_MIN
      setGoalMinutes(nextGoal)
      setGoalInput(formatMinutes(nextGoal))
    } finally {
      setLoading(false)
    }
  }, [activeDate, user?.id])

  useEffect(() => {
    void loadCardio()
  }, [loadCardio])

  // Google Health pulls land outside this component; refresh on the same signal
  // the hub uses so an auto-synced ride shows up without a reload.
  useEffect(() => {
    function onLogSaved() {
      void loadCardio()
    }
    window.addEventListener("grid:log-saved", onLogSaved)
    return () => window.removeEventListener("grid:log-saved", onLogSaved)
  }, [loadCardio])

  const percent = Math.min(100, Math.round((totalMinutes / Math.max(goalMinutes, 1)) * 100))
  const remainingMinutes = Math.max(0, Math.round((goalMinutes - totalMinutes) * 10) / 10)
  const syncedCount = sessions.filter((session) => session.source).length
  const topActivity = useMemo(() => {
    if (sessions.length === 0) return null
    const byActivity = new Map<string, number>()
    for (const session of sessions) {
      byActivity.set(
        session.activityType,
        (byActivity.get(session.activityType) ?? 0) + session.minutes,
      )
    }
    return [...byActivity.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }, [sessions])
  const validCustom = useMemo(() => {
    const amount = Number(customMinutes)
    return Number.isFinite(amount) && amount > 0 && amount <= 600
  }, [customMinutes])
  const validGoal = useMemo(() => {
    const amount = Number(goalInput)
    return Number.isFinite(amount) && amount >= 1 && amount <= 600
  }, [goalInput])

  async function addCardio(minutes: number) {
    if (busy || !user?.id) return
    setBusy(true)
    try {
      const response = await apiFetch("/api/cardio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: activeDate, minutes, activityType: activity }),
      })
      if (response.ok) {
        setCustomMinutes("")
        await loadCardio()
        window.dispatchEvent(new CustomEvent("grid:log-saved", { detail: { category: "cardio" } }))
      }
    } finally {
      setBusy(false)
    }
  }

  async function removeSession(id: string) {
    if (busy) return
    setBusy(true)
    try {
      const response = await apiFetch(`/api/cardio?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      if (response.ok) await loadCardio()
    } finally {
      setBusy(false)
    }
  }

  function submitCustom(event: React.FormEvent) {
    event.preventDefault()
    if (!validCustom) return
    void addCardio(Number(customMinutes))
  }

  async function saveGoal(event: React.FormEvent) {
    event.preventDefault()
    if (!validGoal || goalBusy || !user?.id) return

    setGoalBusy(true)
    try {
      const response = await apiFetch("/api/cardio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalMinutes: Number(goalInput) }),
      })
      if (!response.ok) return
      const data = (await response.json()) as { goalMinutes: number }
      setGoalMinutes(data.goalMinutes)
      setGoalInput(formatMinutes(data.goalMinutes))
      setEditingGoal(false)
    } finally {
      setGoalBusy(false)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setMotionOrigin(getDialogMotionOrigin(triggerRef.current))
    setOpen(nextOpen)
    if (!nextOpen) {
      setEditingGoal(false)
      setGoalInput(formatMinutes(goalMinutes))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <button
            ref={triggerRef}
            type="button"
            aria-label={`Open cardio tracker, ${formatMinutes(totalMinutes)} of ${formatMinutes(goalMinutes)} minutes`}
            className="group relative flex min-h-[5.5rem] w-full items-center gap-1.5 overflow-hidden rounded-2xl border border-amber-200/[0.10] bg-amber-950/[0.09] px-2 text-left touch-manipulation transition-[border-color,background-color,transform] duration-300 hover:border-amber-200/20 hover:bg-amber-900/[0.13] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40 sm:min-h-[5.75rem] sm:gap-1.5 sm:px-3"
          />
        }
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-35"
          aria-hidden
          style={{
            backgroundImage:
              "linear-gradient(to right, rgb(254 240 138 / 6%) 1px, transparent 1px), linear-gradient(to bottom, rgb(254 240 138 / 5%) 1px, transparent 1px)",
            backgroundSize: "18px 18px",
            maskImage: "linear-gradient(90deg, black, transparent 82%)",
          }}
        />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-28 bg-[radial-gradient(circle_at_40%_50%,rgba(250,204,21,0.13),transparent_68%)]" />

        <div className="relative flex h-[4rem] w-[2.35rem] shrink-0 items-center justify-center overflow-visible sm:w-[2.8rem]">
          <div className="scale-[0.45] sm:scale-[0.54]">
            <LightningBolt minutes={totalMinutes} goal={goalMinutes} compact />
          </div>
        </div>

        <div className="relative min-w-0 flex-1 py-2">
          <div className="flex items-center justify-between gap-1">
            <div className="flex min-w-0 items-center gap-1">
              <Zap className="h-3.5 w-3.5 shrink-0 text-amber-300/75" aria-hidden />
              <p className="type-hud-label truncate tracking-[0.09em] text-amber-100/75">Cardio</p>
            </div>
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-200/15 bg-amber-400/[0.07] text-amber-200/80 transition-[background-color,color,transform] duration-300 group-hover:scale-105 group-hover:bg-amber-400/[0.12] group-hover:text-amber-100 sm:h-6 sm:w-6">
              <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden />
            </div>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="shrink-0 text-lg font-bold tabular-nums tracking-tight text-foreground sm:text-xl">
              {loading ? "—" : formatMinutes(totalMinutes)}
            </span>
            <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground/65">
              / {formatMinutes(goalMinutes)} min
            </span>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground/45">
            {loading
              ? "Syncing"
              : totalMinutes >= goalMinutes
                ? "Charged"
                : totalMinutes > 0 && topActivity
                  ? `${cardioActivityLabel(topActivity)} · ${formatMinutes(remainingMinutes)}m left`
                  : `${formatMinutes(remainingMinutes)}m left`}
          </p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 shadow-[0_0_10px_rgba(250,204,21,0.52)] transition-[width] duration-700 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        motionOrigin={motionOrigin}
        className="cardio-tracker-dialog min-h-0 overflow-hidden p-0 sm:max-w-[31rem]"
      >
        <DialogClose
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-2 top-2 z-20"
              aria-label="Close cardio tracker"
            />
          }
        >
          <X className="h-4 w-4" />
        </DialogClose>
        <DialogHeader
          data-dialog-motion-part="header"
          className="relative z-10 px-5 pt-5 text-left"
        >
          <div className="flex items-center gap-2 text-amber-200/80">
            <Zap className="h-4 w-4" aria-hidden />
            <span className="type-hud-label text-amber-100/70">Conditioning</span>
          </div>
          <DialogTitle className="font-heading text-2xl font-semibold tracking-tight">
            Cardio tracker
          </DialogTitle>
          <DialogDescription>
            {formatDisplayDate(parseLocalDate(activeDate))} ·{" "}
            {syncedCount > 0
              ? `${syncedCount} session${syncedCount === 1 ? "" : "s"} auto-synced`
              : "Auto-syncs from Google Health"}
          </DialogDescription>
        </DialogHeader>

        <div className="relative z-10 grid gap-5 px-5 pb-5 sm:grid-cols-[0.9fr_1.1fr] sm:items-center">
          <div
            data-dialog-motion-part="primary"
            className="relative flex min-h-[17rem] items-center justify-center overflow-hidden rounded-[1.75rem] border border-amber-200/[0.10] bg-amber-950/20"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(250,204,21,0.14),transparent_54%)]" />
            <LightningBolt minutes={totalMinutes} goal={goalMinutes} animateFill />
          </div>

          <div className="space-y-4">
            <div data-dialog-motion-part="content">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="type-hud-micro text-amber-100/55">Today</p>
                  <p
                    key={`${totalMinutes}-${goalMinutes}`}
                    className="cardio-value-change mt-1 text-4xl font-bold tabular-nums tracking-tight text-foreground"
                    aria-live="polite"
                  >
                    {formatMinutes(totalMinutes)}
                    <span className="ml-1 text-sm font-medium text-muted-foreground">min</span>
                  </p>
                </div>
                <p className="pb-1 text-right text-xs tabular-nums text-muted-foreground">
                  {totalMinutes >= goalMinutes
                    ? "Fully charged"
                    : `${formatMinutes(remainingMinutes)} min left`}
                </p>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="cardio-dialog-progress h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 shadow-[0_0_12px_rgba(250,204,21,0.55)] transition-[width] duration-700 ease-out"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {editingGoal ? (
                <form
                  onSubmit={saveGoal}
                  className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200/[0.10] bg-amber-400/[0.04] p-2"
                >
                  <label className="min-w-0 flex-1">
                    <span className="type-hud-micro block text-amber-100/50">Daily goal</span>
                    <span className="relative mt-1 block">
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="600"
                        step="1"
                        value={goalInput}
                        onChange={(event) => setGoalInput(event.target.value)}
                        autoFocus
                        className="h-9 w-full rounded-lg border border-white/[0.09] bg-black/15 px-3 pr-11 text-sm font-semibold tabular-nums outline-none focus:border-amber-300/35"
                        aria-label="Daily cardio goal in minutes"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                        MIN
                      </span>
                    </span>
                  </label>
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!validGoal || goalBusy}
                    className="mt-4 h-9 w-9 shrink-0 rounded-lg bg-amber-400 text-amber-950 hover:bg-amber-300"
                    aria-label="Save daily cardio goal"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingGoal(true)}
                  disabled={!user}
                  className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-left transition-colors hover:border-amber-200/[0.14] hover:bg-amber-400/[0.04] disabled:opacity-50"
                >
                  <span className="type-hud-micro text-muted-foreground/60">Daily goal</span>
                  <span className="flex items-center gap-2 text-xs font-semibold tabular-nums text-amber-100/80">
                    {formatMinutes(goalMinutes)} min
                    <Pencil className="h-3 w-3 text-amber-200/50" aria-hidden />
                  </span>
                </button>
              )}
            </div>

            <div data-dialog-motion-part="controls" className="space-y-2">
              <div
                role="radiogroup"
                aria-label="Cardio activity"
                className="grid grid-cols-4 gap-1.5"
              >
                {CARDIO_ACTIVITIES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={activity === option}
                    onClick={() => setActivity(option)}
                    className={cn(
                      "rounded-lg border px-1 py-1.5 text-[10px] font-medium leading-tight transition-colors",
                      activity === option
                        ? "border-amber-300/30 bg-amber-400/[0.12] text-amber-50"
                        : "border-white/[0.07] bg-white/[0.02] text-muted-foreground hover:bg-amber-400/[0.06]",
                    )}
                  >
                    {CARDIO_ACTIVITY_LABELS[option]}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {QUICK_MINUTES.map((amount) => (
                  <Button
                    key={amount}
                    type="button"
                    variant="outline"
                    disabled={busy || !user}
                    onClick={() => void addCardio(amount)}
                    className="h-12 rounded-xl border-amber-200/[0.12] bg-amber-400/[0.04] text-amber-50 transition-[background-color,border-color,scale] active:scale-[0.96] hover:bg-amber-400/[0.10]"
                  >
                    <span className="flex flex-col items-center leading-none">
                      <span className="font-semibold">+{amount} min</span>
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <form
              data-dialog-motion-part="actions"
              onSubmit={submitCustom}
              className="flex gap-2"
            >
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Custom cardio duration in minutes</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="600"
                  step="1"
                  value={customMinutes}
                  onChange={(event) => setCustomMinutes(event.target.value)}
                  placeholder="Custom min"
                  className="h-11 w-full rounded-xl border border-white/[0.09] bg-black/15 px-3 pr-11 text-sm tabular-nums outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-amber-300/35"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                  MIN
                </span>
              </label>
              <Button
                type="submit"
                size="icon"
                disabled={!validCustom || busy || !user}
                className="h-11 w-11 shrink-0 rounded-xl bg-amber-400 text-amber-950 hover:bg-amber-300"
                aria-label="Log custom cardio duration"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>

        <div className="relative z-10 max-h-40 overflow-y-auto border-t border-white/[0.06] px-5 py-3">
          {sessions.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground/55">
              No cardio yet — rides and runs land here automatically once Google Health syncs.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="flex items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5"
                >
                  <Zap className="h-3.5 w-3.5 shrink-0 text-amber-300/60" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground/85">
                    {session.displayName || cardioActivityLabel(session.activityType)}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/55">
                    {formatSessionTime(session.startTime)}
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-amber-100/85">
                    {formatMinutes(session.minutes)}m
                  </span>
                  {session.source ? (
                    <span className="type-hud-micro shrink-0 text-amber-200/40">Synced</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeSession(session.id)}
                      aria-label="Delete cardio session"
                      className="shrink-0 rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-red-300 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
