import "server-only"

import { utcCalendarDayKeyFromIso } from "@/lib/dateStorage"
import { sleepDurationHours } from "@/lib/sleepDuration"
import { isValidTimeZone, localDayKey, localTimeParts } from "@/lib/notifications/server/local-time"
import { toAgentJson } from "@/lib/agent/serialize"

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
    duration: number | null
    status: string
    bodyWeightLb: number | null
    notes: string | null
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
    notes: string | null
  }>
  peptideDailyEntries: Array<{ date: Date; hungerLevel: number; notes: string | null }>
  alcoholEntries: Array<{ date: Date; drinkType: string; quantity: number; units: number }>
  bowelEntries: Array<{
    date: Date
    time: Date
    bristolScale: number
    notes: string | null
  }>
  journalEntries: Array<{ date: Date; mood: number | null; content: string }>
  recoveryDailyEntries: Array<{
    date: Date
    pain: number
    energy: number
    mood: number
    soreness: number
    stress: number
    mobility: number
    sleepFeel: number
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
    completions: Array<{ date: Date }>
  }>
  longGoals: Array<{
    name: string
    category: string
    unit: string
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
    onsetDate: Date
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
  today: PeriodSlice
  thisWeek: PeriodSlice
  thisMonth: PeriodSlice
  /** Plain-text TODAY / THIS WEEK / THIS MONTH blocks for LLMs */
  narrative: string
}

function resolveTimezone(raw: string | null | undefined): string {
  return isValidTimeZone(raw) ? raw : "UTC"
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
  return utcCalendarDayKeyFromIso(date)
}

function sum(nums: number[]): number {
  return nums.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0)
}

function avg(nums: number[]): number {
  const f = nums.filter((n) => Number.isFinite(n))
  if (f.length === 0) return 0
  return sum(f) / f.length
}

function truncate(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ")
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
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

function buildTotals(raw: AgentRawData, bounds: Bounds) {
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
  const weighIns = (weightGoal?.entries ?? [])
    .filter((e) => inRange(dayKey(e.date), bounds.from, bounds.to))
    .sort((a, b) => b.date.getTime() - a.date.getTime())

  const sleepHrs = sleep.map((s) => sleepDurationHours(s.bedtime, s.wakeTime)).filter((h) => h > 0)

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
      daily: Object.fromEntries(steps.map((s) => [dayKey(s.date), s.count])),
    },
    runs: {
      count: runs.length,
      totalMiles: Math.round(sum(runs.map((r) => r.distance)) * 10) / 10,
      totalMinutes: Math.round(sum(runs.map((r) => r.duration)) / 60),
      items: runs.map((r) => ({
        date: dayKey(r.date),
        distanceMi: r.distance,
        durationMin: Math.round(r.duration / 60),
        environment: r.environment,
      })),
    },
    workouts: {
      count: workouts.length,
      items: workouts.map((w) => ({
        date: dayKey(w.date),
        name: w.name,
        status: w.status,
        durationMin: w.duration ? Math.round(w.duration / 60) : null,
        bodyWeightLb: w.bodyWeightLb,
      })),
    },
    sleep: {
      nights: sleep.length,
      avgHours: Math.round(avg(sleepHrs) * 10) / 10,
      avgQuality: Math.round(avg(sleep.map((s) => s.quality)) * 10) / 10,
      items: sleep.map((s) => ({
        date: dayKey(s.date),
        hours: sleepDurationHours(s.bedtime, s.wakeTime),
        quality: s.quality,
      })),
    },
    bodyweight: {
      unit: weightGoal?.unit ?? "lb",
      latest: weighIns[0]
        ? { date: dayKey(weighIns[0].date), value: weighIns[0].value }
        : null,
      weighIns: weighIns.map((e) => ({ date: dayKey(e.date), value: e.value })),
    },
    habits: filterHabitCompletions(raw.habits, bounds),
    journal: journal.map((j) => ({
      date: dayKey(j.date),
      mood: j.mood,
      excerpt: j.content ? truncate(j.content, 280) : null,
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
        bristolScale: b.bristolScale,
      })),
    },
    peptides: {
      injections: peptides.length,
      items: peptides.map((p) => ({
        date: dayKey(p.date),
        compound: p.compound,
        doseMg: p.doseMg,
        site: p.injectionSite,
      })),
      daily: peptideDaily.map((p) => ({
        date: dayKey(p.date),
        hungerLevel: p.hungerLevel,
      })),
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

function formatMeals(calories: AgentRawData["calorieEntries"], bounds: Bounds): string[] {
  return filterByDayKey(calories, bounds)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 40)
    .map((m) => {
      const desc = m.description ? truncate(m.description, 80) : "(no description)"
      return `  - [${m.mealType}] ${desc} — ${m.calories} kcal (${dayKey(m.date)})`
    })
}

