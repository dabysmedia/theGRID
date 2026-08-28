import "server-only"

import { dailySleepDurationHours, resolveSleepNightEntry } from "@/lib/sleepDuration"
import { localTimeParts } from "@/lib/notifications/server/local-time"
import {
  agentTodayKey,
  resolveAgentTimezone,
  storedEntryDayKey,
} from "@/lib/agent/timezone"
import { toAgentJson } from "@/lib/agent/serialize"
import { kmToMiles } from "@/lib/units"
import {
  buildWeightAnalytics,
  formatMealLine,
  formatPeptideDailyLines,
  formatPeptideInjectionLines,
  formatCardioLine,
  formatHeartRateDayLines,
  formatRecoveryLine,
  formatRunLine,
  formatVitalLine,
  formatSleepLine,
  formatStepsLines,
  formatTemplateBlock,
  formatWeightLines,
  formatWorkoutSessionBlock,
  parseJsonArray,
  sessionVolumeLb,
  truncate,
} from "@/lib/agent/verbose-format"
import { formatTrainingSplitLines } from "@/lib/agent/training-context"
import {
  buildLiftProgression,
  formatLiftProgressionLines,
  COMPLETED_SESSION_STATUS,
} from "@/lib/agent/lift-progression"

export type AgentPeriodKey = "today" | "thisWeek" | "thisMonth"

export interface PeriodRange {
  from: string
  to: string
  label: string
}

export interface AgentRawData {
  calorieEntries: Array<{
    date: Date
    mealType: string
    description: string | null
    calories: number
    protein: number | null
    carbs: number | null
    fat: number | null
    createdAt: Date
  }>
  stepEntries: Array<{ date: Date; count: number }>
  runEntries: Array<{
    date: Date
    distance: number
    duration: number
    environment: string
    notes: string | null
  }>
  workoutSessions: Array<{
    name: string
    date: Date
    startedAt: Date
    finishedAt: Date | null
    duration: number | null
    status: string
    bodyWeightLb: number | null
    notes: string | null
    exercises: string
  }>
  workoutEntries: Array<{
    date: Date
    type: string
    name: string
    duration: number | null
    notes: string | null
  }>
  workoutTemplates: Array<{
    name: string
    exercises: string
    tags: string
    sortOrder: number
  }>
  savedMeals: Array<{
    name: string
    mealType: string
    calories: number
    protein: number | null
    carbs: number | null
    fat: number | null
    useCount: number
  }>
  sleepEntries: Array<{
    date: Date
    bedtime: Date
    wakeTime: Date
    quality: number
    notes: string | null
  }>
  peptideEntries: Array<{
    date: Date
    injectedAt: Date
    compound: string
    doseMg: number
    injectionSite: string
    sideEffectsJson: string
    notes: string | null
  }>
  peptideDailyEntries: Array<{
    date: Date
    hungerLevel: number
    sideEffectsJson: string
    notes: string | null
  }>
  alcoholEntries: Array<{ date: Date; drinkType: string; quantity: number; units: number }>
  bowelEntries: Array<{
    date: Date
    time: Date
    bristolScale: number
    notes: string | null
  }>
  journalEntries: Array<{
    date: Date
    mood: number | null
    content: string
    images: string
    attachedStats: string
  }>
  recoveryDailyEntries: Array<{
    date: Date
    pain: number
    energy: number
    mood: number
    soreness: number
    stress: number
    mobility: number
    sleepFeel: number
    domsJson: string
    notes: string | null
  }>
  treatmentLogs: Array<{
    date: Date
    treatmentKey: string
    completed: boolean
    notes: string | null
  }>
  habits: Array<{
    id: string
    name: string
    frequency: string
    icon: string
    color: string
    archived: boolean
    completions: Array<{ date: Date }>
  }>
  longGoals: Array<{
    name: string
    category: string
    target: number
    unit: string
    direction: string
    startValue: number | null
    entries: Array<{ date: Date; value: number; notes: string | null }>
  }>
  goals: Array<{
    category: string
    goalType: string
    direction: string
    target: number
    unit: string
    active: boolean
  }>
  injuryRecords: Array<{
    conditionKey: string
    customLabel: string | null
    kind: string
    severity: string
    status: string
    bodyRegion: string | null
    bodySegmentKeysJson: string
    onsetDate: Date
    resolvedAt: Date | null
    notes: string | null
  }>

