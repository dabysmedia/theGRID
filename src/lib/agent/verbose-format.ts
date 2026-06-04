import "server-only"

import { utcCalendarDayKeyFromIso } from "@/lib/dateStorage"
import { sleepDurationHours } from "@/lib/sleepDuration"
import {
  compoundLabel,
  injectionSiteLabel,
  parseSideEffectsJson,
  sideEffectLabel,
} from "@/lib/peptides"
import { startOfISOWeek } from "date-fns"

export function parseJsonArray<T>(raw: string | unknown): T[] {
  if (Array.isArray(raw)) return raw as T[]
  if (typeof raw !== "string" || !raw.trim()) return []
  try {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) ? (v as T[]) : []
  } catch {
    return []
  }
}

export function truncate(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ")
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

type SessionSet = {
  weight: number | null
  reps: number | null
  type?: string
  completed?: boolean
}

type SessionExercise = {
  name: string
  notes?: string
  category?: string
  sets?: SessionSet[]
  primaryMuscles?: Array<{ name: string }>
}

export function sessionExerciseLines(exercisesJson: string): string[] {
  const exercises = parseJsonArray<SessionExercise>(exercisesJson)
  const lines: string[] = []
  for (const ex of exercises) {
    const muscles =
      ex.primaryMuscles?.map((m) => m.name).filter(Boolean).join(", ") || ex.category || ""
    const header = muscles ? `${ex.name} (${muscles})` : ex.name
    lines.push(`      ${header}`)
    if (ex.notes?.trim()) lines.push(`        note: ${truncate(ex.notes, 120)}`)
    const sets = ex.sets ?? []
    for (let i = 0; i < sets.length; i++) {
      const s = sets[i]!
      const w = s.weight != null ? `${s.weight}lb` : "—"
      const r = s.reps != null ? `${s.reps}` : "—"
      const done = s.completed ? "✓" : "○"
      const kind = s.type && s.type !== "working" ? ` ${s.type}` : ""
      lines.push(`        set ${i + 1}${kind}: ${w} × ${r} ${done}`)
    }
    if (sets.length === 0) lines.push("        (no sets logged)")
  }
  return lines
}

export function sessionVolumeLb(exercisesJson: string): number {
  const exercises = parseJsonArray<SessionExercise>(exercisesJson)
  let vol = 0
  for (const ex of exercises) {
    for (const s of ex.sets ?? []) {
      if (s.completed && s.weight != null && s.reps != null) {
        vol += s.weight * s.reps
      }
    }
  }
  return Math.round(vol)
}

export function formatWorkoutSessionBlock(session: {
  name: string
  date: Date
  status: string
  duration: number | null
  startedAt: Date
  finishedAt: Date | null
  notes: string | null
  bodyWeightLb: number | null
  exercises: string
}): string[] {
  const dk = utcCalendarDayKeyFromIso(session.date)
  const mins = session.duration ? Math.round(session.duration / 60) : null
  const vol = sessionVolumeLb(session.exercises)
  const lines: string[] = [
    `  - ${dk}: ${session.name} [${session.status}]${mins != null ? ` ${mins}min` : ""}${vol > 0 ? `, vol ${vol}lb` : ""}${session.bodyWeightLb != null ? `, BW ${session.bodyWeightLb}lb` : ""}`,
  ]
  if (session.startedAt) {
    lines.push(
      `    started ${session.startedAt.toISOString()}${session.finishedAt ? ` → finished ${session.finishedAt.toISOString()}` : ""}`
    )
  }
  if (session.notes?.trim()) lines.push(`    session notes: ${truncate(session.notes, 200)}`)
  lines.push(...sessionExerciseLines(session.exercises))
  return lines
}

export function formatTemplateBlock(t: {
  name: string
  exercises: string
  tags: string
  sortOrder: number
}): string {
  const ex = parseJsonArray<{ name: string; setRows?: { weight: string; reps: string }[] }>(
    t.exercises
  )
  const tags = parseJsonArray<string>(t.tags)
  const tagStr = tags.length ? ` [${tags.join(", ")}]` : ""
  const exSummary = ex
    .map((e) => {
      const rows = e.setRows?.length ?? 0
      return rows ? `${e.name} (${rows} set rows)` : e.name
    })
    .join("; ")
  return `  - ${t.name}${tagStr}: ${exSummary || "(empty)"}`
}

export interface WeightGoalLike {
  name: string
  target: number
  unit: string
  direction: string
  startValue: number | null
  entries: Array<{ date: Date; value: number; notes: string | null }>
}

export function buildWeightAnalytics(
  goal: WeightGoalLike | undefined,
  bounds: { from: string; to: string } | null,
  todayKey?: string
) {
  const anchorKey = todayKey ?? (goal?.entries.length ? utcCalendarDayKeyFromIso(goal.entries[goal.entries.length - 1]!.date) : "")
  const all = [...(goal?.entries ?? [])].sort((a, b) => a.date.getTime() - b.date.getTime())
  const key = (d: Date) => utcCalendarDayKeyFromIso(d)

  const inBounds = bounds
    ? all.filter((e) => {
        const k = key(e.date)
        return k >= bounds.from && k <= bounds.to
      })
    : all

  const last7Cut = anchorKey ? subtractDays(anchorKey, 6) : ""
  const last30Cut = anchorKey ? subtractDays(anchorKey, 29) : ""
  const last7 = last7Cut ? all.filter((e) => key(e.date) >= last7Cut) : []
  const last30 = last30Cut ? all.filter((e) => key(e.date) >= last30Cut) : []

  const avg = (rows: typeof all) =>
    rows.length ? rows.reduce((s, e) => s + e.value, 0) / rows.length : null

  const latest = all[all.length - 1] ?? null
  const periodFirst = inBounds[0] ?? null
  const periodLast = inBounds[inBounds.length - 1] ?? null
  const periodDelta =
    periodFirst && periodLast ? Math.round((periodLast.value - periodFirst.value) * 10) / 10 : null

  const weekStart = utcCalendarDayKeyFromIso(startOfISOWeek(new Date()))
  const weekEntries = all.filter((e) => key(e.date) >= weekStart)
  const weekFirst = weekEntries[0]
  const weekLast = weekEntries[weekEntries.length - 1]
  const weekChange =
    weekFirst && weekLast && weekFirst !== weekLast
      ? Math.round((weekLast.value - weekFirst.value) * 10) / 10
      : null

  return {
    unit: goal?.unit ?? "lb",
    target: goal?.target ?? null,
    direction: goal?.direction ?? null,
    startValue: goal?.startValue ?? null,
    latest: latest ? { date: key(latest.date), value: latest.value, notes: latest.notes } : null,
    periodEntries: inBounds.map((e) => ({
      date: key(e.date),
      value: e.value,
      notes: e.notes,
    })),
    periodDelta,
    avg7: avg(last7) != null ? Math.round(avg(last7)! * 10) / 10 : null,
    avg30: avg(last30) != null ? Math.round(avg(last30)! * 10) / 10 : null,
    allTimeHigh: all.length ? Math.max(...all.map((e) => e.value)) : null,
    allTimeLow: all.length ? Math.min(...all.map((e) => e.value)) : null,
    totalWeighIns: all.length,
  }
}

function subtractDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const t = Date.UTC(y, m - 1, d, 12, 0, 0) - days * 86_400_000
  const x = new Date(t)
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`
}

export function formatWeightLines(
  analytics: ReturnType<typeof buildWeightAnalytics>,
  title: string
): string[] {
  const lines: string[] = []
  if (analytics.totalWeighIns === 0) {
    lines.push(`${title}: (no weigh-ins)`)
    return lines
  }
  const unit = analytics.unit
  const goalBits: string[] = []
  if (analytics.target && analytics.target > 0) {
    goalBits.push(`target ${analytics.target} ${unit} (${analytics.direction})`)
  }
  if (analytics.startValue != null) goalBits.push(`start ${analytics.startValue} ${unit}`)
  if (goalBits.length) lines.push(`${title} goal: ${goalBits.join(", ")}`)

  if (analytics.latest) {
    lines.push(
      `${title} latest: ${analytics.latest.value} ${unit} on ${analytics.latest.date}${analytics.latest.notes ? ` — "${truncate(analytics.latest.notes, 80)}"` : ""}`
    )
  }
  if (analytics.avg7 != null) lines.push(`${title} 7d avg: ${analytics.avg7} ${unit}`)
  if (analytics.avg30 != null) lines.push(`${title} 30d avg: ${analytics.avg30} ${unit}`)
  if (analytics.allTimeHigh != null && analytics.allTimeLow != null) {
    lines.push(
      `${title} range: ${analytics.allTimeLow}–${analytics.allTimeHigh} ${unit} (${analytics.totalWeighIns} weigh-ins all-time)`
    )
  }
  if (analytics.periodDelta != null) {
    lines.push(`${title} change in period: ${signed(analytics.periodDelta)} ${unit}`)
  }
  if (analytics.periodEntries.length > 0) {
    lines.push(`${title} weigh-ins in period:`)
    for (const e of analytics.periodEntries) {
      lines.push(
        `  - ${e.date}: ${e.value} ${unit}${e.notes ? ` — "${truncate(e.notes, 100)}"` : ""}`
      )
    }
  }
  return lines
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

export function formatStepsLines(
  steps: Array<{ date: Date; count: number }>,
  stepGoal: { target: number; goalType: string } | undefined,
  title: string
): string[] {
  if (steps.length === 0) return [`${title}: (none logged)`]
  const total = steps.reduce((s, e) => s + e.count, 0)
  const avg = Math.round(total / steps.length)
  const max = Math.max(...steps.map((s) => s.count))
  const min = Math.min(...steps.map((s) => s.count))
  const lines: string[] = [
    `${title}: ${total} total steps across ${steps.length} day(s), daily avg ${avg}, min ${min}, max ${max}`,
  ]
  if (stepGoal) {
    const target = stepGoal.goalType === "weekly" ? Math.round(stepGoal.target / 7) : stepGoal.target
    lines.push(`${title} daily goal: ${target} steps`)
    const hitDays = steps.filter((s) => s.count >= target).length
    lines.push(`${title} days at/above goal: ${hitDays}/${steps.length}`)
  }
  lines.push(`${title} by day:`)
  for (const s of [...steps].sort((a, b) => b.date.getTime() - a.date.getTime())) {
    const dk = utcCalendarDayKeyFromIso(s.date)
    const vs =
      stepGoal && stepGoal.goalType !== "weekly"
        ? ` (${s.count >= stepGoal.target ? "met goal" : `${stepGoal.target - s.count} short`})`
        : ""
    lines.push(`  - ${dk}: ${s.count.toLocaleString()} steps${vs}`)
  }
  return lines
}

export function formatPeptideInjectionLines(
  entries: Array<{
    date: Date
    injectedAt: Date
    compound: string
    doseMg: number
    injectionSite: string
    sideEffectsJson: string
    notes: string | null
  }>,
  title: string
): string[] {
  if (entries.length === 0) return [`${title}: (none)`]
  const lines: string[] = [`${title}: ${entries.length} injection(s)`]
  for (const p of entries) {
    const dk = utcCalendarDayKeyFromIso(p.date)
    const fx = parseSideEffectsJson(p.sideEffectsJson).map(sideEffectLabel)
    lines.push(
      `  - ${dk} @ ${p.injectedAt.toISOString()}: ${compoundLabel(p.compound)} ${p.doseMg}mg at ${injectionSiteLabel(p.injectionSite)}${fx.length ? `, side effects: ${fx.join(", ")}` : ""}${p.notes ? ` — ${truncate(p.notes, 120)}` : ""}`
    )
  }
  return lines
}

export function formatPeptideDailyLines(
  entries: Array<{ date: Date; hungerLevel: number; sideEffectsJson: string; notes: string | null }>,
  title: string
): string[] {
  if (entries.length === 0) return []
  const lines: string[] = [`${title} daily appetite (1–10, 10=very hungry):`]
  for (const p of entries) {
    const fx = parseSideEffectsJson(p.sideEffectsJson).map(sideEffectLabel)
    lines.push(
      `  - ${utcCalendarDayKeyFromIso(p.date)}: hunger ${p.hungerLevel}/10${fx.length ? `, ${fx.join(", ")}` : ""}${p.notes ? ` — ${truncate(p.notes, 80)}` : ""}`
    )
  }
  return lines
}

export function formatMealLine(m: {
  mealType: string
  description: string | null
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  date: Date
  createdAt: Date
}): string {
  const desc = m.description ? truncate(m.description, 120) : "(no description)"
  const p = m.protein != null ? `${m.protein}P` : "—P"
  const c = m.carbs != null ? `${m.carbs}C` : "—C"
  const f = m.fat != null ? `${m.fat}F` : "—F"
  return `  - [${m.mealType}] ${desc} — ${m.calories} kcal (${p}/${c}/${f}) on ${utcCalendarDayKeyFromIso(m.date)}`
}

export function formatRunLine(r: {
  date: Date
  distance: number
  duration: number
  environment: string
  notes: string | null
}): string {
  const dk = utcCalendarDayKeyFromIso(r.date)
  const paceMin =
    r.distance > 0 ? Math.round((r.duration / 60 / r.distance) * 10) / 10 : null
  return `  - ${dk}: ${r.distance} mi in ${Math.round(r.duration / 60)} min (${r.environment})${paceMin != null ? `, pace ${paceMin} min/mi` : ""}${r.notes ? ` — ${truncate(r.notes, 120)}` : ""}`
}

export function formatSleepLine(s: {
  date: Date
  bedtime: Date
  wakeTime: Date
  quality: number
  notes: string | null
}): string {
  const hrs = sleepDurationHours(s.bedtime, s.wakeTime)
  const dk = utcCalendarDayKeyFromIso(s.date)
  return `  - ${dk}: ${hrs}h, quality ${s.quality}/5, bed ${s.bedtime.toISOString()} → wake ${s.wakeTime.toISOString()}${s.notes ? ` — ${truncate(s.notes, 100)}` : ""}`
}

export function formatRecoveryLine(r: {
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
}): string {
  const dk = utcCalendarDayKeyFromIso(r.date)
  const doms = parseJsonArray<{ key: string; score: number }>(r.domsJson)
    .filter((d) => d.score > 0)
    .slice(0, 8)
    .map((d) => `${d.key} ${d.score}/10`)
  const domsStr = doms.length ? `, DOMS: ${doms.join(", ")}` : ""
  return `  - ${dk}: pain ${r.pain}, energy ${r.energy}, mood ${r.mood}, soreness ${r.soreness}, stress ${r.stress}, mobility ${r.mobility}, sleep-feel ${r.sleepFeel}${domsStr}${r.notes ? ` — ${truncate(r.notes, 120)}` : ""}`
}
