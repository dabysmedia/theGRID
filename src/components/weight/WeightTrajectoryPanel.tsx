"use client"

import { format } from "date-fns"
import { Activity } from "lucide-react"
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

function toneClass(tone: "positive" | "negative" | "neutral"): string {
  if (tone === "positive") return "text-positive"
  if (tone === "negative") return "text-negative"
  return "text-muted-foreground"
}

function goalProgress(
  start: number | null | undefined,
  current: number | null,
  target: number | null,
): number | null {
  if (start == null || current == null || target == null) return null
  const total = start - target
  if (Math.abs(total) < 0.05) return 100
  return Math.min(100, Math.max(0, ((start - current) / total) * 100))
}

function Hairline() {
  return (
    <div
      className="pointer-events-none h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
      aria-hidden
    />
  )
}

function Section({
  eyebrow,
  children,
  trailing,
}: {
  eyebrow: string
  children: React.ReactNode
  trailing?: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="type-hud-subsection">{eyebrow}</p>
        {trailing}
      </div>
      {children}
    </section>
  )
}

function RateCard({
  rates,
  primary,
  unit,
}: {
  rates: Record<string, WeightRate | null>
  primary: WeightRate | null
  unit: string
}) {
  return (
    <Section eyebrow="Rate of change" trailing={
      <span className="type-hud-micro normal-case tracking-normal text-muted-foreground/50">
        {unit}/week
      </span>
    }>
      {primary ? (
        <>
          <div className="grid grid-cols-4 gap-1.5">
            {RATE_WINDOWS.map((window) => {
              const rate = rates[String(window)] ?? null
              const active = primary.windowDays === window
              const tone = rate ? toneForRate(rate.lbPerWeek) : "neutral"
              return (
                <div key={window} className="min-w-0 text-center">
                  <p
                    className={cn(
                      "text-[10px] font-medium uppercase tracking-[0.14em]",
                      active ? "text-teal-100/80" : "text-muted-foreground/45",
                    )}
                  >
                    {window}d
                  </p>
                  <p
                    className={cn(
                      "mt-1.5 text-lg font-bold leading-none tabular-nums",
                      rate == null ? "text-muted-foreground/35" : toneClass(tone),
                    )}
                  >
                    {rate == null ? "—" : formatSignedLb(rate.lbPerWeek)}
                  </p>
                  <span
                    className={cn(
                      "mx-auto mt-2 block h-px w-6",
                      active ? "bg-teal-300/80" : "bg-transparent",
                    )}
                    aria-hidden
                  />
                </div>
              )
            })}
          </div>
          <p className="text-[12px] leading-relaxed text-muted-foreground/65">
            Fit through {primary.samples} weigh-ins
            {primary.spanDays > 0 ? ` over ${primary.spanDays} days` : ""}. The highlighted
            window is what the projection follows.
          </p>
        </>
      ) : (
        <p className="text-[13px] leading-relaxed text-muted-foreground/70">
          Three weigh-ins spread across a few days will unlock a rate.
        </p>
      )}
    </Section>
  )
}

const BLOCKED_COPY: Record<string, string> = {
  "no-target": "Set a goal weight and this turns into an arrival date.",
  flat: "The trend is flat, so there isn’t an arrival date yet.",
  "wrong-direction": "The trend is moving away from the goal, so there isn’t an arrival date.",
  "too-far": "At this pace the goal is more than two years out.",
}

