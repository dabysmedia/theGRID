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
import { addDaysToYmd } from "@/lib/steps-day"
import {
  sliceTrendRange,
  type WeightTrendInsight,
  type WeightTrendPoint,
} from "@/lib/weight-trend"
import { daysBetweenYmd, type ProjectionPoint } from "@/lib/weight-projection"

const WEIGHT_COLOR = CATEGORY_THEME.weight.color
const RAW_DOT_COLOR = "oklch(0.82 0.03 190)"
const GOAL_COLOR = "oklch(0.84 0.15 92)"
const AXIS_FONT = "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"

type ChartRow = {
  date: string
  label: string
  raw: number | null
  average: number | null
  projected?: number | null
}

function signedLb(n: number): string {
  const rounded = Math.round(n * 10) / 10
  if (rounded > 0) return `+${rounded}`
  return `${rounded}`
}

function formatLowDate(ymd: string | null): string | null {
  if (!ymd) return null
  try {
    return format(parseLocalDate(ymd), "MMM d, yyyy")
  } catch {
    return ymd
  }
}

function formatAxisDate(ymd: string, withYear: boolean): string {
  try {
    return format(parseLocalDate(ymd), withYear ? "MMM d ''yy" : "MMM d")
  } catch {
    return ymd
  }
}

function formatTipDate(ymd: string | undefined): string {
  if (!ymd) return ""
  try {
    return format(parseLocalDate(ymd), "EEE, MMM d")
  } catch {
    return ymd
  }
}

/**
 * How many future days to draw. Kept to about a third of the history so the
 * dashed tail reads as a continuation, not the whole chart.
 */
function futureDayBudget(historyDays: number): number {
  return Math.max(4, Math.min(84, Math.round(historyDays * 0.32)))
}

/** Weekly anchors expanded to one point per day so the x-axis stays in real time. */
function projectDaily(
  anchors: ProjectionPoint[],
  maxDays: number,
): { date: string; projected: number }[] {
  if (anchors.length === 0 || maxDays <= 0) return []
  const start = anchors[0]!
  const last = anchors[anchors.length - 1]!
  const rows: { date: string; projected: number }[] = []
  let cursor = 0
  for (let offset = 0; offset <= maxDays; offset++) {
    const date = addDaysToYmd(start.date, offset)
    if (date > last.date) break
    while (cursor + 1 < anchors.length && anchors[cursor + 1]!.date < date) cursor += 1
    const a = anchors[cursor]!
    const b = anchors[cursor + 1]
    let projected = a.projected
    if (b && b.date > a.date) {
      const span = daysBetweenYmd(a.date, b.date)
      const t = span === 0 ? 0 : daysBetweenYmd(a.date, date) / span
      const clamped = Math.min(1, Math.max(0, t))
      projected = a.projected + (b.projected - a.projected) * clamped
    }
    rows.push({ date, projected: Math.round(projected * 10) / 10 })
  }
  return rows
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
  const projected = payload.find((p) => p.dataKey === "projected")?.value as
    | number
    | null
    | undefined
  const isLow = raw != null && recordLow != null && Math.abs(raw - recordLow) < 0.05
  return (
    <div className="glass rounded-xl border border-border px-3 py-2.5 font-sans text-[12px] tabular-nums space-y-1 min-w-[9rem]">
      <div className="text-[11px] text-muted-foreground/80 mb-1">{formatTipDate(label)}</div>
      {average == null && projected != null && (
        <div className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: WEIGHT_COLOR, opacity: 0.55 }}
          />
          <span className="font-semibold">
            {projected} {unit}
            <span className="font-normal text-muted-foreground/70"> · projected</span>
          </span>
        </div>
      )}
      {average != null && (
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: WEIGHT_COLOR }} />
          <span className="font-semibold">
            {average} {unit}
            <span className="font-normal text-muted-foreground/70"> · trend</span>
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

