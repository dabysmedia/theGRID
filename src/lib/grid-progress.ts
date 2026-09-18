/**
 * GRID progression — derived (not stored) score from daily tracking + goal hits.
 * Pure helpers so the API, tests, and UI share one definition.
 */

export const GRID_PROGRESS_LOOKBACK_DAYS = 420
export const GRID_HEATMAP_WEEKS = 16
export const GRID_CHECK_IN_MIN_TRACKS = 2
export const GRID_LEVEL_XP_FACTOR = 90

export type TrackKey =
  | "calories"
  | "steps"
  | "sleep"
  | "training"
  | "weight"
  | "water"
  | "habits"
  | "journal"

export type GoalDirection = "up" | "down"

export type TrackGoal = {
  target: number
  direction: GoalDirection
}

export type ProgressGoals = {
  calories: TrackGoal
  steps: TrackGoal
  sleep: TrackGoal
  water: TrackGoal
}

export type DayValues = {
  calories: number
  steps: number
  sleepHrs: number
  workouts: number
  cardioMinutes: number
  runMiles: number
  weight: number | null
  waterOz: number
  habitsDone: number
  habitsTotal: number
  journal: boolean
}

export type TrackDayScore = {
  key: TrackKey
  logged: boolean
  goalHit: boolean
  xp: number
  value: number
}

export type DayScore = {
  date: string
  tracks: TrackDayScore[]
  xp: number
  loggedCount: number
  goalHits: number
  checkIn: boolean
  perfect: boolean
  fullLog: boolean
}

export type LevelProgress = {
  level: number
  name: string
  xp: number
  xpIntoLevel: number
  xpForNext: number
  progress: number
}

export type StreakSummary = {
  current: number
  best: number
  atRisk: boolean
}

export type HeatmapCell = {
  date: string
  xp: number
  intensity: 0 | 1 | 2 | 3 | 4
  checkIn: boolean
  perfect: boolean
  inRange: boolean
}

export type HeatmapWeek = {
  days: HeatmapCell[]
}

export type TrackSummary = {
  key: TrackKey
  label: string
  color: string
  loggedDays: number
  goalDays: number
  streak: number
  rate30: number
  enabled: boolean
}

export type Milestone = {
  id: string
  name: string
  description: string
  earned: boolean
  progress: number
}

export type TodayProgress = {
  xp: number
  maxXp: number
  checkIn: boolean
  perfect: boolean
  fullLog: boolean
  tracks: TrackDayScore[]
  cue: string
}

export type ProgressSnapshot = {
  asOf: string
  isCurrent: boolean
  level: LevelProgress
  streak: StreakSummary
  consistency30: number
  today: TodayProgress
  heatmap: HeatmapWeek[]
  tracks: TrackSummary[]
  milestones: Milestone[]
  daysLogged: number
}

export const TRACK_META: Record<
  TrackKey,
  { label: string; color: string; loggedXp: number; goalXp: number }
> = {
  calories: { label: "Calories", color: "#ef4444", loggedXp: 12, goalXp: 18 },
  steps: { label: "Steps", color: "#22c55e", loggedXp: 12, goalXp: 18 },
  sleep: { label: "Sleep", color: "#6366f1", loggedXp: 12, goalXp: 18 },
  training: { label: "Training", color: "#c4d632", loggedXp: 18, goalXp: 0 },
  weight: { label: "Weight", color: "#14b8a6", loggedXp: 10, goalXp: 0 },
  water: { label: "Water", color: "#38bdf8", loggedXp: 8, goalXp: 8 },
  habits: { label: "Habits", color: "#22c55e", loggedXp: 8, goalXp: 8 },
  journal: { label: "Journal", color: "#38bdf8", loggedXp: 8, goalXp: 0 },
}

export const TRACK_ORDER: TrackKey[] = [
  "calories",
  "steps",
  "sleep",
  "training",
  "weight",
  "water",
  "habits",
  "journal",
]

