import "server-only"

import { dailySleepDurationHours, resolveSleepNightEntry } from "@/lib/sleepDuration"
import { localTimeParts } from "@/lib/notifications/server/local-time"
import {
  agentTodayKey,
  resolveAgentTimezone,
  storedEntryDayKey,
} from "@/lib/agent/timezone"
import { toAgentJson } from "@/lib/agent/serialize"
import {
  buildWeightAnalytics,
  formatMealLine,
  formatPeptideDailyLines,
  formatPeptideInjectionLines,
  formatRecoveryLine,
  formatRunLine,
  formatSleepLine,
  formatStepsLines,
  formatTemplateBlock,
  formatWeightLines,
  formatWorkoutSessionBlock,
  sessionVolumeLb,
  truncate,
} from "@/lib/agent/verbose-format"

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
  coachConversations: Array<{
    title: string
    updatedAt: Date
    messages: Array<{ role: string; content: string; createdAt: Date }>
  }>
  fastingProfile: {
    fastHours: number
    eatHours: number
    mode: string
    eatWindowStartMinutes: number
  } | null
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
      totalMiles: Math.round(sum(runs.map((r) => r.distance)) * 10) / 10,
      totalMinutes: Math.round(sum(runs.map((r) => r.duration)) / 60),
      items: runs.map((r) => ({
        date: dayKey(r.date),
        distanceMi: r.distance,
        durationMin: Math.round(r.duration / 60),
        paceMinPerMi:
          r.distance > 0 ? Math.round((r.duration / 60 / r.distance) * 10) / 10 : null,
        environment: r.environment,
        notes: r.notes,
      })),
    },
    workouts: {
      sessionCount: workouts.length,
      legacyEntryCount: legacyWorkouts.length,
      totalVolumeLb: sum(workouts.map((w) => sessionVolumeLb(w.exercises))),
      sessions: workouts.map((w) => ({
        date: dayKey(w.date),
        name: w.name,
        status: w.status,
        durationMin: w.duration ? Math.round(w.duration / 60) : null,
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
        durationMin: w.duration ? Math.round(w.duration / 60) : null,
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

  const coachLines: string[] = []
  for (const c of raw.coachConversations.slice(0, 5)) {
    const last = c.messages.filter((m) => m.role === "user" || m.role === "assistant").slice(-2)
    coachLines.push(
      `  - "${c.title}" (updated ${c.updatedAt.toISOString()}): ${last.map((m) => `${m.role}: ${truncate(m.content, 100)}`).join(" | ")}`
    )
  }

  return {
    workoutRoutines: raw.workoutTemplates.map((t) => ({
      name: t.name,
      tags: t.tags,
      sortOrder: t.sortOrder,
      exercises: t.exercises,
    })),
    savedMeals: raw.savedMeals.slice(0, 40),
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
    coachRecent: coachLines,
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
    ...formatStepsLines(filterByDayKey(raw.stepEntries, bounds), stepGoal, title)
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
    const wo = totals.workouts as { totalVolumeLb: number }
    lines.push(
      `Workouts: ${sessions.length} session(s), ${legacy.length} legacy log(s)${wo.totalVolumeLb > 0 ? `, ${wo.totalVolumeLb}lb volume` : ""}`
    )
    for (const w of sessions) lines.push(...formatWorkoutSessionBlock(w))
    for (const w of legacy) {
      lines.push(
        `  - ${dayKey(w.date)} [legacy ${w.type}]: ${w.name}${w.duration ? ` ${Math.round(w.duration / 60)}m` : ""}${w.notes ? ` — ${truncate(w.notes, 100)}` : ""}`
      )
    }
  } else {
    lines.push("Workouts: (none)")
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

  lines.push(
    ...formatWeightLines(totals.bodyweight as ReturnType<typeof buildWeightAnalytics>, title)
  )

  const habits = totals.habits as Array<{ habitName: string; frequency: string; dates: string[] }>
  const activeHabits = raw.habits.filter((h) => !h.archived)
  if (activeHabits.length > 0) {
    lines.push(`${title} habits (${activeHabits.length} active):`)
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
    ...formatPeptideInjectionLines(filterByDayKey(raw.peptideEntries, bounds), title)
  )
  lines.push(
    ...formatPeptideDailyLines(filterByDayKey(raw.peptideDailyEntries, bounds), title)
  )

  const treatments = filterByDayKey(raw.treatmentLogs, bounds)
  if (treatments.length > 0) {
    lines.push(`${title} treatments:`)
    for (const t of treatments) {
      lines.push(
        `  - ${dayKey(t.date)}: ${t.treatmentKey}${t.completed ? "" : " (skipped)"}${t.notes ? ` — ${truncate(t.notes, 80)}` : ""}`
      )
    }
  }

  lines.push("")
  return lines
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
    raw.fastingProfile
      ? [
          "",
          `Fasting: ${raw.fastingProfile.fastHours}:${raw.fastingProfile.eatHours} (${raw.fastingProfile.mode}), eat window from ${Math.floor(raw.fastingProfile.eatWindowStartMinutes / 60)}:${String(raw.fastingProfile.eatWindowStartMinutes % 60).padStart(2, "0")} local`,
        ]
      : [],
    "",
    ...catalogNarrative,
    ...(raw.coachConversations.length
      ? ["Coach (recent):", ...(catalog.coachRecent as string[]), ""]
      : []),
  ].flat()

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