  /** Training configuration the user actually trains against. */
  profile: {
    trainingSplit: string
    trainingStyle: string
    workCycleEnabled: boolean
    workCycleAnchorDate: string | null
    workCycleLength: number
    workCyclePatternJson: string
    workoutGoalPerCycle: number
    birthDate: string | null
  }
  cardioEntries: Array<{
    date: Date
    startTime: Date
    endTime: Date
    activityType: string
    displayName: string | null
    minutes: number
    calories: number | null
    distanceMeters: number | null
    avgHeartRate: number | null
    activeZoneMinutes: number | null
    source: string | null
    notes: string | null
  }>
  vitalEntries: Array<{
    date: Date
    restingHeartRate: number | null
    hrvMs: number | null
    hrAvg: number | null
    hrMin: number | null
    hrMax: number | null
    zonesJson: string
    thresholdsJson: string
    source: string | null
  }>
  heartRateSamples: Array<{ date: Date; time: Date; bpm: number }>
  waterEntries: Array<{ date: Date; amountOz: number }>
  recipes: Array<{
    name: string
    mealType: string
    calories: number
    protein: number | null
    carbs: number | null
    fat: number | null
    useCount: number
    ingredients: Array<{
      name: string
      calories: number
      protein: number | null
      portionAmount: number
      portionUnit: string
    }>
  }>
}

export interface PeriodSlice {
  range: PeriodRange
  entries: Record<string, unknown>
  totals: Record<string, unknown>
}

export interface AgentPeriodRollups {
  timezone: string
  todayKey: string
  /** Routines, saved meals, habits, weight all-time — same as visible in the app library */
  catalog: Record<string, unknown>
  today: PeriodSlice
  thisWeek: PeriodSlice
  thisMonth: PeriodSlice
  /** Plain-text TODAY / THIS WEEK / THIS MONTH blocks for LLMs */
  narrative: string
}

function subtractLocalDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const t = Date.UTC(y, m - 1, d, 12, 0, 0) - days * 86_400_000
  const x = new Date(t)
  const yy = x.getUTCFullYear()
  const mm = String(x.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(x.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

function localWeekStartKey(todayKey: string, timeZone: string): string {
  const [y, m, d] = todayKey.split("-").map(Number)
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const { weekday } = localTimeParts(anchor, timeZone)
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1
  return subtractLocalDays(todayKey, daysSinceMonday)
}

function monthStartKey(todayKey: string): string {
  return `${todayKey.slice(0, 7)}-01`
}

function inRange(key: string, from: string, to: string): boolean {
  if (!key) return false
  return key >= from && key <= to
}

function dayKey(date: Date): string {
  return storedEntryDayKey(date)
}

function sum(nums: number[]): number {
  return nums.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0)
}

function avg(nums: number[]): number {
  const f = nums.filter((n) => Number.isFinite(n))
  if (f.length === 0) return 0
  return sum(f) / f.length
}

type Bounds = { from: string; to: string }

function filterByDayKey<T extends { date: Date }>(rows: T[], bounds: Bounds): T[] {
  return rows.filter((r) => inRange(dayKey(r.date), bounds.from, bounds.to))
}

function filterHabitCompletions(
  habits: AgentRawData["habits"],
  bounds: Bounds
): Array<{ habitName: string; frequency: string; dates: string[] }> {
  return habits.map((h) => {
    const dates = h.completions
      .map((c) => dayKey(c.date))
      .filter((k) => inRange(k, bounds.from, bounds.to))
      .sort()
    return { habitName: h.name, frequency: h.frequency, dates }
  })
}

function buildTotals(raw: AgentRawData, bounds: Bounds, todayKey: string) {
  const calories = filterByDayKey(raw.calorieEntries, bounds)
  const steps = filterByDayKey(raw.stepEntries, bounds)
  const runs = filterByDayKey(raw.runEntries, bounds)
  const workouts = filterByDayKey(raw.workoutSessions, bounds)
  const sleep = filterByDayKey(raw.sleepEntries, bounds)
  const alcohol = filterByDayKey(raw.alcoholEntries, bounds)
  const bowel = filterByDayKey(raw.bowelEntries, bounds)
  const journal = filterByDayKey(raw.journalEntries, bounds)
  const recovery = filterByDayKey(raw.recoveryDailyEntries, bounds)
  const peptides = filterByDayKey(raw.peptideEntries, bounds)
  const peptideDaily = filterByDayKey(raw.peptideDailyEntries, bounds)
  const treatments = filterByDayKey(raw.treatmentLogs, bounds)
  const cardio = filterByDayKey(raw.cardioEntries, bounds)
  const vitals = filterByDayKey(raw.vitalEntries, bounds)
  const hrSamples = filterByDayKey(raw.heartRateSamples, bounds)
  const water = filterByDayKey(raw.waterEntries, bounds)
  const completedWorkouts = workouts.filter((w) => w.status === COMPLETED_SESSION_STATUS)

  const calsByDay: Record<string, number> = {}
  const proteinByDay: Record<string, number> = {}
  for (const c of calories) {
    const k = dayKey(c.date)
    calsByDay[k] = (calsByDay[k] ?? 0) + c.calories
    proteinByDay[k] = (proteinByDay[k] ?? 0) + (c.protein ?? 0)
  }

  const weightGoal = raw.longGoals.find((g) => g.category === "bodyweight")
  const stepGoal = raw.goals.find((g) => g.active && g.category === "steps")
  const weightAnalytics = buildWeightAnalytics(
    weightGoal
      ? {
          name: weightGoal.name,
          target: weightGoal.target,
          unit: weightGoal.unit,
          direction: weightGoal.direction,
          startValue: weightGoal.startValue,
          entries: weightGoal.entries,
        }
      : undefined,
    bounds,
    todayKey
  )

  const legacyWorkouts = filterByDayKey(raw.workoutEntries, bounds)
  const sleepByDay = new Map<string, typeof sleep>()
  for (const s of sleep) {
    const key = dayKey(s.date)
    const bucket = sleepByDay.get(key)
    if (bucket) bucket.push(s)
    else sleepByDay.set(key, [s])
  }
  const sleepNights = Array.from(sleepByDay.entries()).map(([date, items]) => {
    const primary = resolveSleepNightEntry(items) ?? items[0]!
    return {
      date,
      hours: dailySleepDurationHours(items),
      quality: primary.quality,
      bedtime: primary.bedtime.toISOString(),
      wakeTime: primary.wakeTime.toISOString(),
      notes: primary.notes,
    }
  })
  const sleepHrs = sleepNights.map((s) => s.hours).filter((h) => h > 0)

  return {
    nutrition: {
      totalCalories: sum(calories.map((c) => c.calories)),
      totalProteinG: sum(calories.map((c) => c.protein ?? 0)),
      totalCarbsG: sum(calories.map((c) => c.carbs ?? 0)),
      totalFatG: sum(calories.map((c) => c.fat ?? 0)),
      mealCount: calories.length,
      daysWithFood: Object.keys(calsByDay).length,
      dailyCalories: calsByDay,
      dailyProteinG: proteinByDay,
    },
    steps: {
      total: sum(steps.map((s) => s.count)),
      daysLogged: steps.length,
      dailyAvg: steps.length ? Math.round(sum(steps.map((s) => s.count)) / steps.length) : 0,
      daily: Object.fromEntries(steps.map((s) => [dayKey(s.date), s.count])),
      goal: stepGoal
        ? { target: stepGoal.target, goalType: stepGoal.goalType, unit: stepGoal.unit }
        : null,
      days: steps.map((s) => ({ date: dayKey(s.date), count: s.count })),
    },
    runs: {
      count: runs.length,
      // RunEntry.distance is stored in km and duration in minutes (see units.ts
      // and the running page); the export reports miles like the rest of the app.
      totalMiles: Math.round(kmToMiles(sum(runs.map((r) => r.distance))) * 10) / 10,
      totalMinutes: Math.round(sum(runs.map((r) => r.duration))),
      items: runs.map((r) => {
        const miles = kmToMiles(r.distance)
        return {
          date: dayKey(r.date),
          distanceMi: Math.round(miles * 100) / 100,
          distanceKm: r.distance,
          durationMin: r.duration,
          paceMinPerMi: miles > 0 ? Math.round((r.duration / miles) * 10) / 10 : null,
          environment: r.environment,
          notes: r.notes,
        }
      }),
    },
    workouts: {
      sessionCount: workouts.length,
      // Only completed sessions are real training — see lift-progression.ts.
      completedSessionCount: completedWorkouts.length,
      legacyEntryCount: legacyWorkouts.length,
      totalVolumeLb: sum(completedWorkouts.map((w) => sessionVolumeLb(w.exercises))),
      liftProgression: buildLiftProgression(workouts, raw.workoutSessions),
      sessions: workouts.map((w) => ({
        date: dayKey(w.date),
        name: w.name,
        status: w.status,
        // Stored in minutes already (workouts page divides elapsed ms by 60000).
        durationMin: w.duration ?? null,
        bodyWeightLb: w.bodyWeightLb,
        volumeLb: sessionVolumeLb(w.exercises),
        notes: w.notes,
        startedAt: w.startedAt.toISOString(),
        finishedAt: w.finishedAt?.toISOString() ?? null,
        exercises: w.exercises,
      })),
      legacyEntries: legacyWorkouts.map((w) => ({
        date: dayKey(w.date),
        type: w.type,
        name: w.name,
        durationMin: w.duration ?? null,
        notes: w.notes,
      })),
    },
    sleep: {
      nights: sleepNights.length,
      avgHours: Math.round(avg(sleepHrs) * 10) / 10,
      avgQuality: Math.round(avg(sleepNights.map((s) => s.quality)) * 10) / 10,
      items: sleepNights,
    },
    bodyweight: weightAnalytics,
    habits: filterHabitCompletions(raw.habits, bounds),
    journal: journal.map((j) => ({
      date: dayKey(j.date),
      mood: j.mood,
      content: j.content,
      images: j.images,
      attachedStats: j.attachedStats,
    })),
    recovery: recovery.map((r) => ({
      date: dayKey(r.date),
      pain: r.pain,
      energy: r.energy,
      mood: r.mood,
      soreness: r.soreness,
      stress: r.stress,
      mobility: r.mobility,
      sleepFeel: r.sleepFeel,
      domsJson: r.domsJson,
      notes: r.notes,
    })),
    alcohol: {
      drinks: alcohol.length,
      totalUnits: Math.round(sum(alcohol.map((a) => a.units)) * 10) / 10,
      items: alcohol.map((a) => ({
        date: dayKey(a.date),
        drinkType: a.drinkType,
        quantity: a.quantity,
        units: a.units,
      })),
    },
    bowel: {
      count: bowel.length,
      avgBristol: Math.round(avg(bowel.map((b) => b.bristolScale)) * 10) / 10,
      items: bowel.map((b) => ({
        date: dayKey(b.date),
        time: b.time.toISOString(),
        bristolScale: b.bristolScale,
        notes: b.notes,
      })),
    },
    peptides: {
      injections: peptides.length,
      items: peptides,
      daily: peptideDaily,
    },
    treatments: treatments.map((t) => ({
      date: dayKey(t.date),
      treatmentKey: t.treatmentKey,
      completed: t.completed,
    })),
    cardio: {
      sessions: cardio.length,
      totalMinutes: Math.round(sum(cardio.map((c) => c.minutes))),
      totalCalories: Math.round(sum(cardio.map((c) => c.calories ?? 0))),
      totalMiles:
        Math.round((sum(cardio.map((c) => c.distanceMeters ?? 0)) / 1609.344) * 100) / 100,
      totalActiveZoneMinutes: sum(cardio.map((c) => c.activeZoneMinutes ?? 0)),
      items: cardio.map((c) => ({
        date: dayKey(c.date),
        activityType: c.activityType,
        displayName: c.displayName,
        minutes: c.minutes,
        calories: c.calories,
        distanceMeters: c.distanceMeters,
        distanceMi:
          c.distanceMeters != null ? Math.round((c.distanceMeters / 1609.344) * 100) / 100 : null,
        avgHeartRate: c.avgHeartRate,
        activeZoneMinutes: c.activeZoneMinutes,
        startedAt: c.startTime.toISOString(),
        endedAt: c.endTime.toISOString(),
        source: c.source,
        notes: c.notes,
      })),
    },
    vitals: {
      daysLogged: vitals.length,
      avgRestingHeartRate: Math.round(
        avg(vitals.map((v) => v.restingHeartRate).filter((n): n is number => n != null))
      ),
      avgHrvMs: Math.round(avg(vitals.map((v) => v.hrvMs).filter((n): n is number => n != null))),
      days: vitals.map((v) => ({
        date: dayKey(v.date),
        restingHeartRate: v.restingHeartRate,
        hrvMs: v.hrvMs,
        hrAvg: v.hrAvg,
        hrMin: v.hrMin,
        hrMax: v.hrMax,
        zones: parseJsonArray<{ zone: string; minutes: number }>(v.zonesJson),
        thresholds: parseJsonArray<{ zone: string; minBpm: number; maxBpm: number }>(
          v.thresholdsJson
        ),
        source: v.source,
      })),
    },
    heartRate: buildHeartRateTotals(hrSamples),
    water: {
      totalOz: Math.round(sum(water.map((w) => w.amountOz)) * 10) / 10,
      entries: water.length,
      daily: water.reduce<Record<string, number>>((acc, w) => {
        const k = dayKey(w.date)
        acc[k] = Math.round(((acc[k] ?? 0) + w.amountOz) * 10) / 10
        return acc
      }, {}),
    },
  }
}

/** Per-day min/avg/max plus hourly means — full samples stay in `entries`. */
function buildHeartRateTotals(samples: AgentRawData["heartRateSamples"]) {
  const byDay = new Map<string, number[]>()
  for (const s of samples) {
    const k = dayKey(s.date)
    const bucket = byDay.get(k)
    if (bucket) bucket.push(s.bpm)
    else byDay.set(k, [s.bpm])
  }
  return {
    sampleCount: samples.length,
    daysLogged: byDay.size,
    days: Array.from(byDay.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, bpms]) => ({
        date,
        samples: bpms.length,
        avgBpm: Math.round(avg(bpms)),
        minBpm: Math.min(...bpms),
        maxBpm: Math.max(...bpms),
      })),
  }
}