const CORE_CHECK_IN: TrackKey[] = [
  "calories",
  "steps",
  "sleep",
  "training",
  "weight",
  "water",
  "habits",
]

const PERFECT_KEYS: TrackKey[] = ["calories", "steps", "sleep"]
const FULL_LOG_MIN = 5
const CHECK_IN_BONUS_XP = 15
const PERFECT_BONUS_XP = 25
const FULL_LOG_BONUS_XP = 12

const RANK_NAMES = [
  "Spark",
  "Signal",
  "Operator",
  "Sentinel",
  "Vanguard",
  "Gridwalker",
  "Command",
  "Apex",
  "Architect",
  "Prime",
] as const

export function emptyDayValues(): DayValues {
  return {
    calories: 0,
    steps: 0,
    sleepHrs: 0,
    workouts: 0,
    cardioMinutes: 0,
    runMiles: 0,
    weight: null,
    waterOz: 0,
    habitsDone: 0,
    habitsTotal: 0,
    journal: false,
  }
}

export function isGoalHit(
  value: number,
  target: number,
  direction: GoalDirection,
  logged: boolean,
): boolean {
  if (!logged || !(target > 0)) return false
  if (direction === "down") return value > 0 && value <= target
  return value >= target
}

export function rankName(level: number): string {
  const n = Math.max(1, Math.floor(level))
  if (n <= RANK_NAMES.length) return RANK_NAMES[n - 1]
  return `${RANK_NAMES[RANK_NAMES.length - 1]} ${n}`
}

/** Cumulative XP required to *reach* this level (level 1 = 0). */
export function xpThresholdForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level))
  return GRID_LEVEL_XP_FACTOR * (n - 1) * (n - 1)
}

export function levelFromXp(xp: number): LevelProgress {
  const safe = Math.max(0, Math.floor(xp))
  const level = Math.max(1, Math.floor(Math.sqrt(safe / GRID_LEVEL_XP_FACTOR)) + 1)
  const current = xpThresholdForLevel(level)
  const next = xpThresholdForLevel(level + 1)
  const span = Math.max(1, next - current)
  const into = Math.max(0, safe - current)
  return {
    level,
    name: rankName(level),
    xp: safe,
    xpIntoLevel: into,
    xpForNext: span,
    progress: Math.min(1, into / span),
  }
}

export function theoreticalMaxXp(enabled: TrackKey[]): number {
  let xp = CHECK_IN_BONUS_XP + PERFECT_BONUS_XP + FULL_LOG_BONUS_XP
  for (const key of enabled) {
    const meta = TRACK_META[key]
    xp += meta.loggedXp + meta.goalXp
  }
  return xp
}

function trainingLogged(day: DayValues): boolean {
  return day.workouts > 0 || day.cardioMinutes > 0 || day.runMiles > 0
}

