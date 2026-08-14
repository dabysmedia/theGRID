"use client"

import { useMemo } from "react"
import { format } from "date-fns"
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts"
import { TrendingDown, TrendingUp, Minus, Weight } from "lucide-react"
import { cn, parseLocalDate } from "@/lib/utils"
import { CATEGORY_THEME } from "@/lib/category-theme"
import {
  sliceTrendRange,
  type WeightTrendInsight,
  type WeightTrendPoint,
} from "@/lib/weight-trend"

const WEIGHT_COLOR = CATEGORY_THEME.weight.color
const RAW_DOT_COLOR = "oklch(0.78 0.04 190)"

function signedLb(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

function formatLowDate(ymd: string | null): string | null {
  if (!ymd) return null
  try {
    return format(parseLocalDate(ymd), "MMM d, yyyy")
  } catch {
    return ymd
  }
}

function TrendTooltip({
  active,
  payload,
  label,
  unit,
  recordLow,
}: {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[]
  label?: string
  unit: string
  recordLow: number | null
}) {
  if (!active || !payload?.length) return null
  const average = payload.find((p) => p.dataKey === "average")?.value as number | null | undefined
  const raw = payload.find((p) => p.dataKey === "raw")?.value as number | null | undefined
  const isLow =
    raw != null && recordLow != null && Math.abs(raw - recordLow) < 0.05
  return (
    <div className="glass rounded-lg border border-border px-3 py-2 font-sans text-[10px] tabular-nums space-y-0.5 min-w-[7.5rem]">
      <div className="text-muted-foreground/70 mb-1">{label}</div>
      {average != null && (
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: WEIGHT_COLOR }} />
          <span className="font-semibold">
            {average} {unit}
            <span className="font-normal text-muted-foreground/70"> · 7-weigh-in avg</span>
          </span>
        </div>
      )}
      {raw != null && (
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: RAW_DOT_COLOR }} />
          <span className="font-semibold">
            {raw} {unit}
            {isLow ? (
              <span className="font-normal" style={{ color: WEIGHT_COLOR }}>
                {" "}
                · all-time low
              </span>
            ) : (
              <span className="font-normal text-muted-foreground/70"> · weigh-in</span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}

export function WeightTrendPanel({
  points,
  insight,
  unit = "lbs",
  rangeDays = null,
  endDate,
  embedded = false,
  showTitle = true,
  className,
  animate = false,
}: {
  points: WeightTrendPoint[]
  insight: WeightTrendInsight
  unit?: string
  /** Visible window in days; null = full series. */
  rangeDays?: number | null
  endDate?: string
  embedded?: boolean
  showTitle?: boolean
  className?: string
  /** Hub expand: wipe/fade the chart in. */
  animate?: boolean
}) {
  const lastDate = points[points.length - 1]?.date ?? ""
  const seriesEnd =
    endDate && points.some((point) => point.date <= endDate) ? endDate : lastDate
  const visible = useMemo(
    () => sliceTrendRange(points, rangeDays, seriesEnd),
    [points, rangeDays, seriesEnd],
  )

  const axisDomain = useMemo((): [number, number] => {
    const vals = visible.map((p) => p.average)
    if (insight.recordLow != null) {
      const minAvg = vals.length ? Math.min(...vals) : insight.recordLow
      if (insight.recordLow >= minAvg - 5) vals.push(insight.recordLow)
    }
    const raws = visible.map((p) => p.raw).filter((v): v is number => v != null)
    vals.push(...raws)
    if (vals.length === 0) return [0, 1]
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const span = max - min
    const pad = span > 0 ? Math.max(span * 0.12, 0.6) : 1.5
    return [min - pad, max + pad]
  }, [visible, insight.recordLow])

  const showLowLine =
    insight.recordLow != null &&
    insight.recordLow >= axisDomain[0] &&
    insight.recordLow <= axisDomain[1]

  const hasSeries = visible.some((p) => Number.isFinite(p.average))
  if (!hasSeries) return null

  const TrendIcon =
    insight.direction === "losing"
      ? TrendingDown
      : insight.direction === "gaining"
        ? TrendingUp
        : Minus
  const trendLabel =
    insight.direction === "losing"
      ? "Trending down"
      : insight.direction === "gaining"
        ? "Trending up"
        : insight.direction === "maintaining"
          ? "Holding steady"
          : "—"
  const trendClass =
    insight.direction === "losing"
      ? "text-positive"
      : insight.direction === "gaining"
        ? "text-negative"
        : "text-muted-foreground"
  const lowDate = formatLowDate(insight.recordLowDate)

  return (
    <div
      className={cn(
        animate ? "space-y-3" : "animate-fade-up space-y-3",
        embedded ? "p-0" : "glass-panel p-4 sm:p-5",
        className,
      )}
    >
      {showTitle && (
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${WEIGHT_COLOR}26` }}
          >
            <Weight className="h-4 w-4" style={{ color: WEIGHT_COLOR }} />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground/95">
              Weight trend
            </h2>
            <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/65">
              7-weigh-in average · all-time low saved on its own
            </p>
          </div>
        </div>
      )}

      <div
        className={cn(
          "chart-touch-safe h-56 w-full min-w-0 -mx-0.5 shrink-0 sm:mx-0 sm:h-64 lg:h-72",
          animate && "hub-weight-chart-reveal",
        )}
        onPointerDown={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={visible}
            margin={{ top: 10, right: 8, left: 4, bottom: 0 }}
            accessibilityLayer={false}
          >
            <defs>
              <linearGradient id="weightTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={WEIGHT_COLOR} stopOpacity={0.28} />
                <stop offset="95%" stopColor={WEIGHT_COLOR} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{
                fontSize: 9,
                fill: "oklch(0.55 0.01 250)",
                fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
              }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              type="number"
              domain={axisDomain}
              tick={{
                fontSize: 9,
                fill: WEIGHT_COLOR,
                fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
              }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v: number) => Number(v).toFixed(1)}
            />
            <Tooltip
              content={<TrendTooltip unit={unit} recordLow={insight.recordLow} />}
            />
            {showLowLine && insight.recordLow != null && (
              <ReferenceLine
                y={insight.recordLow}
                stroke={WEIGHT_COLOR}
                strokeDasharray="5 4"
                strokeOpacity={0.55}
                ifOverflow="extendDomain"
              />
            )}
            <Area
              type="monotone"
              dataKey="average"
              stroke={WEIGHT_COLOR}
              fill="url(#weightTrendFill)"
              strokeWidth={2.4}
              dot={false}
              connectNulls
              name="average"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="raw"
              stroke="none"
              dot={{ r: 2.2, fill: RAW_DOT_COLOR, strokeWidth: 0, fillOpacity: 0.7 }}
              activeDot={{ r: 4, fill: RAW_DOT_COLOR, strokeWidth: 0 }}
              connectNulls={false}
              name="raw"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border/50 bg-muted/5 px-3 py-2.5">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/75 mb-0.5">
            7-weigh-in avg
          </p>
          <p className="text-base font-bold tabular-nums" style={{ color: WEIGHT_COLOR }}>
            {insight.currentAverage != null ? insight.currentAverage : "—"}
            {insight.currentAverage != null && (
              <span className="text-[10px] font-medium text-muted-foreground ml-1">{unit}</span>
            )}
          </p>
        </div>
        <div className="rounded-xl border border-border/50 bg-muted/5 px-3 py-2.5">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/75 mb-1">
            Average trend
          </p>
          <div className="flex items-center gap-1.5">
            <TrendIcon className={cn("h-4 w-4 shrink-0", trendClass)} aria-hidden />
            <div className="min-w-0">
              <p className={cn("text-sm font-bold leading-tight", trendClass)}>{trendLabel}</p>
              {insight.vsPreviousLb != null && (
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  {signedLb(insight.vsPreviousLb)} {unit} vs last week
                </p>
              )}
            </div>
          </div>
        </div>
        <div
          className={cn(
            "col-span-2 sm:col-span-1 rounded-xl border px-3 py-2.5",
            insight.recordLowIsLatest
              ? "border-teal-400/35 bg-teal-400/[0.08] hub-weight-atl-pulse"
              : "border-border/50 bg-muted/5",
          )}
        >
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/75 mb-0.5">
            {insight.recordLowIsLatest ? "New all-time low" : "All-time low"}
          </p>
          <p className="text-base font-bold tabular-nums" style={{ color: WEIGHT_COLOR }}>
            {insight.recordLow != null ? insight.recordLow : "—"}
            {insight.recordLow != null && (
              <span className="text-[10px] font-medium text-muted-foreground ml-1">{unit}</span>
            )}
          </p>
          {lowDate && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{lowDate}</p>
          )}
        </div>
      </div>
    </div>
  )
}
