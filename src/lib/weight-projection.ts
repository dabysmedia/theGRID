/**
 * Trajectory, dynamic expenditure, and forward projection for the weight panel.
 *
 * Everything here is pure so the API route, the hub panel, and tests share one
 * definition of "how fast am I losing" and "what is my maintenance right now".
 *
 * The expenditure model is an energy-balance (intake vs. scale) estimate:
 *
 *   expenditure = average intake + (weight lost over the window x 3500) / days
 *
 * which folds every calorie the body actually burned — BMR, NEAT, training —
 * into one observed number. Intake days that were never logged, or only
 * half-logged, would drag that average down and inflate the estimate, so they
 * are classified out before the average is taken (see {@link classifyIntakeDays}).
 */

import { addDaysToYmd } from "@/lib/steps-day"
import { isVacationBlockingCalendarDay } from "@/lib/vacation-mode"
import { roundWeight, type WeightLog, type WeightTrendPoint } from "@/lib/weight-trend"

/** Energy in one pound of body mass. */
export const KCAL_PER_LB = 3500

/** Lookback used for the headline expenditure / rate figures. */
export const DEFAULT_EXPENDITURE_WINDOW_DAYS = 30

/** Lookbacks offered as rate-of-change readouts. */
export const RATE_WINDOWS = [7, 14, 30, 90] as const

/** Lookback for "what am I eating right now". */
export const RECENT_INTAKE_DAYS = 7

/** Below this many usable intake days the expenditure estimate is withheld. */
export const MIN_COMPLETE_INTAKE_DAYS = 10

/** A day under this many calories was not a real day of eating, it was a partial log. */
export const INTAKE_FLOOR_KCAL = 1000

/** ...as is a day under this share of the user's own typical logged day. */
export const INTAKE_PARTIAL_RATIO = 0.55

/**
 * Net (above-resting) walking cost per step per pound of bodyweight.
 * ~0.5 kcal/kg/km over ~1300 steps/km gives 0.00017 kcal/step/lb,
 * i.e. roughly 340 kcal per 10k steps at 200 lb.
 */
export const NET_KCAL_PER_STEP_PER_LB = 0.00017

/** Hard stop for the forward projection. */
export const MAX_PROJECTION_DAYS = 730

/** Slower than this and the trend is treated as flat — no ETA. */
export const MIN_PROJECTABLE_LB_PER_WEEK = 0.05

const YMD = /^\d{4}-\d{2}-\d{2}$/

/* ─── small helpers ──────────────────────────────────────── */

function isYmd(value: string | null | undefined): value is string {
  return typeof value === "string" && YMD.test(value)
}

function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number)
  return Date.UTC(y!, m! - 1, d!) / 86_400_000
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetweenYmd(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a)
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

function round(value: number, places: number): number {
  const f = 10 ** places
  return Math.round(value * f) / f
}

function labelFor(ymd: string): string {
  const [, month, day] = ymd.split("-")
  return `${Number(month)}/${Number(day)}`
}

/** Least-squares fit; null when the x values do not vary. */
function linearFit(
  xs: number[],
  ys: number[],
): { slope: number; intercept: number; r2: number } | null {
  const n = xs.length
  if (n < 2) return null
  const mx = mean(xs)
  const my = mean(ys)
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx
    sxx += dx * dx
    sxy += dx * (ys[i]! - my)
  }
  if (sxx === 0) return null
  const slope = sxy / sxx
  const intercept = my - slope * mx
  let ssTot = 0
  let ssRes = 0
  for (let i = 0; i < n; i++) {
    const predicted = slope * xs[i]! + intercept
    ssTot += (ys[i]! - my) ** 2
    ssRes += (ys[i]! - predicted) ** 2
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot
  return { slope, intercept, r2 }
}

/* ─── intake day quality ─────────────────────────────────── */

export type IntakeDayInput = {
  date: string
  kcal: number
  /** Number of food entries logged that day. */
  entries: number
}

export type ActivityDayInput = {
  date: string
  steps?: number | null
  cardioKcal?: number | null
}

