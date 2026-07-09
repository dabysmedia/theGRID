"use client"

import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, ChevronRight, Minus, TrendingDown, TrendingUp } from "lucide-react"
import { apiFetch } from "@/lib/api-fetch"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { DEFAULT_WEIGHT_UNIT } from "@/lib/units"
import { useActiveDate } from "@/context/DateContext"
import { useUser } from "@/context/UserContext"
import { isVacationBlockingCalendarDay } from "@/lib/vacation-mode"
import { format } from "date-fns"
import { parseLocalDate } from "@/lib/utils"

type Status = "loading" | "ready"

function sameNumber(a: string, b: number | null): boolean {
  if (b == null) return false
  const n = parseFloat(a)
  return !Number.isNaN(n) && Math.abs(n - b) < 1e-6
}

interface WeighInPayload {
  todayEntry?: { value: number } | null
  latestEntry?: { value: number } | null
  previousEntry?: { value: number } | null
  unit?: string
}

function applyPayload(
  data: WeighInPayload,
  setters: {
    setValue: (v: string) => void
    setUnit: (u: string) => void
    setDayWeight: (n: number | null) => void
    setLatestWeight: (n: number | null) => void
    setPreviousWeight: (n: number | null) => void
  }
) {
  const dayVal = data.todayEntry?.value ?? null
  const latestVal = data.latestEntry?.value ?? null
  const prevVal = data.previousEntry?.value ?? null
  setters.setDayWeight(dayVal)
  setters.setLatestWeight(latestVal)
  setters.setPreviousWeight(prevVal)
  setters.setUnit(typeof data.unit === "string" ? data.unit : DEFAULT_WEIGHT_UNIT)

  if (dayVal != null) {
    setters.setValue(String(dayVal))
  } else if (latestVal != null) {
    setters.setValue(String(latestVal))
  } else {
    setters.setValue("")
  }
}

interface WeightTrendSummary {
  baselineTrend: "losing" | "maintaining" | "gaining"
  vsBaselineLb: number
}

interface DailyWeighInProps {
  embedded?: boolean
  /** Baseline weight trend from the hub dashboard (shown under the large weight). */
  weightTrend?: WeightTrendSummary | null
}