function ProjectionCard({
  analytics,
  unit,
  startValue,
}: {
  analytics: WeightAnalytics
  unit: string
  startValue?: number | null
}) {
  const projection = analytics.projection
  const reachable =
    projection?.reachable && projection.etaDate != null && projection.daysToTarget != null
  const progress = goalProgress(startValue, analytics.trendWeight, projection?.targetLb ?? null)

  return (
    <Section eyebrow="Projection">
      {reachable && projection ? (
        <>
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="type-hud-micro text-muted-foreground/55">Arrival</p>
              <p
                className="mt-1 font-heading text-[1.65rem] leading-none tracking-tight sm:text-3xl"
                style={{ color: WEIGHT_COLOR }}
              >
                {formatDay(projection.etaDate!)}
              </p>
              <p className="mt-2 text-[13px] leading-snug text-muted-foreground/75">
                {formatDuration(projection.daysToTarget!)} · holding{" "}
                <span className="tabular-nums text-foreground/85">
                  {formatSignedLb(projection.lbPerWeek)} {unit}/week
                </span>
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="type-hud-micro text-muted-foreground/55">To go</p>
              <p className="mt-1 font-heading text-3xl leading-none tabular-nums text-foreground">
                {Math.abs(projection.remainingLb ?? 0).toFixed(1)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground/60">{unit}</p>
            </div>
          </div>

          {progress != null && startValue != null && projection.targetLb != null && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] tabular-nums text-muted-foreground/55">
                <span>
                  {startValue} {unit}
                </span>
                <span>{Math.round(progress)}%</span>
                <span>
                  {projection.targetLb} {unit}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${progress}%`,
                    background: `linear-gradient(90deg, ${WEIGHT_COLOR}99, ${WEIGHT_COLOR})`,
                  }}
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-[13px] leading-relaxed text-muted-foreground/75">
            {BLOCKED_COPY[projection?.blockedReason ?? "no-target"] ??
              "Not enough trend to project from yet."}
          </p>
          {projection && projection.targetLb != null && projection.remainingLb != null && (
            <p className="text-[13px] tabular-nums text-foreground/80">
              {Math.abs(projection.remainingLb).toFixed(1)} {unit}{" "}
              {projection.remainingLb >= 0 ? "above" : "below"} the {projection.targetLb} {unit}{" "}
              goal.
            </p>
          )}
        </div>
      )}
    </Section>
  )
}

function EnergyStat({
  label,
  value,
  unit,
  tone,
  color,
}: {
  label: string
  value: string
  unit: string
  tone?: "positive" | "negative" | "neutral"
  color?: string
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/60">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-[1.35rem] font-bold leading-none tabular-nums sm:text-2xl",
          tone ? toneClass(tone) : undefined,
        )}
        style={tone ? undefined : { color: color ?? "inherit" }}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground/55">{unit}</p>
    </div>
  )
}

function EnergyCard({ analytics, unit }: { analytics: WeightAnalytics; unit: string }) {
  const energy = analytics.energy
  const coverage = analytics.coverage

  if (!energy) {
    return (
      <Section eyebrow="Energy balance">
        <p className="text-[13px] leading-relaxed text-muted-foreground/75">
          Expenditure comes from what you ate against what the scale did. It needs about two weeks
          of fully logged days in the last month, plus a weight trend.
        </p>
        <p className="text-[12px] tabular-nums text-muted-foreground/55">
          {coverage.completeDays} full day{coverage.completeDays === 1 ? "" : "s"} ·{" "}
          {coverage.partialDays} partial · {coverage.untrackedDays} untracked
        </p>
      </Section>
    )
  }

  const deficit = energy.currentDeficitKcal
  const inDeficit = deficit != null && deficit > 0
  const activity = energy.activity
  const ignored = energy.partialDaysIgnored + energy.untrackedDaysIgnored

  return (
    <Section
      eyebrow="Energy balance"
      trailing={
        <span
          className={cn(
            "type-hud-micro normal-case tracking-normal",
            energy.confidence === "high"
              ? "text-teal-200/75"
              : energy.confidence === "medium"
                ? "text-muted-foreground/60"
                : "text-amber-200/70",
          )}
        >
          {CONFIDENCE_LABEL[energy.confidence]}
        </span>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <EnergyStat
          label="Burn"
          value={formatKcal(energy.expenditureNowKcal)}
          unit="cal/day"
          color={CALORIE_COLOR}
        />
        <EnergyStat
          label="Eating"
          value={energy.recentIntakeKcal != null ? formatKcal(energy.recentIntakeKcal) : "—"}
          unit="cal/day"
        />
        <EnergyStat
          label={inDeficit ? "Deficit" : "Surplus"}
          value={deficit != null ? formatKcal(Math.abs(deficit)) : "—"}
          unit="cal/day"
          tone={deficit == null ? "neutral" : inDeficit ? "positive" : "negative"}
        />
      </div>

      <div className="space-y-1.5 text-[12px] leading-relaxed text-muted-foreground/70">
        <p>
          {energy.completeDays} logged days averaged {formatKcal(energy.avgIntakeKcal)} cal against{" "}
          <span className="tabular-nums text-foreground/80">
            {formatSignedLb(energy.weightChangeLb)} {unit}
          </span>{" "}
          on the scale.
          {ignored > 0
            ? ` ${energy.partialDaysIgnored} partial and ${energy.untrackedDaysIgnored} untracked days were left out.`
            : " Every day in the window was logged."}
        </p>
        {energy.projectedLbPerWeek != null && (
          <p className="tabular-nums">
            This week’s balance tracks to{" "}
            <span className="font-semibold text-foreground/85">
              {formatSignedLb(-energy.projectedLbPerWeek)} {unit}/week
            </span>
            .
          </p>
        )}
        {activity && activity.avgSteps != null && (
          <p className="flex items-start gap-1.5 tabular-nums">
            <Activity className="mt-0.5 size-3 shrink-0" style={{ color: STEPS_COLOR }} aria-hidden />
            <span>
              {activity.recentAvgSteps?.toLocaleString() ?? "—"} steps/day this week,{" "}
              {activity.avgSteps.toLocaleString()} across the window
              {activity.deltaKcal !== 0
                ? ` · ${activity.deltaKcal > 0 ? "+" : "−"}${Math.abs(activity.deltaKcal)} cal/day`
                : ""}
              .
            </span>
          </p>
        )}
      </div>
    </Section>
  )
}

export function WeightTrajectoryPanel({
  analytics,
  unit = "lbs",
  startValue = null,
  className,
}: {
  analytics: WeightAnalytics
  unit?: string
  /** Weight the goal was started from, for the progress track. */
  startValue?: number | null
  className?: string
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <Hairline />
      <RateCard rates={analytics.rates} primary={analytics.primaryRate} unit={unit} />
      <Hairline />
      <ProjectionCard analytics={analytics} unit={unit} startValue={startValue} />
      <Hairline />
      <EnergyCard analytics={analytics} unit={unit} />
    </div>
  )
}