export type IntakeQuality =
  /** Fully logged — counts toward the intake average. */
  | "complete"
  /** Logged, but too little to be a real day of eating. */
  | "partial"
  /** Nothing logged at all. */
  | "untracked"
  /** Vacation, or still in progress — not counted either way. */
  | "excluded"

export type ClassifiedIntakeDay = IntakeDayInput & { quality: IntakeQuality }

export type IntakeCoverage = {
  from: string
  to: string
  days: ClassifiedIntakeDay[]
  completeDays: number
  partialDays: number
  untrackedDays: number
  excludedDays: number
  /** Days that could have been logged (everything but `excluded`). */
  eligibleDays: number
  /** completeDays / eligibleDays, 0-1. */
  coverage: number
  /** Mean kcal across complete days, null when there are none. */
  avgKcal: number | null
  /** The user's own typical logged day, used for the partial-day cutoff. */
  typicalKcal: number | null
}

/**
 * Label every calendar day in `[from, to]` so partially-logged and untracked
 * days can be kept out of every average built on intake.
 *
 * A day is `partial` when it falls under {@link INTAKE_FLOOR_KCAL} or under
 * {@link INTAKE_PARTIAL_RATIO} of the user's own median logged day, which
 * catches "logged breakfast, forgot the rest" without punishing a genuinely
 * light day that was still fully recorded.
 */
export function classifyIntakeDays(
  days: IntakeDayInput[],
  opts: {
    from: string
    to: string
    /** Current day — it and anything later is still in progress. */
    today?: string | null
    vacationResumeDate?: string | null
  },
): IntakeCoverage {
  const { from, to } = opts
  const byDay = new Map<string, IntakeDayInput>()
  for (const day of days) {
    if (!isYmd(day.date) || !Number.isFinite(day.kcal)) continue
    const prior = byDay.get(day.date)
    if (prior) {
      byDay.set(day.date, {
        date: day.date,
        kcal: prior.kcal + day.kcal,
        entries: prior.entries + day.entries,
      })
    } else {
      byDay.set(day.date, { ...day })
    }
  }

  const empty: IntakeCoverage = {
    from,
    to,
    days: [],
    completeDays: 0,
    partialDays: 0,
    untrackedDays: 0,
    excludedDays: 0,
    eligibleDays: 0,
    coverage: 0,
    avgKcal: null,
    typicalKcal: null,
  }
  if (!isYmd(from) || !isYmd(to) || from > to) return empty

  const inProgressFrom = isYmd(opts.today) ? opts.today : null
  const isExcluded = (date: string) =>
    isVacationBlockingCalendarDay(opts.vacationResumeDate, date) ||
    (inProgressFrom != null && date >= inProgressFrom)

  // The cutoff for "a real day" is anchored on the user's own logged days, so a
  // 1,600 kcal cutter and a 3,800 kcal bulker get the same treatment.
  const candidateKcal: number[] = []
  for (let date = from; date <= to; date = addDaysToYmd(date, 1)) {
    if (isExcluded(date)) continue
    const row = byDay.get(date)
    if (row && row.entries > 0 && row.kcal >= INTAKE_FLOOR_KCAL) candidateKcal.push(row.kcal)
  }
  const typicalKcal = candidateKcal.length > 0 ? median(candidateKcal) : null
  const partialCutoff = Math.max(
    INTAKE_FLOOR_KCAL,
    typicalKcal != null ? typicalKcal * INTAKE_PARTIAL_RATIO : 0,
  )

  const classified: ClassifiedIntakeDay[] = []
  let completeDays = 0
  let partialDays = 0
  let untrackedDays = 0
  let excludedDays = 0
  const completeKcal: number[] = []

  for (let date = from; date <= to; date = addDaysToYmd(date, 1)) {
    const row = byDay.get(date)
    const kcal = row?.kcal ?? 0
    const entries = row?.entries ?? 0
    let quality: IntakeQuality
    if (isExcluded(date)) {
      quality = "excluded"
      excludedDays += 1
    } else if (entries <= 0 || kcal <= 0) {
      quality = "untracked"
      untrackedDays += 1
    } else if (kcal < partialCutoff) {
      quality = "partial"
      partialDays += 1
    } else {
      quality = "complete"
      completeDays += 1
      completeKcal.push(kcal)
    }
    classified.push({ date, kcal, entries, quality })
  }

  const eligibleDays = classified.length - excludedDays
  return {
    from,
    to,
    days: classified,
    completeDays,
    partialDays,
    untrackedDays,
    excludedDays,
    eligibleDays,
    coverage: eligibleDays > 0 ? completeDays / eligibleDays : 0,
    avgKcal: completeKcal.length > 0 ? Math.round(mean(completeKcal)) : null,
    typicalKcal: typicalKcal != null ? Math.round(typicalKcal) : null,
  }
}

