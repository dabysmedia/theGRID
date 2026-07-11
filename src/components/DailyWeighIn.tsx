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
import { useCountUp } from "@/components/useCountUp"

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
  recentValues?: number[]
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
    setRecentValues: (v: number[]) => void
  }
) {
  const dayVal = data.todayEntry?.value ?? null
  const latestVal = data.latestEntry?.value ?? null
  const prevVal = data.previousEntry?.value ?? null
  setters.setDayWeight(dayVal)
  setters.setLatestWeight(latestVal)
  setters.setPreviousWeight(prevVal)
  setters.setRecentValues(
    Array.isArray(data.recentValues)
      ? data.recentValues.filter((n) => typeof n === "number" && Number.isFinite(n))
      : [],
  )
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
  /** Oldest→newest recent weigh-in values (up to 7 logs). */
  last7?: (number | null)[]
}

const SPARK_W = 88
const SPARK_H = 24

function weightWeekSpark(
  values: (number | null)[] | undefined,
): { line: string; area: string; lastX: number; lastY: number; dots: { x: number; y: number }[] } | null {
  if (!values?.length) return null
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (nums.length < 2) return null

  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const range = max - min
  // Give flat / near-flat weeks a little vertical room so the line still reads.
  const padY = 3.5
  const visualRange = Math.max(range, 0.8)
  const mid = (min + max) / 2
  const yMin = mid - visualRange / 2
  const n = nums.length

  const yFor = (v: number) =>
    SPARK_H - padY - ((v - yMin) / visualRange) * (SPARK_H - padY * 2)

  const dots = nums.map((v, i) => ({
    x: n === 1 ? SPARK_W / 2 : (i / (n - 1)) * SPARK_W,
    y: yFor(v),
  }))

  const line = dots
    .map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ")

  const last = dots[dots.length - 1]!
  const first = dots[0]!
  const area = `${line} L${last.x.toFixed(1)},${SPARK_H} L${first.x.toFixed(1)},${SPARK_H} Z`

  return { line, area, lastX: last.x, lastY: last.y, dots }
}

interface DailyWeighInProps {
  embedded?: boolean
  /** Baseline weight trend from the hub dashboard (shown under the large weight). */
  weightTrend?: WeightTrendSummary | null
  /** Hub: tap the weigh-in header row to expand correlations (does not fire on form controls). */
  onActivate?: () => void
  /** Hub shared-element state: widen and fade the sparkline into the correlation graph bay. */
  graphFocused?: boolean
}