export function scoreDay(
  date: string,
  day: DayValues,
  goals: ProgressGoals,
  enabled: TrackKey[],
): DayScore {
  const enabledSet = new Set(enabled)
  const tracks: TrackDayScore[] = []

  const push = (key: TrackKey, logged: boolean, goalHit: boolean, value: number) => {
    if (!enabledSet.has(key)) return
    const meta = TRACK_META[key]
    const xp = (logged ? meta.loggedXp : 0) + (goalHit ? meta.goalXp : 0)
    tracks.push({ key, logged, goalHit, xp, value })
  }

  const calLogged = day.calories > 0
  push(
    "calories",
    calLogged,
    isGoalHit(day.calories, goals.calories.target, goals.calories.direction, calLogged),
    day.calories,
  )

  const stepsLogged = day.steps > 0
  push(
    "steps",
    stepsLogged,
    isGoalHit(day.steps, goals.steps.target, goals.steps.direction, stepsLogged),
    day.steps,
  )

  const sleepLogged = day.sleepHrs > 0
  push(
    "sleep",
    sleepLogged,
    isGoalHit(day.sleepHrs, goals.sleep.target, goals.sleep.direction, sleepLogged),
    day.sleepHrs,
  )

  const trained = trainingLogged(day)
  push("training", trained, trained, day.workouts + (day.cardioMinutes > 0 ? 1 : 0))

  const weighed = day.weight != null && day.weight > 0
  push("weight", weighed, weighed, day.weight ?? 0)

  const waterLogged = day.waterOz > 0
  push(
    "water",
    waterLogged,
    isGoalHit(day.waterOz, goals.water.target, goals.water.direction, waterLogged),
    day.waterOz,
  )

  const habitsEnabled = day.habitsTotal > 0
  if (habitsEnabled || enabledSet.has("habits")) {
    const habitLogged = day.habitsDone > 0
    const habitGoal = habitsEnabled && day.habitsDone >= day.habitsTotal
    push("habits", habitLogged, habitGoal, day.habitsDone)
  }

  push("journal", day.journal, day.journal, day.journal ? 1 : 0)

  const loggedCount = tracks.filter((t) => t.logged).length
  const goalHits = tracks.filter((t) => t.goalHit).length
  const coreLogged = tracks.filter((t) => t.logged && CORE_CHECK_IN.includes(t.key)).length
  const checkIn = coreLogged >= GRID_CHECK_IN_MIN_TRACKS
  const perfect =
    PERFECT_KEYS.every((key) => tracks.find((t) => t.key === key)?.goalHit) &&
    PERFECT_KEYS.every((key) => enabledSet.has(key))
  const fullLog = loggedCount >= FULL_LOG_MIN

  let xp = tracks.reduce((sum, t) => sum + t.xp, 0)
  if (checkIn) xp += CHECK_IN_BONUS_XP
  if (perfect) xp += PERFECT_BONUS_XP
  if (fullLog) xp += FULL_LOG_BONUS_XP

  return {
    date,
    tracks,
    xp,
    loggedCount,
    goalHits,
    checkIn,
    perfect,
    fullLog,
  }
}