/** Mean intake across the complete days in the trailing `days` window. */
export function averageCompleteIntake(
  coverage: IntakeCoverage,
  days: number,
  endDate: string,
): { avgKcal: number | null; completeDays: number } {
  const start = addDaysToYmd(endDate, -(days - 1))
  const kcals = coverage.days
    .filter((d) => d.quality === "complete" && d.date >= start && d.date <= endDate)
    .map((d) => d.kcal)
  return {
    avgKcal: kcals.length > 0 ? Math.round(mean(kcals)) : null,
    completeDays: kcals.length,
  }
}

/* ─── rate of change ─────────────────────────────────────── */

export type WeightRate = {
  windowDays: number
  from: string
  to: string
  lbPerDay: number
  lbPerWeek: number
  /** Weigh-ins the fit was built from. */
  samples: number
  /** Calendar days between the first and last weigh-in used. */
  spanDays: number
  /** Regression-fitted weight at the window edges. */
  fitStart: number
  fitEnd: number
  /** How tightly the weigh-ins hug the line, 0-1. */
  r2: number
}

function minimumSpanFor(windowDays: number): number {
  return Math.max(3, Math.ceil(windowDays * 0.4))
}

/**
 * Least-squares rate over the raw weigh-ins in the trailing window.
 *
 * The raw scale numbers are used rather than the smoothed line because a
 * trailing average lags by half its window and would understate the current
 * rate; the regression already does the smoothing.
 */
export function computeWeightRate(
  logs: WeightLog[],
  windowDays: number,
  endDate: string,
  opts?: { vacationResumeDate?: string | null },
): WeightRate | null {
  if (!isYmd(endDate) || !Number.isFinite(windowDays) || windowDays < 2) return null
  const from = addDaysToYmd(endDate, -(windowDays - 1))

  const byDay = new Map<string, number>()
  for (const log of logs) {
    if (!isYmd(log.date) || !Number.isFinite(log.value) || log.value <= 0) continue
    if (log.date < from || log.date > endDate) continue
    if (isVacationBlockingCalendarDay(opts?.vacationResumeDate, log.date)) continue
    byDay.set(log.date, log.value)
  }
  const used = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  if (used.length < 3) return null

  const firstDate = used[0]![0]
  const lastDate = used[used.length - 1]![0]
  const spanDays = daysBetweenYmd(firstDate, lastDate)
  if (spanDays < minimumSpanFor(windowDays)) return null

  const base = dayNumber(from)
  const xs = used.map(([date]) => dayNumber(date) - base)
  const ys = used.map(([, value]) => value)
  const fit = linearFit(xs, ys)
  if (!fit) return null

  const lbPerDay = fit.slope
  return {
    windowDays,
    from,
    to: endDate,
    lbPerDay: round(lbPerDay, 4),
    lbPerWeek: round(lbPerDay * 7, 2),
    samples: used.length,
    spanDays,
    fitStart: roundWeight(fit.intercept),
    fitEnd: roundWeight(fit.slope * (dayNumber(endDate) - base) + fit.intercept),
    r2: round(Math.max(0, Math.min(1, fit.r2)), 3),
  }
}