function LegendSwatch({
  kind,
  label,
}: {
  kind: "line" | "dot" | "dashed" | "goal" | "low"
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/75">
      {kind === "line" && (
        <span className="h-[2.5px] w-3.5 rounded-full" style={{ background: WEIGHT_COLOR }} />
      )}
      {kind === "dot" && (
        <span className="size-1.5 rounded-full" style={{ background: RAW_DOT_COLOR }} />
      )}
      {kind === "dashed" && (
        <span
          className="h-0 w-3.5 border-t-[1.5px] border-dashed"
          style={{ borderColor: WEIGHT_COLOR }}
        />
      )}
      {kind === "goal" && (
        <span className="h-0 w-3.5 border-t border-dashed" style={{ borderColor: GOAL_COLOR }} />
      )}
      {kind === "low" && (
        <span
          className="h-0 w-3.5 border-t border-dashed"
          style={{ borderColor: WEIGHT_COLOR, opacity: 0.7 }}
        />
      )}
      {label}
    </span>
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
  projection = null,
  goalTarget = null,
  showSummary = true,
  size = "compact",
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
  /** Forward trajectory drawn as a dashed continuation; null hides it. */
  projection?: ProjectionPoint[] | null
  /** Goal weight drawn as a horizontal marker when it falls inside the scale. */
  goalTarget?: number | null
  /** The three tiles under the chart — off when the caller shows its own. */
  showSummary?: boolean
  /** Hub expand wants a chart you can actually read. Stats stays shorter. */
  size?: "compact" | "hero"
}) {
  const lastDate = points[points.length - 1]?.date ?? ""
  const seriesEnd =
    endDate && points.some((point) => point.date <= endDate) ? endDate : lastDate
  const visible = useMemo(
    () => sliceTrendRange(points, rangeDays, seriesEnd),
    [points, rangeDays, seriesEnd],
  )

  const chartData = useMemo((): ChartRow[] => {
    const rows: ChartRow[] = visible.map((p) => ({
      date: p.date,
      label: p.label,
      raw: p.raw,
      average: p.average,
      projected: null,
    }))
    if (!projection || projection.length === 0 || rows.length === 0) return rows

    const histVals = visible.flatMap((p) =>
      p.raw != null ? [p.average, p.raw] : [p.average],
    )
    const histMin = Math.min(...histVals)
    const histMax = Math.max(...histVals)
    // A floor keeps a nearly flat week from letting a steep forecast own the axis.
    const span = Math.max(histMax - histMin, 2)
    const lo = histMin - span * 0.7
    const hi = histMax + span * 0.7
    const budget = futureDayBudget(visible.length)
    const daily = projectDaily(projection, budget)
    const minKeep = Math.min(daily.length, visible.length <= 14 ? 4 : 10)
    let cut = daily.length
    for (let i = 0; i < daily.length; i++) {
      const value = daily[i]!.projected
      if (i >= minKeep && (value < lo || value > hi)) {
        cut = i
        break
      }
    }
    const forward = daily.slice(0, Math.max(cut, 1))
    for (const point of forward) {
      const existing = rows.find((row) => row.date === point.date)
      if (existing) existing.projected = point.projected
      else {
        rows.push({
          date: point.date,
          label: formatAxisDate(point.date, false),
          raw: null,
          average: null,
          projected: point.projected,
        })
      }
    }
    return rows
  }, [visible, projection])

  const axisDomain = useMemo((): [number, number] => {
    const vals: number[] = []
    for (const row of chartData) {
      if (row.average != null) vals.push(row.average)
      if (row.raw != null) vals.push(row.raw)
      if (row.projected != null) vals.push(row.projected)
    }
    if (vals.length === 0) return [0, 1]
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const span = max - min
    // Small pad so a half-pound move still fills the plot. A distant all-time
    // low stays off this scale — it has its own readout.
    const pad = span > 0 ? Math.max(span * 0.18, 0.35) : 0.6
    return [Math.round((min - pad) * 10) / 10, Math.round((max + pad) * 10) / 10]
  }, [chartData, insight.recordLow])

  const domainSpan = axisDomain[1] - axisDomain[0]
  const showLowLine =
    insight.recordLow != null &&
    insight.recordLow >= axisDomain[0] &&
    insight.recordLow <= axisDomain[1]
  const showGoalLine =
    goalTarget != null && goalTarget >= axisDomain[0] && goalTarget <= axisDomain[1]
  const hasProjection = chartData.some((row) => row.projected != null && row.average == null)
  const lastVisibleDate = visible[visible.length - 1]?.date ?? ""
  const spansYears =
    chartData.length > 1 &&
    chartData[0]!.date.slice(0, 4) !== chartData[chartData.length - 1]!.date.slice(0, 4)

  const windowDelta = useMemo(() => {
    if (visible.length < 2) return null
    const delta = visible[visible.length - 1]!.average - visible[0]!.average
    return Math.round(delta * 10) / 10
  }, [visible])

  const hasSeries = visible.some((p) => Number.isFinite(p.average))
  if (!hasSeries) {
    if (points.length === 0 || rangeDays == null) return null
    return (
      <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/70">
        No weigh-ins in this range. Switch to a longer view to see the trend.
      </p>
    )
  }

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
  const deltaClass =
    windowDelta == null || Math.abs(windowDelta) < 0.05
      ? "text-muted-foreground"
      : windowDelta < 0
        ? "text-positive"
        : "text-negative"
  const lowDate = formatLowDate(insight.recordLowDate)
  const hero = size === "hero"
  const dotRadius = hero ? 3.2 : 2.4

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
          "relative w-full min-w-0 shrink-0",
          hero ? "h-[22.5rem] sm:h-[26rem]" : "h-72 sm:h-80",
          animate && "hub-weight-chart-reveal",
          hero
            ? "select-none touch-pan-y [-webkit-touch-callout:none]"
            : "chart-touch-safe -mx-0.5 sm:mx-0",
        )}
        onPointerDown={hero ? undefined : (event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 360, height: hero ? 360 : 320 }}
        >
          <ComposedChart
            data={chartData}
            margin={hero ? { top: 8, right: 8, left: 0, bottom: 0 } : { top: 18, right: 8, left: 0, bottom: 4 }}
            accessibilityLayer={false}
          >
            <defs>
              <linearGradient id="weightTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={WEIGHT_COLOR} stopOpacity={0.32} />
                <stop offset="100%" stopColor={WEIGHT_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" stroke="oklch(1 0 0 / 7%)" vertical={false} />
            <XAxis
              dataKey="date"
              padding={hero ? { left: 4, right: 18 } : undefined}
              tick={{
                fontSize: hero ? 11 : 10,
                fill: "oklch(0.68 0.012 250)",
                fontFamily: AXIS_FONT,
              }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={hero ? 48 : 36}
              tickMargin={8}
              tickFormatter={(value: string) => formatAxisDate(value, spansYears)}
            />
            <YAxis
              type="number"
              domain={axisDomain}
              allowDataOverflow
              tickCount={hero ? 6 : 5}
              tick={{
                fontSize: hero ? 11 : 10,
                fill: WEIGHT_COLOR,
                fontFamily: AXIS_FONT,
              }}
              tickLine={false}
              axisLine={false}
              width={hero ? 40 : 42}
              tickFormatter={(v: number) =>
                domainSpan >= 14 ? Math.round(v).toString() : Number(v).toFixed(1)
              }
            />
            <Tooltip
              content={<TrendTooltip unit={unit} recordLow={insight.recordLow} />}
              cursor={{ stroke: "oklch(1 0 0 / 18%)", strokeWidth: 1 }}
            />
            {showLowLine && insight.recordLow != null && (
              <ReferenceLine
                y={insight.recordLow}
                stroke={WEIGHT_COLOR}
                strokeDasharray="4 5"
                strokeOpacity={0.45}
                ifOverflow="discard"
              />
            )}
            {showGoalLine && goalTarget != null && (
              <ReferenceLine
                y={goalTarget}
                stroke={GOAL_COLOR}
                strokeDasharray="2 4"
                strokeOpacity={0.85}
                ifOverflow="discard"
              />
            )}
            {hasProjection && lastVisibleDate && (
              <ReferenceLine
                x={lastVisibleDate}
                stroke="oklch(1 0 0 / 22%)"
                strokeDasharray="2 4"
                ifOverflow="discard"
              />
            )}
            <Area
              type="monotone"
              dataKey="average"
              stroke={WEIGHT_COLOR}
              fill="url(#weightTrendFill)"
              strokeWidth={hero ? 2.6 : 2.2}
              dot={(dotProps: {
                cx?: number
                cy?: number
                index?: number
                payload?: ChartRow
              }) => {
                const row = dotProps.payload
                if (
                  !row ||
                  row.date !== lastVisibleDate ||
                  row.average == null ||
                  dotProps.cx == null ||
                  dotProps.cy == null
                ) {
                  return <g key={dotProps.index} />
                }
                return (
                  <g key={dotProps.index}>
                    <circle
                      cx={dotProps.cx}
                      cy={dotProps.cy}
                      r={9}
                      fill={WEIGHT_COLOR}
                      fillOpacity={0.18}
                    />
                    <circle
                      cx={dotProps.cx}
                      cy={dotProps.cy}
                      r={4}
                      fill={WEIGHT_COLOR}
                      stroke="#041614"
                      strokeWidth={1.5}
                    />
                  </g>
                )
              }}
              activeDot={{ r: 5, fill: WEIGHT_COLOR, stroke: "#041614", strokeWidth: 1.5 }}
              connectNulls={false}
              name="average"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="projected"
              stroke={WEIGHT_COLOR}
              strokeWidth={hero ? 2 : 1.6}
              strokeDasharray="5 5"
              strokeOpacity={0.7}
              dot={false}
              connectNulls
              name="projected"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="raw"
              stroke="none"
              dot={{ r: dotRadius, fill: RAW_DOT_COLOR, strokeWidth: 0, fillOpacity: 0.9 }}
              activeDot={{ r: hero ? 5.5 : 4.5, fill: RAW_DOT_COLOR, strokeWidth: 0 }}
              connectNulls={false}
              name="raw"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[12px] tabular-nums text-muted-foreground/80">
          {windowDelta != null ? (
            <>
              <span className={cn("font-semibold", deltaClass)}>{signedLb(windowDelta)}</span>
              <span> {unit} in this view</span>
            </>
          ) : (
            <span>Not enough weigh-ins in this view</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <LegendSwatch kind="line" label="Trend" />
          <LegendSwatch kind="dot" label="Weigh-in" />
          {hasProjection && <LegendSwatch kind="dashed" label="Projection" />}
          {showGoalLine && <LegendSwatch kind="goal" label="Goal" />}
          {showLowLine && <LegendSwatch kind="low" label="Low" />}
        </div>
      </div>

      <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3", !showSummary && "hidden")}>
        <div className="rounded-xl border border-border/50 bg-muted/5 px-3 py-2.5">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground/75">
            7-weigh-in avg
          </p>
          <p className="text-lg font-bold tabular-nums" style={{ color: WEIGHT_COLOR }}>
            {insight.currentAverage != null ? insight.currentAverage : "—"}
            {insight.currentAverage != null && (
              <span className="ml-1 text-[11px] font-medium text-muted-foreground">{unit}</span>
            )}
          </p>
        </div>
        <div className="rounded-xl border border-border/50 bg-muted/5 px-3 py-2.5">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground/75">
            Average trend
          </p>
          <div className="flex items-center gap-1.5">
            <TrendIcon className={cn("h-4 w-4 shrink-0", trendClass)} aria-hidden />
            <div className="min-w-0">
              <p className={cn("text-sm font-bold leading-tight", trendClass)}>{trendLabel}</p>
              {insight.vsPreviousLb != null && (
                <p className="text-[11px] text-muted-foreground tabular-nums">
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
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground/75">
            {insight.recordLowIsLatest ? "New all-time low" : "All-time low"}
          </p>
          <p className="text-lg font-bold tabular-nums" style={{ color: WEIGHT_COLOR }}>
            {insight.recordLow != null ? insight.recordLow : "—"}
            {insight.recordLow != null && (
              <span className="ml-1 text-[11px] font-medium text-muted-foreground">{unit}</span>
            )}
          </p>
          {lowDate && (
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">{lowDate}</p>
          )}
        </div>
      </div>
    </div>
  )
}
