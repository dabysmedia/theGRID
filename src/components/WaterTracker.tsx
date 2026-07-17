"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, Droplets, Pencil, Plus, RotateCcw } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useActiveDate } from "@/context/DateContext"
import { useUser } from "@/context/UserContext"
import { apiFetch } from "@/lib/api-fetch"
import { cn, formatDisplayDate, parseLocalDate } from "@/lib/utils"

const DEFAULT_BOTTLE_OZ = 32
const DEFAULT_GOAL_OZ = 32
const QUICK_AMOUNTS = [8, 16, 32] as const

interface WaterEntry {
  id: string
  amountOz: number
  createdAt: string
}

interface WaterResponse {
  entries: WaterEntry[]
  totalOz: number
  bottleOz: number
  goalOz: number
}

function formatOunces(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function LiquidBottle({
  ounces,
  capacity,
  compact = false,
}: {
  ounces: number
  capacity: number
  compact?: boolean
}) {
  const percent = Math.min(100, Math.max(0, (ounces / Math.max(capacity, 1)) * 100))

  return (
    <div
      className={cn("water-bottle-scene", compact && "water-bottle-scene--compact")}
      aria-hidden
    >
      <div className="water-bottle-shadow" />
      <div className="water-bottle-cap" />
      <div className="water-bottle-neck" />
      <div className="water-bottle-shell">
        <div
          className="water-bottle-liquid"
          style={{ height: `${percent}%` }}
        >
          <div className="water-bottle-surface" />
          <span className="water-bubble water-bubble--one" />
          <span className="water-bubble water-bubble--two" />
          <span className="water-bubble water-bubble--three" />
        </div>
        <div className="water-bottle-gloss" />
        <div className="water-bottle-ridge water-bottle-ridge--top" />
        <div className="water-bottle-ridge water-bottle-ridge--bottom" />
      </div>
    </div>
  )
}

export function WaterTracker() {
  const { activeDate } = useActiveDate()
  const { user } = useUser()
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<WaterEntry[]>([])
  const [totalOz, setTotalOz] = useState(0)
  const [bottleOz, setBottleOz] = useState(DEFAULT_BOTTLE_OZ)
  const [goalOz, setGoalOz] = useState(DEFAULT_GOAL_OZ)
  const [goalInput, setGoalInput] = useState(String(DEFAULT_GOAL_OZ))
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalBusy, setGoalBusy] = useState(false)
  const [customAmount, setCustomAmount] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadWater = useCallback(async () => {
    if (!user?.id) {
      setEntries([])
      setTotalOz(0)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const response = await apiFetch(`/api/water?date=${activeDate}`, {
        cache: "no-store",
      })
      if (!response.ok) return
      const data = (await response.json()) as WaterResponse
      setEntries(Array.isArray(data.entries) ? data.entries : [])
      setTotalOz(Number.isFinite(data.totalOz) ? data.totalOz : 0)
      setBottleOz(Number.isFinite(data.bottleOz) ? data.bottleOz : DEFAULT_BOTTLE_OZ)
      const nextGoal = Number.isFinite(data.goalOz) ? data.goalOz : DEFAULT_GOAL_OZ
      setGoalOz(nextGoal)
      setGoalInput(formatOunces(nextGoal))
    } finally {
      setLoading(false)
    }
  }, [activeDate, user?.id])

  useEffect(() => {
    void loadWater()
  }, [loadWater])

  const percent = Math.min(100, Math.round((totalOz / goalOz) * 100))
  const remainingOz = Math.max(0, goalOz - totalOz)
  const bottles = totalOz / bottleOz
  const validCustom = useMemo(() => {
    const amount = Number(customAmount)
    return Number.isFinite(amount) && amount > 0 && amount <= 128
  }, [customAmount])
  const validGoal = useMemo(() => {
    const amount = Number(goalInput)
    return Number.isFinite(amount) && amount >= 1 && amount <= 512
  }, [goalInput])

  async function addWater(amountOz: number) {
    if (busy || !user?.id) return
    setBusy(true)
    try {
      const response = await apiFetch("/api/water", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: activeDate, amountOz }),
      })
      if (response.ok) {
        setCustomAmount("")
        await loadWater()
        window.dispatchEvent(new CustomEvent("grid:log-saved", { detail: { category: "water" } }))
      }
    } finally {
      setBusy(false)
    }
  }

  async function undoLast() {
    const last = entries[0]
    if (!last || busy) return
    setBusy(true)
    try {
      const response = await apiFetch(`/api/water?id=${encodeURIComponent(last.id)}`, {
        method: "DELETE",
      })
      if (response.ok) await loadWater()
    } finally {
      setBusy(false)
    }
  }

  function submitCustom(event: React.FormEvent) {
    event.preventDefault()
    if (!validCustom) return
    void addWater(Number(customAmount))
  }

  async function saveGoal(event: React.FormEvent) {
    event.preventDefault()
    if (!validGoal || goalBusy || !user?.id) return

    setGoalBusy(true)
    try {
      const response = await apiFetch("/api/water", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalOz: Number(goalInput) }),
      })
      if (!response.ok) return
      const data = (await response.json()) as { goalOz: number }
      setGoalOz(data.goalOz)
      setGoalInput(formatOunces(data.goalOz))
      setEditingGoal(false)
    } finally {
      setGoalBusy(false)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setEditingGoal(false)
      setGoalInput(formatOunces(goalOz))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={`Open water tracker, ${formatOunces(totalOz)} of ${formatOunces(goalOz)} ounces`}
            className="group relative flex min-h-[4.75rem] w-full items-center overflow-hidden rounded-2xl border border-cyan-200/[0.10] bg-cyan-950/[0.09] px-3 text-left touch-manipulation transition-[border-color,background-color,transform] duration-300 hover:border-cyan-200/20 hover:bg-cyan-900/[0.13] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40 sm:min-h-[5.25rem] sm:px-4"
          />
        }
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-35"
          aria-hidden
          style={{
            backgroundImage:
              "linear-gradient(to right, rgb(165 243 252 / 6%) 1px, transparent 1px), linear-gradient(to bottom, rgb(165 243 252 / 5%) 1px, transparent 1px)",
            backgroundSize: "18px 18px",
            maskImage: "linear-gradient(90deg, black, transparent 82%)",
          }}
        />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-36 bg-[radial-gradient(circle_at_40%_50%,rgba(34,211,238,0.13),transparent_68%)]" />

        <div className="relative flex h-[4.25rem] w-[4.75rem] shrink-0 items-center justify-center overflow-visible sm:w-[5.25rem]">
          <div className="translate-y-1.5 scale-[0.68] sm:scale-[0.74]">
            <LiquidBottle ounces={totalOz} capacity={goalOz} compact />
          </div>
        </div>

        <div className="relative min-w-0 flex-1 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Droplets className="h-3.5 w-3.5 text-cyan-300/75" aria-hidden />
              <p className="type-hud-label text-cyan-100/75">Water</p>
            </div>
            <span className="type-hud-micro text-cyan-100/45">
              {loading ? "Syncing" : `${percent}% full`}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg font-bold tabular-nums tracking-tight text-foreground sm:text-xl">
              {loading ? "—" : formatOunces(totalOz)}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/65">
              / {formatOunces(goalOz)} oz
            </span>
            <span className="ml-auto truncate text-[10px] text-muted-foreground/45">
              {totalOz >= goalOz
                ? "Goal met"
                : `${formatOunces(remainingOz)} oz left`}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.52)] transition-[width] duration-700 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <div className="relative ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-200/15 bg-cyan-400/[0.07] text-cyan-200/80 transition-[background-color,color,transform] duration-300 group-hover:scale-105 group-hover:bg-cyan-400/[0.12] group-hover:text-cyan-100 sm:ml-4">
          <Plus className="h-4 w-4" aria-hidden />
        </div>
      </DialogTrigger>

      <DialogContent className="water-tracker-dialog min-h-0 overflow-hidden p-0 sm:max-w-[31rem]">
        <DialogHeader className="relative z-10 px-5 pt-5 text-left">
          <div className="flex items-center gap-2 text-cyan-200/80">
            <Droplets className="h-4 w-4" aria-hidden />
            <span className="type-hud-label text-cyan-100/70">Hydration</span>
          </div>
          <DialogTitle className="font-heading text-2xl font-semibold tracking-tight">
            Water tracker
          </DialogTitle>
          <DialogDescription>
            {formatDisplayDate(parseLocalDate(activeDate))} · {bottleOz} oz bottle
          </DialogDescription>
        </DialogHeader>

        <div className="relative z-10 grid gap-5 px-5 pb-5 sm:grid-cols-[0.9fr_1.1fr] sm:items-center">
          <div className="relative flex min-h-[17rem] items-center justify-center overflow-hidden rounded-[1.75rem] border border-cyan-200/[0.10] bg-cyan-950/20">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(34,211,238,0.14),transparent_54%)]" />
            <LiquidBottle ounces={totalOz} capacity={goalOz} />
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="type-hud-micro text-cyan-100/55">Today</p>
                  <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-foreground">
                    {formatOunces(totalOz)}
                    <span className="ml-1 text-sm font-medium text-muted-foreground">oz</span>
                  </p>
                </div>
                <p className="pb-1 text-right text-xs tabular-nums text-muted-foreground">
                  {totalOz >= goalOz
                    ? `${bottles.toFixed(bottles >= 2 ? 1 : 2)} bottles · goal met`
                    : `${formatOunces(remainingOz)} oz left`}
                </p>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.55)] transition-[width] duration-700 ease-out"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {editingGoal ? (
                <form
                  onSubmit={saveGoal}
                  className="mt-3 flex items-center gap-2 rounded-xl border border-cyan-200/[0.10] bg-cyan-400/[0.04] p-2"
                >
                  <label className="min-w-0 flex-1">
                    <span className="type-hud-micro block text-cyan-100/50">Daily goal</span>
                    <span className="relative mt-1 block">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="1"
                        max="512"
                        step="0.1"
                        value={goalInput}
                        onChange={(event) => setGoalInput(event.target.value)}
                        autoFocus
                        className="h-9 w-full rounded-lg border border-white/[0.09] bg-black/15 px-3 pr-9 text-sm font-semibold tabular-nums outline-none focus:border-cyan-300/35"
                        aria-label="Daily water goal in ounces"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                        OZ
                      </span>
                    </span>
                  </label>
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!validGoal || goalBusy}
                    className="mt-4 h-9 w-9 shrink-0 rounded-lg bg-cyan-400 text-cyan-950 hover:bg-cyan-300"
                    aria-label="Save daily water goal"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingGoal(true)}
                  disabled={!user}
                  className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-left transition-colors hover:border-cyan-200/[0.14] hover:bg-cyan-400/[0.04] disabled:opacity-50"
                >
                  <span className="type-hud-micro text-muted-foreground/60">Daily goal</span>
                  <span className="flex items-center gap-2 text-xs font-semibold tabular-nums text-cyan-100/80">
                    {formatOunces(goalOz)} oz
                    <Pencil className="h-3 w-3 text-cyan-200/50" aria-hidden />
                  </span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {QUICK_AMOUNTS.map((amount) => (
                <Button
                  key={amount}
                  type="button"
                  variant="outline"
                  disabled={busy || !user}
                  onClick={() => void addWater(amount)}
                  className={cn(
                    "h-12 rounded-xl border-cyan-200/[0.12] bg-cyan-400/[0.04] text-cyan-50 hover:bg-cyan-400/[0.10]",
                    amount === bottleOz && "border-cyan-300/25 bg-cyan-400/[0.08]",
                  )}
                >
                  <span className="flex flex-col items-center leading-none">
                    <span className="font-semibold">+{amount} oz</span>
                    {amount === bottleOz ? (
                      <span className="mt-1 text-[9px] uppercase tracking-wider text-cyan-200/55">
                        bottle
                      </span>
                    ) : null}
                  </span>
                </Button>
              ))}
            </div>

            <form onSubmit={submitCustom} className="flex gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Custom water amount in ounces</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.1"
                  max="128"
                  step="0.1"
                  value={customAmount}
                  onChange={(event) => setCustomAmount(event.target.value)}
                  placeholder="Custom oz"
                  className="h-11 w-full rounded-xl border border-white/[0.09] bg-black/15 px-3 pr-9 text-sm tabular-nums outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-cyan-300/35"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                  OZ
                </span>
              </label>
              <Button
                type="submit"
                size="icon"
                disabled={!validCustom || busy || !user}
                className="h-11 w-11 shrink-0 rounded-xl bg-cyan-400 text-cyan-950 hover:bg-cyan-300"
                aria-label="Log custom water amount"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </form>

            <Button
              type="button"
              variant="ghost"
              disabled={!entries.length || busy}
              onClick={() => void undoLast()}
              className="w-full rounded-xl text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Undo last {entries[0] ? `(+${formatOunces(entries[0].amountOz)} oz)` : "log"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