/** Rates over several lookbacks, so the panel can show 7d next to 30d and 90d. */
export function computeRateSet(
  logs: WeightLog[],
  endDate: string,
  windows: number[],
  opts?: { vacationResumeDate?: string | null },
): Record<string, WeightRate | null> {
  const out: Record<string, WeightRate | null> = {}
  for (const windowDays of windows) {
    out[String(windowDays)] = computeWeightRate(logs, windowDays, endDate, opts)
  }
  return out
}

/* ─── activity ───────────────────────────────────────────── */

export type ActivitySummary = {
  windowDays: number
  avgSteps: number | null
  recentAvgSteps: number | null
  avgCardioKcal: number | null
  recentAvgCardioKcal: number | null
  /** kcal/day the recent stretch runs above (or below) the baseline window. */
  deltaKcal: number
}

export function kcalPerStep(bodyWeightLb: number): number {
  return NET_KCAL_PER_STEP_PER_LB * bodyWeightLb
}

/**
 * How much busier the last {@link RECENT_INTAKE_DAYS} have been than the window
 * the expenditure was measured over. Only steps drive the kcal delta — cardio
 * calories overlap with step counts (runs credit steps) and would double-count.
 */
export function summarizeActivity(
  days: ActivityDayInput[],
  opts: {
    windowDays: number
    endDate: string
    recentDays?: number
    bodyWeightLb: number
  },
): ActivitySummary {
  const recentDays = opts.recentDays ?? RECENT_INTAKE_DAYS
  const windowFrom = addDaysToYmd(opts.endDate, -(opts.windowDays - 1))
  const recentFrom = addDaysToYmd(opts.endDate, -(recentDays - 1))

  const stepsWindow: number[] = []
  const stepsRecent: number[] = []
  const cardioWindow: number[] = []
  const cardioRecent: number[] = []

  for (const day of days) {
    if (!isYmd(day.date) || day.date < windowFrom || day.date > opts.endDate) continue
    const steps = Number.isFinite(day.steps) ? Number(day.steps) : null
    const cardio = Number.isFinite(day.cardioKcal) ? Number(day.cardioKcal) : null
    if (steps != null) {
      stepsWindow.push(steps)
      if (day.date >= recentFrom) stepsRecent.push(steps)
    }
    if (cardio != null) {
      cardioWindow.push(cardio)
      if (day.date >= recentFrom) cardioRecent.push(cardio)
    }
  }

  const avgSteps = stepsWindow.length > 0 ? Math.round(mean(stepsWindow)) : null
  const recentAvgSteps = stepsRecent.length > 0 ? Math.round(mean(stepsRecent)) : null
  const perStep = kcalPerStep(opts.bodyWeightLb)
  const deltaKcal =
    avgSteps != null && recentAvgSteps != null
      ? Math.round((recentAvgSteps - avgSteps) * perStep)
      : 0

  return {
    windowDays: opts.windowDays,
    avgSteps,
    recentAvgSteps,
    avgCardioKcal: cardioWindow.length > 0 ? Math.round(mean(cardioWindow)) : null,
    recentAvgCardioKcal: cardioRecent.length > 0 ? Math.round(mean(cardioRecent)) : null,
    deltaKcal,
  }
}

/* ─── dynamic expenditure ────────────────────────────────── */

export type EnergyConfidence = "low" | "medium" | "high"

export type ExpenditureEstimate = {
  windowDays: number
  from: string
  to: string
  /** Complete intake days behind `avgIntakeKcal`. */
  completeDays: number
  partialDaysIgnored: number
  untrackedDaysIgnored: number
  coverage: number
  avgIntakeKcal: number
  /** Weight change across the window, from the regression fit (negative = lost). */
  weightChangeLb: number
  lbPerWeek: number
  /** Maintenance calories the scale and the food log agree on. */
  expenditureKcal: number
  /** Maintenance adjusted for how active the last week has been. */
  expenditureNowKcal: number
  /** What the last {@link RECENT_INTAKE_DAYS} of complete days averaged. */
  recentIntakeKcal: number | null
  recentCompleteDays: number
  /** expenditureNow - recentIntake. Positive = in a deficit. */
  currentDeficitKcal: number | null
  /** Deficit implied by the scale trend alone. */
  trendDeficitKcal: number
  /** Weekly loss the current deficit would produce if held. */
  projectedLbPerWeek: number | null
  activity: ActivitySummary | null
  confidence: EnergyConfidence
}