export function DailyWeighIn({ embedded = false, weightTrend = null }: DailyWeighInProps) {
  const { activeDate } = useActiveDate()
  const { user } = useUser()
  const [status, setStatus] = useState<Status>("loading")
  const [value, setValue] = useState("")
  const [dayWeight, setDayWeight] = useState<number | null>(null)
  const [latestWeight, setLatestWeight] = useState<number | null>(null)
  const [previousWeight, setPreviousWeight] = useState<number | null>(null)
  const [unit, setUnit] = useState(DEFAULT_WEIGHT_UNIT)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const vacationBlocksLog = useMemo(
    () => isVacationBlockingCalendarDay(user?.vacationResumeDate, activeDate),
    [user?.vacationResumeDate, activeDate]
  )

  const vacationResumeLabel =
    user?.vacationResumeDate != null && user.vacationResumeDate !== ""
      ? format(parseLocalDate(user.vacationResumeDate), "MMM d, yyyy")
      : null

  const load = useCallback(async () => {
    setStatus("loading")
    const res = await apiFetch(`/api/weigh-in?d=${activeDate}`)
    const data = await res.json()
    if (!res.ok) {
      setStatus("ready")
      return
    }
    applyPayload(data, {
      setValue,
      setUnit,
      setDayWeight,
      setLatestWeight,
      setPreviousWeight,
    })
    setStatus("ready")
  }, [activeDate])

  useEffect(() => {
    if (vacationBlocksLog) {
      setDayWeight(null)
      setLatestWeight(null)
      setPreviousWeight(null)
      setValue("")
      setStatus("ready")
      return
    }
    load().catch(() => setStatus("ready"))
  }, [load, vacationBlocksLog])

  useEffect(() => {
    if (status === "ready" && dayWeight == null) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [status, dayWeight])

  const logged = dayWeight != null
  const greyedHint =
    !logged &&
    latestWeight != null &&
    sameNumber(value, latestWeight)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (logged) return
    if (vacationBlocksLog || !value.trim() || submitting) return
    setSubmitting(true)

    try {
      const res = await apiFetch("/api/weigh-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value, date: activeDate }),
      })

      if (res.ok) {
        const ref = await apiFetch(`/api/weigh-in?d=${activeDate}`)
        const data = await ref.json()
        if (ref.ok) {
          applyPayload(data, {
            setValue,
            setUnit,
            setDayWeight,
            setLatestWeight,
            setPreviousWeight,
          })
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (status === "loading") return null

  if (vacationBlocksLog && vacationResumeLabel) {
    const vacationBody = (
      <div className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Weigh-in
        </p>
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-[11px] leading-relaxed text-amber-100/90">
          Vacation until{" "}
          <span className="font-semibold tabular-nums">{vacationResumeLabel}</span>. Weight is hidden
          and logging is paused.
        </p>
        <Link
          href="/more"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "inline-flex w-fit gap-1 text-muted-foreground hover:text-foreground"
          )}
        >
          Settings
          <ChevronRight className="size-3.5 opacity-60" />
        </Link>
      </div>
    )
    if (embedded) {
      return (
        <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">{vacationBody}</div>
      )
    }
    return (
      <div className="glass-panel p-4 animate-in fade-in slide-in-from-top-2 duration-300">
        {vacationBody}
      </div>
    )
  }

  const delta =
    logged && previousWeight != null && dayWeight != null
      ? Math.round((dayWeight - previousWeight) * 10) / 10
      : null

  const trend = weightTrend?.baselineTrend ?? null
  const trendDelta = weightTrend?.vsBaselineLb ?? 0
  const trendIcon =
    trend === "losing" ? (
      <TrendingDown className="h-3.5 w-3.5 shrink-0" style={{ color: "#22c55e" }} aria-hidden />
    ) : trend === "gaining" ? (
      <TrendingUp className="h-3.5 w-3.5 shrink-0" style={{ color: "#ef4444" }} aria-hidden />
    ) : trend === "maintaining" ? (
      <Minus className="h-3.5 w-3.5 shrink-0" style={{ color: "#64748b" }} aria-hidden />
    ) : null
  const trendLabel =
    trend === "losing" ? "Losing" : trend === "gaining" ? "Gaining" : trend === "maintaining" ? "Maintaining" : null
  const trendValue =
    trendLabel != null
      ? `${trendLabel} ${trendDelta > 0 ? `+${trendDelta}` : trendDelta} lb`
      : null

  const formInner = (
    <div className="space-y-3.5">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/85">
            {logged ? "Logged weight" : "Weigh-in"}
          </p>
          {logged && previousWeight != null ? (
            <p className="text-[11px] text-muted-foreground/65">
              Last recorded{" "}
              <span className="tabular-nums text-foreground/75">
                {previousWeight} {unit}
              </span>
            </p>
          ) : null}
          {!logged && latestWeight != null ? (
            <p className="text-[11px] text-muted-foreground/70">
              Last <span className="tabular-nums text-foreground/80">{latestWeight}</span> {unit}
            </p>
          ) : null}
        </div>
        {trendIcon && trendValue ? (
          <p className="flex shrink-0 items-center gap-1 px-1 py-0.5 text-[11px] font-medium tabular-nums text-foreground/80">
            {trendIcon}
            <span>{trendValue}</span>
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1 border-b border-white/10 pb-1.5">
          <Input
            ref={inputRef}
            type="number"
            step="0.1"
            placeholder={latestWeight != null ? `${latestWeight}` : "—"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            readOnly={logged}
            className={cn(
              "h-auto min-h-0 w-[min(100%,12rem)] flex-1 border-0 rounded-none bg-transparent px-0 py-0 text-4xl font-extralight tracking-tight tabular-nums shadow-none backdrop-blur-none sm:text-5xl",
              "placeholder:text-muted-foreground/35 focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-transparent",
              "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
              greyedHint && "text-muted-foreground/90 placeholder:text-muted-foreground/40",
              logged && "cursor-default text-foreground/90",
            )}
            required={!logged}
          />
          <span className="pb-1.5 text-sm font-medium tracking-wide text-muted-foreground/55">
            {unit}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {logged && delta != null && delta !== 0 ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {delta > 0 ? (
              <ArrowUp className="h-3 w-3 shrink-0 text-red-400/90" />
            ) : (
              <ArrowDown className="h-3 w-3 shrink-0 text-[#22c55e]" />
            )}
            <span className="tabular-nums">{Math.abs(delta)}</span> {unit} vs last
          </p>
        ) : (
          <span className="hidden sm:block" />
        )}
        {logged ? (
          <Link
            href="/weight"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "inline-flex w-full gap-1 text-muted-foreground hover:bg-muted/15 hover:text-foreground sm:ml-auto sm:w-auto sm:shrink-0",
            )}
          >
            Weight
            <ChevronRight className="size-3.5 opacity-60" />
          </Link>
        ) : (
          <Button
            type="submit"
            variant="glass"
            disabled={!value.trim() || submitting}
            size="sm"
            className="w-full bg-muted/20 hover:bg-muted/30 sm:ml-auto sm:w-auto sm:shrink-0"
          >
            {embedded ? "Log weight" : "Log"}
          </Button>
        )}
      </div>
    </div>
  )

  if (embedded) {
    return (
      <form
        onSubmit={handleSubmit}
        className="animate-in fade-in slide-in-from-bottom-1 duration-300"
      >
        {formInner}
      </form>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="glass-panel p-4 animate-in fade-in slide-in-from-top-2 duration-300"
    >
      {formInner}
    </form>
  )
}