function buildEntries(raw: AgentRawData, bounds: Bounds): Record<string, unknown> {
  return toAgentJson({
    calorieEntries: filterByDayKey(raw.calorieEntries, bounds),
    stepEntries: filterByDayKey(raw.stepEntries, bounds),
    runEntries: filterByDayKey(raw.runEntries, bounds),
    workoutSessions: filterByDayKey(raw.workoutSessions, bounds),
    workoutEntries: filterByDayKey(raw.workoutEntries, bounds),
    sleepEntries: filterByDayKey(raw.sleepEntries, bounds),
    alcoholEntries: filterByDayKey(raw.alcoholEntries, bounds),
    bowelEntries: filterByDayKey(raw.bowelEntries, bounds),
    journalEntries: filterByDayKey(raw.journalEntries, bounds),
    recoveryDailyEntries: filterByDayKey(raw.recoveryDailyEntries, bounds),
    peptideEntries: filterByDayKey(raw.peptideEntries, bounds),
    peptideDailyEntries: filterByDayKey(raw.peptideDailyEntries, bounds),
    treatmentLogs: filterByDayKey(raw.treatmentLogs, bounds),
    cardioEntries: filterByDayKey(raw.cardioEntries, bounds),
    vitalDailyEntries: filterByDayKey(raw.vitalEntries, bounds),
    heartRateSamples: filterByDayKey(raw.heartRateSamples, bounds),
    waterEntries: filterByDayKey(raw.waterEntries, bounds),
    habitCompletions: filterHabitCompletions(raw.habits, bounds),
    bodyweightEntries: (raw.longGoals.find((g) => g.category === "bodyweight")?.entries ?? []).filter(
      (e) => inRange(dayKey(e.date), bounds.from, bounds.to)
    ),
  })
}