function gradeConfidence(coverage: number, completeDays: number, r2: number): EnergyConfidence {
  if (coverage >= 0.8 && completeDays >= 18 && r2 >= 0.3) return "high"
  if (coverage >= 0.6 && completeDays >= 12) return "medium"
  return "low"
}

/**
 * Observed maintenance from the food log and the scale over the same window.
 * Returns null when there is not enough clean data to say anything honest.
 */
export function estimateExpenditure(opts: {
  coverage: IntakeCoverage
  rate: WeightRate
  activity?: ActivitySummary | null
  endDate: string
  recentDays?: number
}): ExpenditureEstimate | null {
  const { coverage, rate } = opts
  const windowFrom = rate.from
  const windowTo = rate.to
  const inWindow = coverage.days.filter((d) => d.date >= windowFrom && d.date <= windowTo)
  const completeKcal = inWindow.filter((d) => d.quality === "complete").map((d) => d.kcal)
  if (completeKcal.length < MIN_COMPLETE_INTAKE_DAYS) return null

  const avgIntakeKcal = Math.round(mean(completeKcal))
  const windowSpan = daysBetweenYmd(windowFrom, windowTo)
  const weightChangeLb = round(rate.lbPerDay * windowSpan, 2)

  // Losing weight means the body spent more than the plate delivered.
  const trendDeficitKcal = Math.round(-rate.lbPerDay * KCAL_PER_LB)
  const expenditureKcal = avgIntakeKcal + trendDeficitKcal
  const activityDelta = opts.activity?.deltaKcal ?? 0
  const expenditureNowKcal = expenditureKcal + activityDelta

  const recentDays = opts.recentDays ?? RECENT_INTAKE_DAYS
  const recent = averageCompleteIntake(coverage, recentDays, opts.endDate)
  const currentDeficitKcal =
    recent.avgKcal != null ? Math.round(expenditureNowKcal - recent.avgKcal) : null
  const projectedLbPerWeek =
    currentDeficitKcal != null ? round((currentDeficitKcal * 7) / KCAL_PER_LB, 2) : null

  const eligibleInWindow = inWindow.filter((d) => d.quality !== "excluded").length
  const windowCoverage = eligibleInWindow > 0 ? completeKcal.length / eligibleInWindow : 0

  return {
    windowDays: rate.windowDays,
    from: windowFrom,
    to: windowTo,
    completeDays: completeKcal.length,
    partialDaysIgnored: inWindow.filter((d) => d.quality === "partial").length,
    untrackedDaysIgnored: inWindow.filter((d) => d.quality === "untracked").length,
    coverage: round(windowCoverage, 3),
    avgIntakeKcal,
    weightChangeLb,
    lbPerWeek: rate.lbPerWeek,
    expenditureKcal,
    expenditureNowKcal,
    recentIntakeKcal: recent.avgKcal,
    recentCompleteDays: recent.completeDays,
    currentDeficitKcal,
    trendDeficitKcal,
    projectedLbPerWeek,
    activity: opts.activity ?? null,
    confidence: gradeConfidence(windowCoverage, completeKcal.length, rate.r2),
  }
}

/* ─── forward projection ─────────────────────────────────── */

export type ProjectionPoint = {
  date: string
  label: string
  projected: number
}

export type WeightProjection = {
  startDate: string
  startWeight: number
  lbPerWeek: number
  targetLb: number | null
  /** Day the trend crosses the target, null when it never does. */
  etaDate: string | null
  daysToTarget: number | null
  weeksToTarget: number | null
  /** Pounds still to go (positive = above target). */
  remainingLb: number | null
  points: ProjectionPoint[]
  reachable: boolean
  /** Why there is no ETA. */
  blockedReason: "no-target" | "flat" | "wrong-direction" | "too-far" | null
}

/**
 * Extend the current trend forward. Emits one point per `stepDays` starting at
 * `startDate` so the dashed line joins the real one, and stops at the target.
 */
