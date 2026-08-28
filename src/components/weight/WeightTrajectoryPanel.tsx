"use client"

import { format } from "date-fns"
import {
  Activity,
  CalendarClock,
  Flame,
  Info,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { cn, parseLocalDate } from "@/lib/utils"
import { CATEGORY_THEME } from "@/lib/category-theme"
import { RATE_WINDOWS, type WeightAnalytics, type WeightRate } from "@/lib/weight-projection"

const WEIGHT_COLOR = CATEGORY_THEME.weight.color
const CALORIE_COLOR = CATEGORY_THEME.calories.color
const STEPS_COLOR = CATEGORY_THEME.steps.color

const CONFIDENCE_LABEL = {
  high: "High confidence",
  medium: "Fair confidence",
  low: "Rough estimate",
} as const

function formatSignedLb(lb: number): string {
  const abs = Math.abs(lb).toFixed(2).replace(/0$/, "").replace(/\.$/, "")
  if (lb < 0) return `−${abs}`
  if (lb > 0) return `+${abs}`
  return "0"
}

function formatKcal(kcal: number): string {
  return Math.round(kcal).toLocaleString()
}

function formatDay(ymd: string): string {
  try {
    return format(parseLocalDate(ymd), "MMM d, yyyy")
  } catch {
    return ymd
  }
}

function formatDuration(days: number): string {
  if (days <= 0) return "already there"
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`
  const weeks = days / 7
  if (weeks < 12) return `${weeks.toFixed(weeks < 10 ? 1 : 0)} weeks`
  const months = days / 30.44
  return `${months.toFixed(months < 10 ? 1 : 0)} months`
}

function toneForRate(lbPerWeek: number): "positive" | "negative" | "neutral" {
  if (lbPerWeek <= -0.15) return "positive"
  if (lbPerWeek >= 0.15) return "negative"
  return "neutral"
}

/* ─── shell ──────────────────────────────────────────────── */

function Card({
  eyebrow,
  icon: Icon,
  accent,
  children,
  className,
}: {
  eyebrow: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  accent: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "space-y-3 rounded-2xl border border-white/[0.07] bg-white/[0.018] p-3.5 sm:p-4",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="grid size-8 shrink-0 place-items-center rounded-lg"
          style={{ backgroundColor: `${accent}1f`, border: `1px solid ${accent}26` }}
        >
          <Icon className="size-3.5" style={{ color: accent }} />
        </div>
        <p className="type-hud-subsection">{eyebrow}</p>
      </div>
      {children}
    </section>
  )
}

function Metric({
  label,
  value,
  unit,
  sub,
  color,
  tone,
}: {
  label: string
  value: string
  unit?: string
  sub?: string | null
  color?: string
  tone?: "positive" | "negative" | "neutral"
}) {
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : undefined
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
      <p className="mb-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/75">{label}</p>
      <p
        className={cn("text-base font-bold leading-tight tabular-nums", toneClass)}
        style={toneClass ? undefined : { color }}
      >
        {value}
        {unit && (
          <span className="ml-1 text-[10px] font-medium text-muted-foreground">{unit}</span>
        )}
      </p>
      {sub && <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground/70">{sub}</p>}
    </div>
  )
}

/* ─── rate of change ─────────────────────────────────────── */

function RateCard({
  rates,
  primary,
  unit,
}: {
  rates: Record<string, WeightRate | null>
  primary: WeightRate | null
  unit: string
}) {
  const tone = primary ? toneForRate(primary.lbPerWeek) : "neutral"
  const Icon =
    tone === "positive" ? TrendingDown : tone === "negative" ? TrendingUp : Minus
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : "text-muted-foreground"

  return (
    <Card eyebrow="Rate of change" icon={Activity} accent={WEIGHT_COLOR}>
      {primary ? (
        <>
          <div className="flex items-start gap-2">
            <Icon className={cn("mt-0.5 size-3.5 shrink-0", toneClass)} aria-hidden />
            <p className="text-[12px] leading-snug text-muted-foreground/80">
              <span className={cn("font-semibold tabular-nums", toneClass)}>
                {formatSignedLb(primary.lbPerDay)} {unit}/day
              </span>{" "}
              over the last {primary.windowDays} days, from {primary.samples} weigh-ins.
            </p>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {RATE_WINDOWS.map((window) => {
              const rate = rates[String(window)] ?? null
              const active = primary.windowDays === window
              return (
                <div
                  key={window}
                  className={cn(
                    "rounded-lg border px-2 py-1.5 text-center",
                    active
                      ? "border-teal-400/30 bg-teal-400/[0.07]"
                      : "border-white/[0.06] bg-white/[0.015]",
                  )}
                >
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60">
                    {window}d
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-[13px] font-bold tabular-nums",
                      rate == null
                        ? "text-muted-foreground/40"
                        : toneForRate(rate.lbPerWeek) === "positive"
                          ? "text-positive"
                          : toneForRate(rate.lbPerWeek) === "negative"
                            ? "text-negative"
                            : "text-muted-foreground",
                    )}
                  >
                    {rate == null ? "—" : formatSignedLb(rate.lbPerWeek)}
                  </p>
                </div>
              )
            })}
          </div>
          <p className="type-hud-caption normal-case tracking-normal text-muted-foreground/55">
            Least-squares fit through the raw weigh-ins, so the number does not lag the way a
            rolling average does. Each tile is {unit}/week over that lookback.
          </p>
        </>
      ) : (
        <p className="text-[12px] leading-relaxed text-muted-foreground/70">
          Three weigh-ins spread across at least a few days are needed before a rate can be fit.
          Keep logging and this fills in.
        </p>
      )}
    </Card>
  )
}

/* ─── projection ─────────────────────────────────────────── */

const BLOCKED_COPY: Record<string, string> = {
  "no-target": "Set a goal weight to get an arrival date.",
  flat: "The trend is flat right now, so there is no arrival date to give.",
  "wrong-direction": "The trend is moving away from the goal, so there is no arrival date.",
  "too-far": "At this rate the goal is more than two years out.",
}

function ProjectionCard({
  analytics,
  unit,
}: {
  analytics: WeightAnalytics
  unit: string
}) {
  const projection = analytics.projection
  return (
    <Card eyebrow="Projection" icon={CalendarClock} accent={WEIGHT_COLOR}>
      {projection?.reachable && projection.etaDate != null && projection.daysToTarget != null ? (
        <>
          <div>
            <p className="text-[22px] font-bold leading-none tabular-nums text-foreground">
              {projection.targetLb} <span className="text-xs font-medium text-muted-foreground">{unit}</span>
              <span className="mx-2 text-muted-foreground/40">·</span>
              <span style={{ color: WEIGHT_COLOR }}>{formatDay(projection.etaDate)}</span>
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/70">
              About {formatDuration(projection.daysToTarget)} away, holding{" "}
              {formatSignedLb(projection.lbPerWeek)} {unit}/week.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Metric
              label="Still to lose"
              value={`${Math.abs(projection.remainingLb ?? 0).toFixed(1)}`}
              unit={unit}
              color={WEIGHT_COLOR}
            />
            <Metric
              label="Time to goal"
              value={formatDuration(projection.daysToTarget)}
              sub={`from ${projection.startWeight} ${unit} today`}
            />
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-[12px] leading-relaxed text-muted-foreground/75">
            {BLOCKED_COPY[projection?.blockedReason ?? "no-target"] ??
              "Not enough trend to project from yet."}
          </p>
          {projection && projection.targetLb != null && projection.remainingLb != null && (
            <p className="text-[11px] text-muted-foreground/60 tabular-nums">
              {Math.abs(projection.remainingLb).toFixed(1)} {unit}{" "}
              {projection.remainingLb >= 0 ? "above" : "below"} the {projection.targetLb} {unit}{" "}
              goal.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

/* ─── energy balance ─────────────────────────────────────── */

function EnergyCard({ analytics, unit }: { analytics: WeightAnalytics; unit: string }) {
  const energy = analytics.energy
  const coverage = analytics.coverage

  if (!energy) {
    return (
      <Card eyebrow="Energy balance" icon={Flame} accent={CALORIE_COLOR}>
        <p className="text-[12px] leading-relaxed text-muted-foreground/75">
          Your expenditure is measured from what you ate against what the scale did, so it needs
          roughly two weeks of fully-logged days inside the last month plus a fittable weight
          trend.
        </p>
        <p className="text-[11px] text-muted-foreground/60 tabular-nums">
          {coverage.completeDays} fully-logged day{coverage.completeDays === 1 ? "" : "s"} so far ·{" "}
          {coverage.partialDays} partial · {coverage.untrackedDays} untracked
        </p>
      </Card>
    )
  }

  const deficit = energy.currentDeficitKcal
  const inDeficit = deficit != null && deficit > 0
  const activity = energy.activity

  return (
    <Card eyebrow="Energy balance" icon={Flame} accent={CALORIE_COLOR}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Metric
          label="Expenditure"
          value={formatKcal(energy.expenditureNowKcal)}
          unit="cal/day"
          color={CALORIE_COLOR}
          sub={
            energy.expenditureNowKcal !== energy.expenditureKcal
              ? `${formatKcal(energy.expenditureKcal)} baseline, adjusted for this week's activity`
              : `measured over ${energy.windowDays} days`
          }
        />
        <Metric
          label="Eating now"
          value={energy.recentIntakeKcal != null ? formatKcal(energy.recentIntakeKcal) : "—"}
          unit="cal/day"
          sub={
            energy.recentCompleteDays > 0
              ? `${energy.recentCompleteDays} logged day${energy.recentCompleteDays === 1 ? "" : "s"} this week`
              : "no full days logged this week"
          }
        />
        <Metric
          label={inDeficit ? "Deficit" : "Surplus"}
          value={deficit != null ? formatKcal(Math.abs(deficit)) : "—"}
          unit="cal/day"
          tone={deficit == null ? "neutral" : inDeficit ? "positive" : "negative"}
          sub={
            energy.projectedLbPerWeek != null
              ? `tracks to ${formatSignedLb(-energy.projectedLbPerWeek)} ${unit}/week`
              : null
          }
        />
      </div>

      <div className="space-y-1.5 rounded-xl border border-white/[0.05] bg-black/10 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 size-3 shrink-0 text-muted-foreground/50" aria-hidden />
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            Built from{" "}
            <span className="font-semibold text-foreground/80 tabular-nums">
              {energy.completeDays}
            </span>{" "}
            fully-logged days averaging{" "}
            <span className="tabular-nums">{formatKcal(energy.avgIntakeKcal)}</span> cal against{" "}
            <span className="tabular-nums">{formatSignedLb(energy.weightChangeLb)}</span> {unit} on
            the scale.{" "}
            {energy.partialDaysIgnored + energy.untrackedDaysIgnored > 0 ? (
              <>
                <span className="tabular-nums">{energy.partialDaysIgnored}</span> partly-logged and{" "}
                <span className="tabular-nums">{energy.untrackedDaysIgnored}</span> untracked days
                were left out.
              </>
            ) : (
              "Every day in the window was logged."
            )}
          </p>
        </div>
        {activity && activity.avgSteps != null && (
          <div className="flex items-start gap-2">
            <Activity className="mt-0.5 size-3 shrink-0" style={{ color: STEPS_COLOR }} aria-hidden />
            <p className="text-[11px] leading-relaxed text-muted-foreground/70 tabular-nums">
              {activity.recentAvgSteps?.toLocaleString() ?? "—"} steps/day this week vs{" "}
              {activity.avgSteps.toLocaleString()} across the window
              {activity.deltaKcal !== 0
                ? ` · ${activity.deltaKcal > 0 ? "+" : "−"}${Math.abs(activity.deltaKcal)} cal/day`
                : ""}
              {activity.recentAvgCardioKcal != null && activity.recentAvgCardioKcal > 0
                ? ` · ${formatKcal(activity.recentAvgCardioKcal)} cal/day logged cardio`
                : ""}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]",
            energy.confidence === "high"
              ? "bg-teal-400/10 text-teal-300/80"
              : energy.confidence === "medium"
                ? "bg-white/[0.05] text-muted-foreground/75"
                : "bg-amber-400/10 text-amber-300/75",
          )}
        >
          {CONFIDENCE_LABEL[energy.confidence]}
        </span>
        <span className="text-[10px] text-muted-foreground/50 tabular-nums">
          {Math.round(energy.coverage * 100)}% of the window logged
        </span>
      </div>
    </Card>
  )
}

/* ─── panel ──────────────────────────────────────────────── */

export function WeightTrajectoryPanel({
  analytics,
  unit = "lbs",
  className,
}: {
  analytics: WeightAnalytics
  unit?: string
  className?: string
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <RateCard rates={analytics.rates} primary={analytics.primaryRate} unit={unit} />
      <ProjectionCard analytics={analytics} unit={unit} />
      <EnergyCard analytics={analytics} unit={unit} />
    </div>
  )
}