function buildCatalog(raw: AgentRawData, todayKey: string): Record<string, unknown> {
  const weightGoal = raw.longGoals.find((g) => g.category === "bodyweight")
  const allWeight = buildWeightAnalytics(
    weightGoal
      ? {
          name: weightGoal.name,
          target: weightGoal.target,
          unit: weightGoal.unit,
          direction: weightGoal.direction,
          startValue: weightGoal.startValue,
          entries: weightGoal.entries,
        }
      : undefined,
    null,
    todayKey
  )


  return {
    workoutRoutines: raw.workoutTemplates.map((t) => ({
      name: t.name,
      tags: t.tags,
      sortOrder: t.sortOrder,
      exercises: t.exercises,
    })),
    savedMeals: raw.savedMeals.slice(0, 40),
    recipes: raw.recipes,
    habits: raw.habits.map((h) => ({
      name: h.name,
      frequency: h.frequency,
      icon: h.icon,
      color: h.color,
      archived: h.archived,
      totalCompletions: h.completions.length,
    })),
    longGoals: raw.longGoals.map((g) => ({
      name: g.name,
      category: g.category,
      target: g.target,
      unit: g.unit,
      direction: g.direction,
      startValue: g.startValue,
      entryCount: g.entries.length,
    })),
    bodyweightAllTime: allWeight,
    injuries: raw.injuryRecords.map((i) => ({
      label: i.customLabel || i.conditionKey,
      kind: i.kind,
      severity: i.severity,
      status: i.status,
      bodyRegion: i.bodyRegion,
      segmentKeys: i.bodySegmentKeysJson,
      onsetDate: dayKey(i.onsetDate),
      resolvedAt: i.resolvedAt ? dayKey(i.resolvedAt) : null,
      notes: i.notes,
    })),
  }
}