export function DailyWeighIn({
  embedded = false,
  weightTrend = null,
  onActivate,
  graphFocused = false,
}: DailyWeighInProps) {
  const { activeDate } = useActiveDate()
  const { user } = useUser()
  const [status, setStatus] = useState<Status>("loading")
  const [value, setValue] = useState("")
  const [dayWeight, setDayWeight] = useState<number | null>(null)
  const [latestWeight, setLatestWeight] = useState<number | null>(null)
  const [previousWeight, setPreviousWeight] = useState<number | null>(null)
  const [recentValues, setRecentValues] = useState<number[]>([])
  const [unit, setUnit] = useState(DEFAULT_WEIGHT_UNIT)
  const [submitting, setSubmitting] = useState(false)
  const [weightEditing, setWeightEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const vacationBlocksLog = useMemo(
    () => isVacationBlockingCalendarDay(user?.vacationResumeDate, activeDate),
    [user?.vacationResumeDate, activeDate]
  )

  const vacationResumeLabel =
    user?.vacationResumeDate != null && user.vacationResumeDate !== ""
      ? format(parseLocalDate(user.vacationResumeDate), "MMM d, yyyy")
      : null

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setStatus("loading")
    setWeightEditing(false)
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
      setRecentValues,
    })
    setStatus("ready")
  }, [activeDate])

  useEffect(() => {
    if (vacationBlocksLog) {
      setDayWeight(null)
      setLatestWeight(null)
      setPreviousWeight(null)
      setRecentValues([])
      setValue("")
      setStatus("ready")
      return
    }
    load().catch(() => setStatus("ready"))
  }, [load, vacationBlocksLog])

  useEffect(() => {
    if (vacationBlocksLog) return
    const refresh = () => {
      load(false).catch(() => setStatus("ready"))
    }
    window.addEventListener("grid:log-saved", refresh)
    return () => window.removeEventListener("grid:log-saved", refresh)
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
  const numericWeight = value.trim() === "" ? null : Number(value)
  const animatedWeight = useCountUp(
    numericWeight != null && Number.isFinite(numericWeight) ? numericWeight : null,
    { durationMs: 1150, enabled: !weightEditing && !submitting },
  )
  const displayedWeight =
    !weightEditing && animatedWeight != null
      ? animatedWeight.toFixed(value.includes(".") ? 1 : 0)
      : value

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
            setRecentValues,
          })
        }
        window.dispatchEvent(new CustomEvent("grid:log-saved"))
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
  const sparkSeries =
    recentValues.length >= 2
      ? recentValues
      : weightTrend?.last7?.filter((v): v is number => v != null) ?? []
  const spark = weightWeekSpark(sparkSeries)
  const sparkColor =
    trend === "losing"
      ? "#22c55e"
      : trend === "gaining"
        ? "#ef4444"
        : "#14b8a6"
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

  const titleClass = embedded
    ? "type-hud-subsection"
    : "text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/85"
  const titleText = logged ? "Logged weight" : "Weigh-in"
  const lastHint =
    logged && previousWeight != null ? (
      <p className="text-[11px] text-muted-foreground/65">
        Last recorded{" "}
        <span className="tabular-nums text-foreground/75">
          {previousWeight} {unit}
        </span>
      </p>
    ) : !logged && latestWeight != null ? (
      <p className="type-hud-caption">
        Last <span className="tabular-nums text-foreground/75">{latestWeight}</span> {unit}
      </p>
    ) : null
  const trendChip =
    trendIcon && trendValue ? (
      <p
        className={cn(
          "flex shrink-0 items-center gap-1 px-1 py-0.5 tabular-nums text-foreground/75",
          embedded ? "type-hud-micro normal-case tracking-normal" : "text-[11px] font-medium",
        )}
      >
        {trendIcon}
        <span>{trendValue}</span>
      </p>
    ) : null

  const weekSparkline = spark ? (
    <span
      className={cn(
        "relative mx-1 block min-w-[4.5rem] flex-1 origin-center overflow-visible motion-reduce:transition-none",
        graphFocused
          ? "h-10 max-w-none scale-x-110 opacity-0"
          : "h-6 w-[5.5rem] max-w-[6.5rem] scale-x-100 opacity-100",
      )}
      style={{
        transitionProperty: "width, max-width, height, opacity, transform",
        transitionDuration: "720ms",
        transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <svg
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        className="h-full w-full overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id="weighSparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={sparkColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={sparkColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={spark.area} fill="url(#weighSparkFill)" stroke="none" />
        <path
          d={spark.line}
          fill="none"
          stroke={sparkColor}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {spark.dots.slice(0, -1).map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r="1.15"
            fill={sparkColor}
            opacity={0.55}
          />
        ))}
        <circle
          cx={spark.lastX}
          cy={spark.lastY}
          r="2.35"
          fill={sparkColor}
          stroke="oklch(0.16 0.01 250)"
          strokeWidth="1.15"
        />
      </svg>
    </span>
  ) : null

  const formInner = (
    <div className={cn(embedded ? "space-y-1.5" : "space-y-3.5")}>
      {onActivate ? (
        <button
          type="button"
          onClick={onActivate}
          aria-label="Expand weight correlations"
          className="group -mx-0.5 flex min-h-11 w-[calc(100%+0.25rem)] touch-manipulation items-center justify-between gap-2 rounded-sm px-0.5 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/25"
        >
          <div className="min-w-0 shrink-0 space-y-0.5">
            <p className={cn(titleClass, "transition-colors group-hover:text-foreground/90")}>
              {titleText}
            </p>
            {lastHint}
          </div>
          {weekSparkline}
          <div className="flex shrink-0 items-center gap-1.5">
            {trendChip}
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground/55 transition-colors group-hover:text-foreground/80"
              aria-hidden
            />
          </div>
        </button>
      ) : (
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 shrink-0 space-y-0.5">
            <p className={titleClass}>{titleText}</p>
            {lastHint}
          </div>
          {weekSparkline}
          {trendChip}
        </div>
      )}

      <div className="space-y-2">
        <div
          className={cn(
            "flex flex-wrap items-end gap-x-3 gap-y-1",
            "pb-1.5",
            embedded ? "border-b border-white/[0.06]" : "border-b border-white/10",
          )}
        >
          <Input
            ref={inputRef}
            type="number"
            step="0.1"
            placeholder={latestWeight != null ? `${latestWeight}` : "—"}
            value={displayedWeight}
            onChange={(e) => {
              setWeightEditing(true)
              setValue(e.target.value)
            }}
            readOnly={logged}
            className={cn(
              "h-auto min-h-0 w-[min(100%,12rem)] flex-1 border-0 rounded-none bg-transparent px-0 py-0 font-extralight tracking-tight tabular-nums shadow-none backdrop-blur-none",
              embedded ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl",
              "placeholder:text-muted-foreground/35 focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-transparent",
              "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
              greyedHint && "text-muted-foreground/90 placeholder:text-muted-foreground/40",
              logged && "cursor-default text-foreground/90",
            )}
            required={!logged}
          />
          <span
            className={cn(
              "pb-1.5 tracking-wide",
              embedded ? "type-hud-unit" : "text-sm font-medium text-muted-foreground/55",
            )}
          >
            {unit}
          </span>
        </div>
      </div>

      <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-4", embedded ? "gap-1" : "gap-2")}>
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
        {logged ? null : (
          <Button
            type="submit"
            variant={embedded ? "ghost" : "glass"}
            disabled={!value.trim() || submitting}
            size="sm"
            className={cn(
              "w-full sm:ml-auto sm:w-auto sm:shrink-0",
              embedded
                ? "h-8 border border-white/10 bg-white/[0.03] px-3 type-hud-micro text-muted-foreground/85 hover:border-teal-400/25 hover:bg-teal-400/[0.06] hover:text-teal-100/90"
                : "bg-muted/20 hover:bg-muted/30",
            )}
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