export function addDaysYmdSafe(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(dt.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

export function enumerateDaysInclusive(from: string, to: string): string[] {
  if (from > to) return []
  const days: string[] = []
  let cursor = from
  while (cursor <= to) {
    days.push(cursor)
    cursor = addDaysYmdSafe(cursor, 1)
  }
  return days
}

/** Monday (ISO) on or before the given YYYY-MM-DD key. */
export function mondayOnOrBefore(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const dow = dt.getUTCDay()
  const delta = dow === 0 ? 6 : dow - 1
  return addDaysYmdSafe(ymd, -delta)
}

export function heatmapIntensity(xp: number, checkIn: boolean, perfect: boolean): 0 | 1 | 2 | 3 | 4 {
  if (xp <= 0) return 0
  if (perfect || xp >= 110) return 4
  if (xp >= 70) return 3
  if (xp >= 40 || checkIn) return 2
  return 1
}

export function computeStreaks(
  scores: DayScore[],
  asOf: string,
  isCurrent: boolean,
): StreakSummary {
  const byDate = new Map(scores.map((s) => [s.date, s]))
  const today = byDate.get(asOf)
  const grace = isCurrent && !(today?.checkIn)
  const start = grace ? addDaysYmdSafe(asOf, -1) : asOf

  let current = 0
  let cursor = start
  while (true) {
    const row = byDate.get(cursor)
    if (!row?.checkIn) break
    current++
    cursor = addDaysYmdSafe(cursor, -1)
    if (current > 2000) break
  }

  let best = 0
  let run = 0
  for (const row of scores) {
    if (row.date > asOf) continue
    if (row.checkIn) {
      run++
      if (run > best) best = run
    } else {
      run = 0
    }
  }

  return {
    current,
    best: Math.max(best, current),
    atRisk: grace && current > 0,
  }
}

export function trackStreak(scores: DayScore[], key: TrackKey, asOf: string): number {
  const byDate = new Map(scores.map((s) => [s.date, s]))
  let streak = 0
  let cursor = asOf
  const today = byDate.get(asOf)?.tracks.find((t) => t.key === key)
  if (!today?.logged) cursor = addDaysYmdSafe(asOf, -1)
  while (true) {
    const track = byDate.get(cursor)?.tracks.find((t) => t.key === key)
    if (!track?.logged) break
    streak++
    cursor = addDaysYmdSafe(cursor, -1)
    if (streak > 2000) break
  }
  return streak
}

export function buildHeatmap(
  scores: DayScore[],
  asOf: string,
  weeks = GRID_HEATMAP_WEEKS,
): HeatmapWeek[] {
  const byDate = new Map(scores.map((s) => [s.date, s]))
  const endMonday = mondayOnOrBefore(asOf)
  const start = addDaysYmdSafe(endMonday, -((weeks - 1) * 7))
  const result: HeatmapWeek[] = []
  for (let w = 0; w < weeks; w++) {
    const weekStart = addDaysYmdSafe(start, w * 7)
    const days: HeatmapCell[] = []
    for (let i = 0; i < 7; i++) {
      const date = addDaysYmdSafe(weekStart, i)
      const inRange = date <= asOf
      const row = byDate.get(date)
      const xp = inRange ? (row?.xp ?? 0) : 0
      const checkIn = inRange ? Boolean(row?.checkIn) : false
      const perfect = inRange ? Boolean(row?.perfect) : false
      days.push({
        date,
        xp,
        intensity: inRange ? heatmapIntensity(xp, checkIn, perfect) : 0,
        checkIn,
        perfect,
        inRange,
      })
    }
    result.push({ days })
  }
  return result
}

function rate30(scores: DayScore[], asOf: string, predicate: (row: DayScore) => boolean): number {
  const from = addDaysYmdSafe(asOf, -29)
  const window = scores.filter((s) => s.date >= from && s.date <= asOf)
  if (window.length === 0) return 0
  const hits = window.filter(predicate).length
  return Math.round((hits / window.length) * 100)
}

export function summarizeTracks(
  scores: DayScore[],
  asOf: string,
  enabled: TrackKey[],
): TrackSummary[] {
  const from = addDaysYmdSafe(asOf, -29)
  const window = scores.filter((s) => s.date >= from && s.date <= asOf)
  return TRACK_ORDER.filter((key) => enabled.includes(key)).map((key) => {
    const meta = TRACK_META[key]
    const loggedDays = window.filter((s) => s.tracks.find((t) => t.key === key)?.logged).length
    const goalDays = window.filter((s) => s.tracks.find((t) => t.key === key)?.goalHit).length
    return {
      key,
      label: meta.label,
      color: meta.color,
      loggedDays,
      goalDays,
      streak: trackStreak(scores, key, asOf),
      rate30: window.length ? Math.round((loggedDays / window.length) * 100) : 0,
      enabled: true,
    }
  })
}

export function todayCue(today: DayScore, streak: StreakSummary, isCurrent: boolean): string {
  if (!isCurrent) {
    if (today.perfect) return "Perfect day on the archive."
    if (today.checkIn) return "Checked in. Grid held."
    return "No check-in on this day."
  }
  if (today.perfect) return "Perfect day. The grid is lit."
  if (streak.atRisk) {
    return `Log two tracks to keep the ${streak.current}-day streak.`
  }
  if (!today.checkIn) return "Log two tracks to light today."
  if (!today.tracks.find((t) => t.key === "sleep")?.goalHit) {
    return "Hit your sleep goal for a Perfect Day."
  }
  if (!today.tracks.find((t) => t.key === "steps")?.goalHit) {
    return "Hit your step goal for a Perfect Day."
  }
  if (!today.tracks.find((t) => t.key === "calories")?.goalHit) {
    return "Finish calories inside the target for a Perfect Day."
  }
  return "Checked in. Keep stacking the grid."
}

export function evaluateMilestones(
  scores: DayScore[],
  asOf: string,
  level: LevelProgress,
  streak: StreakSummary,
  consistency30: number,
): Milestone[] {
  const through = scores.filter((s) => s.date <= asOf)
  const checkIns = through.filter((s) => s.checkIn).length
  const perfectDays = through.filter((s) => s.perfect).length
  const fullLogs = through.filter((s) => s.fullLog).length
  const bestTrackStreak = Math.max(
    0,
    ...TRACK_ORDER.map((key) => trackStreak(through, key, asOf)),
  )

  const pct = (value: number, target: number) =>
    target <= 0 ? 0 : Math.min(1, value / target)

  return [
    {
      id: "first_spark",
      name: "First spark",
      description: "Check in for the first time",
      earned: checkIns >= 1,
      progress: pct(checkIns, 1),
    },
    {
      id: "streak_7",
      name: "Week warrior",
      description: "Hold a 7-day check-in streak",
      earned: streak.best >= 7,
      progress: pct(streak.best, 7),
    },
    {
      id: "streak_30",
      name: "Month of fire",
      description: "Hold a 30-day check-in streak",
      earned: streak.best >= 30,
      progress: pct(streak.best, 30),
    },
    {
      id: "perfect_day",
      name: "Perfect day",
      description: "Hit calories, steps, and sleep in one day",
      earned: perfectDays >= 1,
      progress: pct(perfectDays, 1),
    },
    {
      id: "full_log",
      name: "Full grid",
      description: "Log five tracks in a single day",
      earned: fullLogs >= 1,
      progress: pct(fullLogs, 1),
    },
    {
      id: "consistency_80",
      name: "Signal lock",
      description: "Check in on 80% of the last 30 days",
      earned: consistency30 >= 80,
      progress: pct(consistency30, 80),
    },
    {
      id: "level_5",
      name: "Vanguard",
      description: "Reach GRID level 5",
      earned: level.level >= 5,
      progress: pct(level.level, 5),
    },
    {
      id: "track_streak_14",
      name: "One-track mind",
      description: "Log the same track 14 days in a row",
      earned: bestTrackStreak >= 14,
      progress: pct(bestTrackStreak, 14),
    },
  ]
}

export function assembleProgressSnapshot(input: {
  asOf: string
  isCurrent: boolean
  rangeStart: string
  days: Map<string, DayValues>
  goals: ProgressGoals
  enabledTracks: TrackKey[]
}): ProgressSnapshot {
  const keys = enumerateDaysInclusive(input.rangeStart, input.asOf)
  const scores = keys.map((date) =>
    scoreDay(date, input.days.get(date) ?? emptyDayValues(), input.goals, input.enabledTracks),
  )
  const byDate = new Map(scores.map((s) => [s.date, s]))
  const today = byDate.get(input.asOf) ?? scoreDay(
    input.asOf,
    emptyDayValues(),
    input.goals,
    input.enabledTracks,
  )
  const totalXp = scores.reduce((sum, s) => sum + s.xp, 0)
  const level = levelFromXp(totalXp)
  const streak = computeStreaks(scores, input.asOf, input.isCurrent)
  const consistency30 = rate30(scores, input.asOf, (row) => row.checkIn)
  const tracks = summarizeTracks(scores, input.asOf, input.enabledTracks)
  const heatmap = buildHeatmap(scores, input.asOf)
  const milestones = evaluateMilestones(scores, input.asOf, level, streak, consistency30)

  return {
    asOf: input.asOf,
    isCurrent: input.isCurrent,
    level,
    streak,
    consistency30,
    today: {
      xp: today.xp,
      maxXp: theoreticalMaxXp(input.enabledTracks),
      checkIn: today.checkIn,
      perfect: today.perfect,
      fullLog: today.fullLog,
      tracks: today.tracks,
      cue: todayCue(today, streak, input.isCurrent),
    },
    heatmap,
    tracks,
    milestones,
    daysLogged: scores.filter((s) => s.loggedCount > 0).length,
  }
}