function narrativeSection(
  title: string,
  range: PeriodRange,
  raw: AgentRawData,
  totals: ReturnType<typeof buildTotals>
): string[] {
  const lines: string[] = []
  const bounds = { from: range.from, to: range.to }
  lines.push(`=== ${title} (${range.from} → ${range.to}) ===`)

  const n = totals.nutrition as {
    totalCalories: number
    totalProteinG: number
    totalCarbsG: number
    totalFatG: number
    mealCount: number
    daysWithFood: number
  }
  if (n.mealCount > 0) {
    lines.push(
      `Food: ${n.totalCalories} kcal, ${Math.round(n.totalProteinG)}P / ${Math.round(n.totalCarbsG)}C / ${Math.round(n.totalFatG)}F g, ${n.mealCount} items, ${n.daysWithFood} day(s).`
    )
    for (const m of filterByDayKey(raw.calorieEntries, bounds).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    )) {
      lines.push(formatMealLine(m))
    }
  } else {
    lines.push("Food: (none logged)")
  }

  const stepGoal = raw.goals.find((g) => g.active && g.category === "steps")
  lines.push(
    ...formatStepsLines(filterByDayKey(raw.stepEntries, bounds), stepGoal, "Steps")
  )

  const runs = filterByDayKey(raw.runEntries, bounds)
  if (runs.length > 0) {
    const rt = totals.runs as { totalMiles: number; totalMinutes: number }
    lines.push(`Runs: ${runs.length}, ${rt.totalMiles} mi, ${rt.totalMinutes} min`)
    for (const r of runs) lines.push(formatRunLine(r))
  } else {
    lines.push("Runs: (none)")
  }

  const sessions = filterByDayKey(raw.workoutSessions, bounds)
  const legacy = filterByDayKey(raw.workoutEntries, bounds)
  if (sessions.length > 0 || legacy.length > 0) {
    const wo = totals.workouts as { totalVolumeLb: number; completedSessionCount: number }
    const nonCompleted = sessions.length - wo.completedSessionCount
    lines.push(
      `Workouts: ${wo.completedSessionCount} completed session(s)${nonCompleted > 0 ? ` (+${nonCompleted} planned/active/superseded, not counted as training)` : ""}${legacy.length ? `, ${legacy.length} legacy log(s)` : ""}${wo.totalVolumeLb > 0 ? `, ${wo.totalVolumeLb}lb volume` : ""}`
    )
    for (const w of sessions) lines.push(...formatWorkoutSessionBlock(w))
    for (const w of legacy) {
      lines.push(
        `  - ${dayKey(w.date)} [legacy ${w.type}]: ${w.name}${w.duration ? ` ${w.duration}m` : ""}${w.notes ? ` — ${truncate(w.notes, 100)}` : ""}`
      )
    }
  } else {
    lines.push("Workouts: (none)")
  }

  lines.push(
    ...formatLiftProgressionLines(
      buildLiftProgression(sessions, raw.workoutSessions)
    )
  )

  const cardio = filterByDayKey(raw.cardioEntries, bounds)
  if (cardio.length > 0) {
    const ct = totals.cardio as {
      totalMinutes: number
      totalMiles: number
      totalCalories: number
      totalActiveZoneMinutes: number
    }
    lines.push(
      `Cardio: ${cardio.length} session(s), ${ct.totalMinutes} min, ${ct.totalMiles} mi, ${ct.totalCalories} kcal, ${ct.totalActiveZoneMinutes} active-zone min`
    )
    for (const c of cardio) lines.push(formatCardioLine(c))
  } else {
    lines.push("Cardio: (none)")
  }

  const sleep = filterByDayKey(raw.sleepEntries, bounds)
  if (sleep.length > 0) {
    const sl = totals.sleep as { avgHours: number; avgQuality: number; nights: number; items: Array<{ date: string }> }
    lines.push(`Sleep: ${sl.nights} nights, avg ${sl.avgHours}h, quality ${sl.avgQuality}/5`)
    const sleepByDay = new Map<string, typeof sleep>()
    for (const s of sleep) {
      const key = dayKey(s.date)
      const bucket = sleepByDay.get(key)
      if (bucket) bucket.push(s)
      else sleepByDay.set(key, [s])
    }
    for (const items of sleepByDay.values()) {
      const primary = resolveSleepNightEntry(items) ?? items[0]!
      lines.push(formatSleepLine(primary))
    }
  } else {
    lines.push("Sleep: (none)")
  }

  const vitals = filterByDayKey(raw.vitalEntries, bounds)
  if (vitals.length > 0) {
    const vt = totals.vitals as { avgRestingHeartRate: number; avgHrvMs: number }
    lines.push(
      `Vitals: ${vitals.length} day(s), avg resting HR ${vt.avgRestingHeartRate} bpm, avg HRV ${vt.avgHrvMs} ms`
    )
    for (const v of vitals) lines.push(formatVitalLine(v))
  } else {
    lines.push("Vitals: (none)")
  }

  const hrSamples = filterByDayKey(raw.heartRateSamples, bounds)
  if (hrSamples.length > 0) {
    lines.push(`Heart rate (all-day samples, ${hrSamples.length} buckets):`)
    lines.push(...formatHeartRateDayLines(hrSamples))
  }

  const water = totals.water as { totalOz: number; entries: number; daily: Record<string, number> }
  if (water.entries > 0) {
    lines.push(`Water: ${water.totalOz} oz across ${water.entries} log(s)`)
    for (const [d, oz] of Object.entries(water.daily).sort()) {
      lines.push(`  - ${d}: ${oz} oz`)
    }
  }

  lines.push(
    ...formatWeightLines(totals.bodyweight as ReturnType<typeof buildWeightAnalytics>, "Weight")
  )

  const habits = totals.habits as Array<{ habitName: string; frequency: string; dates: string[] }>
  const activeHabits = raw.habits.filter((h) => !h.archived)
  if (activeHabits.length > 0) {
    lines.push(`Habits (${activeHabits.length} active):`)
    for (const h of habits) {
      const meta = activeHabits.find((x) => x.name === h.habitName)
      lines.push(
        `  - ${h.habitName} (${h.frequency}${meta ? `, icon ${meta.icon}` : ""}): ${h.dates.length} completion(s)${h.dates.length ? ` — ${h.dates.join(", ")}` : ""}`
      )
    }
  }

  for (const j of filterByDayKey(raw.journalEntries, bounds)) {
    const body = j.content?.trim()
    if (body) {
      lines.push(
        `Journal ${dayKey(j.date)}${j.mood ? ` mood ${j.mood}/5` : ""}: "${truncate(body, 500)}"`
      )
    }
  }

  for (const r of filterByDayKey(raw.recoveryDailyEntries, bounds)) {
    lines.push(formatRecoveryLine(r))
  }

  const alc = totals.alcohol as {
    drinks: number
    totalUnits: number
    items: { date: string; drinkType: string; quantity: number; units: number }[]
  }
  if (alc.drinks > 0) {
    lines.push(`Alcohol: ${alc.drinks} drinks, ${alc.totalUnits} std units`)
    for (const a of alc.items) {
      lines.push(`  - ${a.date}: ${a.drinkType} ×${a.quantity} (${a.units} u)`)
    }
  }

  const bowel = totals.bowel as {
    count: number
    avgBristol: number
    items: { date: string; bristolScale: number; notes: string | null }[]
  }
  if (bowel.count > 0) {
    lines.push(`Bowel: ${bowel.count} entries, avg Bristol ${bowel.avgBristol}/7`)
    for (const b of bowel.items) {
      lines.push(
        `  - ${b.date}: Bristol ${b.bristolScale}${b.notes ? ` — ${truncate(b.notes, 80)}` : ""}`
      )
    }
  }

  lines.push(
    ...formatPeptideInjectionLines(filterByDayKey(raw.peptideEntries, bounds), "Peptides")
  )
  lines.push(
    ...formatPeptideDailyLines(filterByDayKey(raw.peptideDailyEntries, bounds), "Peptides")
  )

  const treatments = filterByDayKey(raw.treatmentLogs, bounds)
  if (treatments.length > 0) {
    lines.push(`Treatments:`)
    for (const t of treatments) {
      lines.push(
        `  - ${dayKey(t.date)}: ${t.treatmentKey}${t.completed ? "" : " (skipped)"}${t.notes ? ` — ${truncate(t.notes, 80)}` : ""}`
      )
    }
  }

  lines.push("")
  return lines
}