function narrativeSection(
  title: string,
  range: PeriodRange,
  raw: AgentRawData,
  totals: ReturnType<typeof buildTotals>
): string[] {
  const lines: string[] = []
  lines.push(`=== ${title} (${range.from} → ${range.to}) ===`)

  const n = totals.nutrition as {
    totalCalories: number
    totalProteinG: number
    mealCount: number
    daysWithFood: number
    dailyCalories: Record<string, number>
  }
  if (n.mealCount > 0) {
    lines.push(
      `Food: ${n.totalCalories} kcal total, ${Math.round(n.totalProteinG)}P g protein, ${n.mealCount} items across ${n.daysWithFood} day(s).`
    )
    const meals = formatMeals(raw.calorieEntries, { from: range.from, to: range.to })
    for (const m of meals) lines.push(m)
    if (n.mealCount > 40) lines.push(`  …and ${n.mealCount - 40} more meal rows.`)
  } else {
    lines.push("Food: (none logged)")
  }

  const st = totals.steps as { total: number; daysLogged: number; daily: Record<string, number> }
  if (st.daysLogged > 0) {
    const daily = Object.entries(st.daily)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([d, c]) => `${d}: ${c}`)
      .join(", ")
    lines.push(`Steps: ${st.total} total (${st.daysLogged} days) — ${daily}`)
  } else {
    lines.push("Steps: (none)")
  }

  const runs = totals.runs as {
    count: number
    totalMiles: number
    totalMinutes: number
    items: { date: string; distanceMi: number; durationMin: number; environment: string }[]
  }
  if (runs.count > 0) {
    lines.push(`Runs: ${runs.count}, ${runs.totalMiles} mi, ${runs.totalMinutes} min.`)
    for (const r of runs.items) {
      lines.push(`  - ${r.date}: ${r.distanceMi} mi, ${r.durationMin} min (${r.environment})`)
    }
  }

  const wo = totals.workouts as {
    count: number
    items: { date: string; name: string; status: string; durationMin: number | null; bodyWeightLb: number | null }[]
  }
  if (wo.count > 0) {
    lines.push(`Workouts: ${wo.count}`)
    for (const w of wo.items) {
      const bw = w.bodyWeightLb ? `, BW ${w.bodyWeightLb}lb` : ""
      lines.push(`  - ${w.date}: ${w.name} (${w.status}, ${w.durationMin ?? "?"}m${bw})`)
    }
  } else {
    lines.push("Workouts: (none)")
  }

  const sl = totals.sleep as {
    nights: number
    avgHours: number
    avgQuality: number
    items: { date: string; hours: number; quality: number }[]
  }
  if (sl.nights > 0) {
    lines.push(`Sleep: ${sl.nights} nights, avg ${sl.avgHours}h, quality ${sl.avgQuality}/5`)
    for (const s of sl.items.slice(0, 14)) {
      lines.push(`  - ${s.date}: ${s.hours}h, q${s.quality}`)
    }
  } else {
    lines.push("Sleep: (none)")
  }

  const bw = totals.bodyweight as {
    latest: { date: string; value: number } | null
    weighIns: { date: string; value: number }[]
  }
  if (bw.weighIns.length > 0) {
    const parts = bw.weighIns.map((e) => `${e.date} ${e.value}`).join(", ")
    lines.push(`Bodyweight: ${parts}`)
  }

  const habits = totals.habits as Array<{ habitName: string; dates: string[] }>
  const hitHabits = habits.filter((h) => h.dates.length > 0)
  if (hitHabits.length > 0) {
    lines.push("Habits completed:")
    for (const h of hitHabits) {
      lines.push(`  - ${h.habitName}: ${h.dates.length}× (${h.dates.join(", ")})`)
    }
  }

  const journal = totals.journal as Array<{ date: string; mood: number | null; excerpt: string | null }>
  for (const j of journal) {
    if (j.excerpt) lines.push(`Journal ${j.date}${j.mood ? ` mood ${j.mood}/5` : ""}: "${j.excerpt}"`)
  }

  const rec = totals.recovery as Array<Record<string, unknown>>
  for (const r of rec) {
    lines.push(
      `Recovery ${r.date}: pain ${r.pain}, energy ${r.energy}, mood ${r.mood}, stress ${r.stress}`
    )
  }

  const alc = totals.alcohol as { drinks: number; totalUnits: number }
  if (alc.drinks > 0) {
    lines.push(`Alcohol: ${alc.drinks} drinks, ${alc.totalUnits} std units`)
  }

  const bowel = totals.bowel as { count: number; avgBristol: number }
  if (bowel.count > 0) {
    lines.push(`Bowel: ${bowel.count} entries, avg Bristol ${bowel.avgBristol}`)
  }

  const pep = totals.peptides as { injections: number }
  if (pep.injections > 0) {
    lines.push(`Peptide injections: ${pep.injections}`)
  }

  lines.push("")
  return lines
}

