import { addDaysToYmd } from "@/lib/steps-day"
import { isVacationBlockingCalendarDay } from "@/lib/vacation-mode"

/** Trailing weigh-ins used for the smoothed weight line. */
export const WEIGHT_AVG_WINDOW_DAYS = 7

/** |lb| change of the 7-day average vs a week earlier to call it flat. */
export const WEIGHT_TREND_MAINTAIN_LB = 0.45

export type WeightLog = {
  date: string
  value: number
}

export type WeightTrendPoint = {
  date: string
  label: string
  /** Weigh-in that calendar day, if one was logged. */
  raw: number | null
  /** Trailing mean of up to 7 weigh-ins on or before this day. */
  average: number
}

export type WeightTrendDirection = "losing" | "maintaining" | "gaining"

export type WeightRecordLow = {
  value: number
  date: string
}

export type WeightTrendInsight = {
  currentAverage: number | null
  previousAverage: number | null
  vsPreviousLb: number | null
  direction: WeightTrendDirection | null
  recordLow: number | null
  recordLowDate: string | null
  /** Latest weigh-in matches the saved all-time low. */
  recordLowIsLatest: boolean
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

export function roundWeight(n: number): number {
  return Math.round(n * 10) / 10
}

function isYmd(value: string): boolean {
  return YMD.test(value)
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatChartLabel(ymd: string): string {
  const [, month, day] = ymd.split("-")
  return `${Number(month)}/${Number(day)}`
}

function compareYmd(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** One value per calendar day; later logs on the same day win. */
export function dedupeWeightLogs(logs: WeightLog[]): WeightLog[] {
  const byDay = new Map<string, number>()
  for (const log of logs) {
    if (!isYmd(log.date) || !Number.isFinite(log.value)) continue
    byDay.set(log.date, log.value)
  }
  return [...byDay.entries()]
    .sort((a, b) => compareYmd(a[0], b[0]))
    .map(([date, value]) => ({ date, value }))
}

/**
 * Lowest number among logs, optionally merged with a stored personal low.
 * A stored low that is still the lowest wins even if that entry is gone.
 * A newer log that undercuts the stored low replaces it.
 */
export function resolveRecordLow(
  logs: WeightLog[],
  stored: WeightRecordLow | null | undefined,
): WeightRecordLow | null {
  let fromLogs: WeightRecordLow | null = null
  for (const log of dedupeWeightLogs(logs)) {
    if (fromLogs == null || log.value < fromLogs.value) {
      fromLogs = { value: roundWeight(log.value), date: log.date }
    }
  }

  if (stored != null && isYmd(stored.date) && Number.isFinite(stored.value)) {
    const storedRound = { value: roundWeight(stored.value), date: stored.date }
    if (fromLogs == null || storedRound.value <= fromLogs.value) return storedRound
  }

  return fromLogs
}

export function shouldUpdateStoredRecordLow(
  stored: WeightRecordLow | null | undefined,
  candidate: WeightLog,
): boolean {
  if (!isYmd(candidate.date) || !Number.isFinite(candidate.value) || candidate.value <= 0) {
    return false
  }
  if (stored == null || !Number.isFinite(stored.value)) return true
  return candidate.value < stored.value
}

export function buildWeightTrendSeries(
  logs: WeightLog[],
  opts?: {
    from?: string
    to?: string
    windowDays?: number
    vacationResumeDate?: string | null
  },
): WeightTrendPoint[] {
  const windowSize = opts?.windowDays ?? WEIGHT_AVG_WINDOW_DAYS
  const skipVacation = (date: string) =>
    isVacationBlockingCalendarDay(opts?.vacationResumeDate, date)

  const usable = dedupeWeightLogs(logs).filter((log) => !skipVacation(log.date))
  if (usable.length === 0) return []

  const avgAtLog = usable.map((_, index) =>
    roundWeight(
      mean(
        usable
          .slice(Math.max(0, index - (windowSize - 1)), index + 1)
          .map((log) => log.value),
      ),
    ),
  )

  const firstLog = usable[0]!.date
  const lastLog = usable[usable.length - 1]!.date
  const from = opts?.from && isYmd(opts.from) && opts.from > firstLog ? opts.from : firstLog
  const to = opts?.to && isYmd(opts.to) && opts.to < lastLog ? opts.to : lastLog
  if (from > to) return []

  const points: WeightTrendPoint[] = []
  let logIdx = -1
  for (let date = from; date <= to; date = addDaysToYmd(date, 1)) {
    if (skipVacation(date)) continue
    while (logIdx + 1 < usable.length && usable[logIdx + 1]!.date <= date) {
      logIdx += 1
    }
    if (logIdx < 0) continue
    const log = usable[logIdx]!
    const raw = log.date === date ? log.value : null
    points.push({
      date,
      label: formatChartLabel(date),
      raw: raw != null ? roundWeight(raw) : null,
      average: avgAtLog[logIdx]!,
    })
  }
  return points
}

export function summarizeWeightTrend(
  points: WeightTrendPoint[],
  recordLow: WeightRecordLow | null,
  latestLog: WeightLog | null,
): WeightTrendInsight {
  if (points.length === 0) {
    return {
      currentAverage: null,
      previousAverage: null,
      vsPreviousLb: null,
      direction: null,
      recordLow: recordLow?.value ?? null,
      recordLowDate: recordLow?.date ?? null,
      recordLowIsLatest: false,
    }
  }

  const last = points[points.length - 1]!
  const priorDate = addDaysToYmd(last.date, -WEIGHT_AVG_WINDOW_DAYS)
  let previous: WeightTrendPoint | null = null
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i]!
    if (point.date <= priorDate) {
      previous = point
      break
    }
  }

  const currentAverage = last.average
  const previousAverage = previous?.average ?? null
  const vsPreviousLb =
    previousAverage != null ? roundWeight(currentAverage - previousAverage) : null

  let direction: WeightTrendDirection | null = null
  if (vsPreviousLb != null) {
    if (vsPreviousLb < -WEIGHT_TREND_MAINTAIN_LB) direction = "losing"
    else if (vsPreviousLb > WEIGHT_TREND_MAINTAIN_LB) direction = "gaining"
    else direction = "maintaining"
  } else {
    direction = "maintaining"
  }

  const latestValue =
    latestLog != null
      ? roundWeight(latestLog.value)
      : [...points].reverse().find((point) => point.raw != null)?.raw ?? null
  const recordLowIsLatest =
    recordLow != null &&
    latestValue != null &&
    Math.abs(latestValue - recordLow.value) < 0.05

  return {
    currentAverage,
    previousAverage,
    vsPreviousLb,
    direction,
    recordLow: recordLow?.value ?? null,
    recordLowDate: recordLow?.date ?? null,
    recordLowIsLatest,
  }
}

/** Oldest → newest rolling averages for the last `n` series points on/before `to`. */
export function sparklineAverages(
  points: WeightTrendPoint[],
  n = WEIGHT_AVG_WINDOW_DAYS,
  to?: string,
): number[] {
  const cutoff = to && isYmd(to) ? to : null
  const sliced = cutoff ? points.filter((point) => point.date <= cutoff) : points
  return sliced.slice(-n).map((point) => point.average)
}

export function sliceTrendRange(
  points: WeightTrendPoint[],
  days: number | null,
  endDate: string,
): WeightTrendPoint[] {
  if (days == null || days <= 0) return points
  const start = addDaysToYmd(endDate, -(days - 1))
  return points.filter((point) => point.date >= start && point.date <= endDate)
}