/**
 * Shared preamble for every narrative: timezone, active goals, active injuries,
 * fasting config, and the all-time library (routines, meals, recipes, weight).
 */
function buildContextHeader(
  raw: AgentRawData,
  catalog: Record<string, unknown>,
  tz: string,
  todayKey: string
): string[] {
  const activeGoals = raw.goals.filter((g) => g.active)
  const activeInjuries = raw.injuryRecords.filter((i) =>
    ["active", "improving"].includes(i.status)
  )
  const weightGoal = raw.longGoals.find((g) => g.category === "bodyweight")

  const catalogNarrative: string[] = [
    "=== LIBRARY & ALL-TIME (visible in app) ===",
    "Workout routines:",
    ...(raw.workoutTemplates.length
      ? raw.workoutTemplates.map((t) => formatTemplateBlock(t))
      : ["  (none)"]),
    "",
    ...(raw.savedMeals.length
      ? [
          "Saved meals (top by use):",
          ...raw.savedMeals.slice(0, 15).map(
            (m) =>
              `  - ${m.name} [${m.mealType}]: ${m.calories} kcal${m.protein != null ? `, ${m.protein}P` : ""} (used ${m.useCount}×)`
          ),
        ]
      : []),
    "",
    ...(raw.recipes.length
      ? [
          "Recipes:",
          ...raw.recipes.map(
            (r) =>
              `  - ${r.name} [${r.mealType}]: ${r.calories} kcal${r.protein != null ? `, ${r.protein}P` : ""} (used ${r.useCount}×; ${r.ingredients.length} ingredient(s): ${r.ingredients.map((i) => `${i.name} ${i.portionAmount}${i.portionUnit} ${i.calories}kcal`).join("; ")})`
          ),
        ]
      : []),
    "",
    ...formatWeightLines(
      buildWeightAnalytics(
        weightGoal
          ? {
              name: weightGoal.name,
              target: weightGoal.target,
              unit: weightGoal.unit,
              direction: weightGoal.direction,
              startValue: weightGoal.startValue,
              entries: weightGoal.entries,
            }
          : undefined,
        null,
        todayKey
      ),
      "All-time weight"
    ),
    "",
  ]

  const header = [
    `Timezone: ${tz} (today = ${todayKey}; entry dates use stored calendar day keys)`,
    "",
    "Active goals:",
    ...(activeGoals.length
      ? activeGoals.map(
          (g) =>
            `  - ${g.category} (${g.goalType}, ${g.direction}): ${g.target} ${g.unit}`
        )
      : ["  (none)"]),
    "",
    "Active injuries / illness:",
    ...(activeInjuries.length
      ? activeInjuries.map((i) => {
          const label = i.customLabel || i.conditionKey
          const note = i.notes ? ` — ${truncate(i.notes, 80)}` : ""
          return `  - [${i.kind}] ${label} (${i.severity}, ${i.status})${i.bodyRegion ? `, ${i.bodyRegion}` : ""}, onset ${dayKey(i.onsetDate)}${note}`
        })
      : ["  (none)"]),
    "",
    ...formatTrainingSplitLines(raw.profile, todayKey),
    "",
    ...catalogNarrative,
  ].flat()


  return header
}
export function buildAgentPeriodRollups(
  raw: AgentRawData,
  timeZone: string | null | undefined,
  now: Date = new Date()
): AgentPeriodRollups {
  const tz = resolveAgentTimezone(timeZone)
  const todayKey = agentTodayKey(now, timeZone)
  const weekFrom = localWeekStartKey(todayKey, tz)
  const monthFrom = monthStartKey(todayKey)

  const todayBounds = { from: todayKey, to: todayKey }
  const weekBounds = { from: weekFrom, to: todayKey }
  const monthBounds = { from: monthFrom, to: todayKey }

  const catalog = buildCatalog(raw, todayKey)

  const today: PeriodSlice = {
    range: { from: todayKey, to: todayKey, label: "TODAY" },
    totals: buildTotals(raw, todayBounds, todayKey),
    entries: buildEntries(raw, todayBounds),
  }
  const thisWeek: PeriodSlice = {
    range: { from: weekFrom, to: todayKey, label: "THIS WEEK" },
    totals: buildTotals(raw, weekBounds, todayKey),
    entries: buildEntries(raw, weekBounds),
  }
  const thisMonth: PeriodSlice = {
    range: { from: monthFrom, to: todayKey, label: "THIS MONTH" },
    totals: buildTotals(raw, monthBounds, todayKey),
    entries: buildEntries(raw, monthBounds),
  }

  const header = buildContextHeader(raw, catalog, tz, todayKey)

  const narrative = [
    ...header,
    ...narrativeSection("TODAY", today.range, raw, today.totals as ReturnType<typeof buildTotals>),
    ...narrativeSection(
      "THIS WEEK",
      thisWeek.range,
      raw,
      thisWeek.totals as ReturnType<typeof buildTotals>
    ),
    ...narrativeSection(
      "THIS MONTH",
      thisMonth.range,
      raw,
      thisMonth.totals as ReturnType<typeof buildTotals>
    ),
  ].join("\n")

  return {
    timezone: tz,
    todayKey,
    catalog: toAgentJson(catalog),
    today,
    thisWeek,
    thisMonth,
    narrative,
  }
}

