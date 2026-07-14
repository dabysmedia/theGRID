import { addDaysYmd } from "@/lib/steps-day"

export type WorkCyclePhase = "day" | "night" | "off"

export const DEFAULT_WORK_CYCLE_ANCHOR = "2026-07-15"
export const DEFAULT_WORK_CYCLE_PATTERN: WorkCyclePhase[] = [
  "day",
  "day",
  "night",
  "night",
  "off",
  "off",
  "off",
  "off",
]
export const DEFAULT_WORKOUT_GOAL_PER_CYCLE = 3

export interface WorkCycleConfig {
  enabled?: boolean | null
  anchorDate?: string | null
  length?: number | null
  patternJson?: string | null
  goal?: number | null
}

export interface TrackingPeriod {
  mode: "rotation" | "calendar"
  startDate: string
  endDate: string
  nextStartDate: string
  dates: string[]
  labels: string[]
  length: number
  dayIndex: number
  dayNumber: number
  phase: WorkCyclePhase | "calendar"
  phaseLabel: string
  goal: number
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function ymdDayNumber(value: string): number {
  const [year, month, day] = value.split("-").map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

export function parseWorkCyclePattern(
  patternJson: string | null | undefined,
  requestedLength?: number | null,
): WorkCyclePhase[] {
  const length = Math.max(1, Math.min(31, Math.trunc(requestedLength ?? 8)))
  try {
    const parsed = JSON.parse(patternJson ?? "")
    if (
      Array.isArray(parsed) &&
      parsed.length === length &&
      parsed.every((value) => value === "day" || value === "night" || value === "off")
    ) {
      return parsed as WorkCyclePhase[]
    }
  } catch {
    // Fall through to the stable 4-on / 4-off default.
  }
  return Array.from({ length }, (_, index) => DEFAULT_WORK_CYCLE_PATTERN[index % 8])
}

function phaseOrdinal(pattern: WorkCyclePhase[], dayIndex: number): number {
  const phase = pattern[dayIndex]
  return pattern.slice(0, dayIndex + 1).filter((value) => value === phase).length
}

function rotationLabel(phase: WorkCyclePhase, ordinal: number): string {
  if (phase === "day") return `D${ordinal}`
  if (phase === "night") return `N${ordinal}`
  return `O${ordinal}`
}

function rotationPhaseLabel(phase: WorkCyclePhase, ordinal: number): string {
  if (phase === "day") return `Day shift ${ordinal}`
  if (phase === "night") return `Night shift ${ordinal}`
  return `Off day ${ordinal}`
}

/**
 * Returns the workout tracking period containing `dateKey`.
 * Rotation math is calendar-day based and remains stable across DST changes.
 */
export function getTrackingPeriod(dateKey: string, config: WorkCycleConfig): TrackingPeriod {
  const goal = Math.max(1, Math.min(14, Math.trunc(config.goal ?? DEFAULT_WORKOUT_GOAL_PER_CYCLE)))
  const anchor = config.anchorDate && DATE_RE.test(config.anchorDate)
    ? config.anchorDate
    : DEFAULT_WORK_CYCLE_ANCHOR

  if (config.enabled) {
    const length = Math.max(1, Math.min(31, Math.trunc(config.length ?? 8)))
    const pattern = parseWorkCyclePattern(config.patternJson, length)
    const daysFromAnchor = ymdDayNumber(dateKey) - ymdDayNumber(anchor)
    const dayIndex = positiveModulo(daysFromAnchor, length)
    const startDate = addDaysYmd(dateKey, -dayIndex)
    const dates = Array.from({ length }, (_, index) => addDaysYmd(startDate, index))
    const ordinal = phaseOrdinal(pattern, dayIndex)
    const phase = pattern[dayIndex]
    return {
      mode: "rotation",
      startDate,
      endDate: dates[length - 1],
      nextStartDate: addDaysYmd(startDate, length),
      dates,
      labels: pattern.map((value, index) => rotationLabel(value, phaseOrdinal(pattern, index))),
      length,
      dayIndex,
      dayNumber: dayIndex + 1,
      phase,
      phaseLabel: rotationPhaseLabel(phase, ordinal),
      goal,
    }
  }

  const jsDay = new Date(`${dateKey}T12:00:00`).getDay()
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1
  const startDate = addDaysYmd(dateKey, -dayIndex)
  const dates = Array.from({ length: 7 }, (_, index) => addDaysYmd(startDate, index))
  return {
    mode: "calendar",
    startDate,
    endDate: dates[6],
    nextStartDate: addDaysYmd(startDate, 7),
    dates,
    labels: ["M", "T", "W", "T", "F", "S", "S"],
    length: 7,
    dayIndex,
    dayNumber: dayIndex + 1,
    phase: "calendar",
    phaseLabel: "Calendar week",
    goal,
  }
}