export function buildAgentPeriodRollups(
  raw: AgentRawData,
  timeZone: string | null | undefined,
  now: Date = new Date()
): AgentPeriodRollups {
  const tz = resolveTimezone(timeZone)
  const todayKey = localDayKey(now, tz)
  const weekFrom = localWeekStartKey(todayKey, tz)
  const monthFrom = monthStartKey(todayKey)

  const todayBounds = { from: todayKey, to: todayKey }
  const weekBounds = { from: weekFrom, to: todayKey }
  const monthBounds = { from: monthFrom, to: todayKey }

  const today: PeriodSlice = {
    range: { from: todayKey, to: todayKey, label: "TODAY" },
    totals: buildTotals(raw, todayBounds),
    entries: buildEntries(raw, todayBounds),
  }
  const thisWeek: PeriodSlice = {
    range: { from: weekFrom, to: todayKey, label: "THIS WEEK" },
    totals: buildTotals(raw, weekBounds),
    entries: buildEntries(raw, weekBounds),
  }
  const thisMonth: PeriodSlice = {
    range: { from: monthFrom, to: todayKey, label: "THIS MONTH" },
    totals: buildTotals(raw, monthBounds),
    entries: buildEntries(raw, monthBounds),
  }

  const activeGoals = raw.goals.filter((g) => g.active)
  const activeInjuries = raw.injuryRecords.filter((i) =>
    ["active", "improving"].includes(i.status)
  )

  const header = [
    `Timezone: ${tz} (today = ${todayKey})`,
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
      ? activeInjuries.map(
          (i) =>
            `  - [${i.kind}] ${i.customLabel || i.conditionKey} (${i.severity}, ${i.status})${i.bodyRegion ? ` — ${i.bodyRegion}` : ""}`
        )
      : ["  (none)"]),
    raw.fastingProfile
      ? [
          "",
          `Fasting: ${raw.fastingProfile.fastHours}:${raw.fastingProfile.eatHours} (${raw.fastingProfile.mode}), eat window from ${Math.floor(raw.fastingProfile.eatWindowStartMinutes / 60)}:${String(raw.fastingProfile.eatWindowStartMinutes % 60).padStart(2, "0")} local`,
        ]
      : [],
    "",
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
    today,
    thisWeek,
    thisMonth,
    narrative,
  }
}