export interface AgentRangeRollup {
  timezone: string
  todayKey: string
  range: { key: string; label: string; from: string; to: string; days: number | null }
  /** Routines, saved meals, recipes, habits, goals, injuries — all-time context. */
  catalog: Record<string, unknown>
  totals: Record<string, unknown>
  entries: Record<string, unknown>
  /** Plain-text block for LLMs: shared context header + this range's section. */
  narrative: string
}

/**
 * Single-window rollup for an arbitrary crawlable range (see `ranges.ts`).
 * Same totals/entries/narrative shape the fixed today/week/month slices use.
 */
export function buildAgentRangeRollup(
  raw: AgentRawData,
  timeZone: string | null | undefined,
  range: { key: string; label: string; from: string; to: string; days: number | null },
  now: Date = new Date()
): AgentRangeRollup {
  const tz = resolveAgentTimezone(timeZone)
  const todayKey = agentTodayKey(now, timeZone)
  const bounds = { from: range.from, to: range.to }

  const catalog = buildCatalog(raw, todayKey)
  const totals = buildTotals(raw, bounds, todayKey)
  const entries = buildEntries(raw, bounds)
  const header = buildContextHeader(raw, catalog, tz, todayKey)

  const narrative = [
    ...header,
    ...narrativeSection(range.label, { from: range.from, to: range.to, label: range.label }, raw, totals),
  ].join("\n")

  return {
    timezone: tz,
    todayKey,
    range,
    catalog: toAgentJson(catalog),
    totals: toAgentJson(totals),
    entries,
    narrative,
  }
}