export function projectWeight(opts: {
  startDate: string
  startWeight: number
  lbPerWeek: number
  targetLb?: number | null
  /** Horizon when there is no target to aim at. */
  fallbackDays?: number
  stepDays?: number
  maxDays?: number
}): WeightProjection {
  const { startDate, startWeight, lbPerWeek } = opts
  const stepDays = opts.stepDays ?? 7
  const maxDays = Math.min(opts.maxDays ?? MAX_PROJECTION_DAYS, MAX_PROJECTION_DAYS)
  const target =
    opts.targetLb != null && Number.isFinite(opts.targetLb) && opts.targetLb > 0
      ? opts.targetLb
      : null

  const lbPerDay = lbPerWeek / 7
  const remainingLb = target != null ? round(startWeight - target, 1) : null

  let blockedReason: WeightProjection["blockedReason"] = null
  let daysToTarget: number | null = null

  if (target == null) {
    blockedReason = "no-target"
  } else if (Math.abs(lbPerWeek) < MIN_PROJECTABLE_LB_PER_WEEK) {
    blockedReason = "flat"
  } else {
    const gap = target - startWeight
    if (Math.abs(gap) < 0.05) {
      daysToTarget = 0
    } else if (Math.sign(gap) !== Math.sign(lbPerDay)) {
      blockedReason = "wrong-direction"
    } else {
      const days = Math.ceil(gap / lbPerDay)
      if (days > maxDays) blockedReason = "too-far"
      else daysToTarget = days
    }
  }

  const horizon =
    daysToTarget != null
      ? Math.max(daysToTarget, stepDays)
      : Math.min(opts.fallbackDays ?? 84, maxDays)

  const points: ProjectionPoint[] = []
  for (let offset = 0; offset <= horizon; offset += stepDays) {
    const date = addDaysToYmd(startDate, offset)
    points.push({
      date,
      label: labelFor(date),
      projected: roundWeight(startWeight + lbPerDay * offset),
    })
  }
  // Always land exactly on the horizon so the line ends on the target.
  const lastPoint = points[points.length - 1]
  if (!lastPoint || daysBetweenYmd(startDate, lastPoint.date) !== horizon) {
    const date = addDaysToYmd(startDate, horizon)
    points.push({
      date,
      label: labelFor(date),
      projected: roundWeight(startWeight + lbPerDay * horizon),
    })
  }

  const etaDate = daysToTarget != null ? addDaysToYmd(startDate, daysToTarget) : null

  return {
    startDate,
    startWeight: roundWeight(startWeight),
    lbPerWeek: round(lbPerWeek, 2),
    targetLb: target,
    etaDate,
    daysToTarget,
    weeksToTarget: daysToTarget != null ? round(daysToTarget / 7, 1) : null,
    remainingLb,
    points,
    reachable: daysToTarget != null,
    blockedReason,
  }
}

/* ─── the payload the weight panel consumes ──────────────── */

export type WeightCoverageSummary = {
  from: string
  to: string
  completeDays: number
  partialDays: number
  untrackedDays: number
  excludedDays: number
  eligibleDays: number
  typicalKcal: number | null
}

/** Everything `/api/weight` computes beyond the raw trend line. */
export type WeightAnalytics = {
  /** Current calendar day in the user's timezone. */
  today: string
  /** Last day whose food log is closed — every intake average stops here. */
  throughDate: string
  goalTarget: number | null
  trendWeight: number | null
  rates: Record<string, WeightRate | null>
  primaryRate: WeightRate | null
  energy: ExpenditureEstimate | null
  projection: WeightProjection | null
  coverage: WeightCoverageSummary
}

/** Latest smoothed value at or before `endDate` — where the projection starts. */
export function currentTrendWeight(
  points: WeightTrendPoint[],
  endDate: string,
): { date: string; value: number } | null {
  let best: WeightTrendPoint | null = null
  for (const point of points) {
    if (point.date > endDate) break
    best = point
  }
  return best ? { date: best.date, value: best.average } : null
}
