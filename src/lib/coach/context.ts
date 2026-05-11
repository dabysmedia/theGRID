import "server-only"

import { prisma } from "@/lib/prisma"
import { format, startOfDay, subDays } from "date-fns"

/**
 * Produces a compact, deterministic text snapshot of the user's recent state
 * for injection into the coach system prompt. Output is hard-capped near
 * ~1.8k characters (~450 tokens) to keep per-turn cost predictable.
 */

const MAX_CHARS = 1800
const LOOKBACK_DAYS = 7

interface BuildContextOptions {
  userId: string
  /** "today" override for testability; defaults to local startOfDay. */
  now?: Date
}

interface BuildContextResult {
  userName: string
  text: string
}

export async function buildUserContext(
  opts: BuildContextOptions
): Promise<BuildContextResult> {
  const now = opts.now ?? new Date()
  const today = startOfDay(now)
  const since = subDays(today, LOOKBACK_DAYS - 1)
  const todayLabel = format(today, "EEEE, MMM d, yyyy")

  const [
    user,
    goals,
    longGoals,
    workoutSessions,
    runs,
    calorieEntries,
    sleepEntries,
    recovery,
    injuries,
    journalEntries,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: opts.userId },
      select: { name: true, vacationResumeDate: true },
    }),
    prisma.goal.findMany({
      where: { userId: opts.userId, active: true },
      select: { category: true, goalType: true, direction: true, target: true, unit: true },
      take: 12,
    }),
    prisma.longGoal.findMany({
      where: { userId: opts.userId, active: true },
      select: { name: true, category: true, target: true, unit: true, direction: true },
      take: 6,
    }),
    prisma.workoutSession.findMany({
      where: {
        userId: opts.userId,
        date: { gte: since },
        status: { in: ["completed", "active"] },
      },
      select: { name: true, date: true, duration: true, status: true },
      orderBy: { date: "desc" },
      take: 14,
    }),
    prisma.runEntry.findMany({
      where: { userId: opts.userId, date: { gte: since } },
      select: { date: true, distance: true, duration: true, environment: true },
      orderBy: { date: "desc" },
      take: 14,
    }),
    prisma.calorieEntry.findMany({
      where: { userId: opts.userId, date: { gte: since } },
      select: { date: true, calories: true, protein: true },
    }),
    prisma.sleepEntry.findMany({
      where: { userId: opts.userId, date: { gte: since } },
      select: { date: true, bedtime: true, wakeTime: true, quality: true },
      orderBy: { date: "desc" },
      take: 14,
    }),
    prisma.recoveryDailyEntry.findMany({
      where: { userId: opts.userId, date: { gte: since } },
      select: {
        date: true,
        pain: true,
        energy: true,
        mood: true,
        soreness: true,
        stress: true,
        mobility: true,
        sleepFeel: true,
      },
      orderBy: { date: "desc" },
      take: 7,
    }),
    prisma.injuryRecord.findMany({
      where: { userId: opts.userId, status: { in: ["active", "improving"] } },
      select: {
        conditionKey: true,
        customLabel: true,
        kind: true,
        bodyRegion: true,
        severity: true,
        status: true,
        onsetDate: true,
      },
      orderBy: { onsetDate: "desc" },
      take: 8,
    }),
    prisma.journalEntry.findMany({
      where: { userId: opts.userId, date: { gte: since } },
      select: { date: true, mood: true, content: true },
      orderBy: { date: "desc" },
      take: 7,
    }),
  ])

  const userName = user?.name ?? "Friend"
  const onVacation = isVacationActive(user?.vacationResumeDate ?? null, today)

  const calsByDay = sumByDay(calorieEntries.map((e) => ({ date: e.date, value: e.calories })))
  const proteinByDay = sumByDay(
    calorieEntries.map((e) => ({ date: e.date, value: e.protein ?? 0 }))
  )
  const cals7Avg = avg(Object.values(calsByDay))
  const protein7Avg = avg(Object.values(proteinByDay))

  const sleepHrsByDay = sleepEntries
    .map((e) => ({
      key: ymd(e.date),
      hrs: hoursBetween(e.bedtime, e.wakeTime),
      qual: e.quality,
    }))
    .filter((s) => s.hrs > 0)
  const sleep7AvgHrs = avg(sleepHrsByDay.map((s) => s.hrs))
  const sleep7AvgQual = avg(sleepHrsByDay.map((s) => s.qual))

  const last = recovery[0]
  const recoveryAvgs =
    recovery.length > 0
      ? {
          energy: avg(recovery.map((r) => r.energy)),
          mood: avg(recovery.map((r) => r.mood)),
          stress: avg(recovery.map((r) => r.stress)),
          soreness: avg(recovery.map((r) => r.soreness)),
          sleepFeel: avg(recovery.map((r) => r.sleepFeel)),
        }
      : null

  const lines: string[] = []
  lines.push(`Today is ${todayLabel}.`)
  lines.push(`User: ${userName}.`)
  if (onVacation) lines.push("Status: VACATION MODE — calorie tracking is paused.")

  if (goals.length > 0) {
    lines.push("Active goals:")
    for (const g of goals) {
      lines.push(
        `  - ${g.category} (${g.goalType}, ${g.direction}): target ${g.target} ${g.unit}`.trim()
      )
    }
  } else {
    lines.push("Active goals: (none set)")
  }

  if (longGoals.length > 0) {
    lines.push("Long-term goals:")
    for (const g of longGoals) {
      lines.push(`  - ${g.name} (${g.category}): target ${g.target} ${g.unit} (${g.direction})`)
    }
  }

  lines.push(`Last ${LOOKBACK_DAYS}d nutrition: avg ${fmtNum(cals7Avg)} kcal/day, avg ${fmtNum(
    protein7Avg
  )} g protein/day.`)

  lines.push(
    `Last ${LOOKBACK_DAYS}d sleep: avg ${fmtNum(sleep7AvgHrs, 1)} hrs/night, avg quality ${fmtNum(
      sleep7AvgQual,
      1
    )}/5 (${sleepHrsByDay.length} nights logged).`
  )

  if (workoutSessions.length > 0) {
    lines.push(`Recent workouts (${workoutSessions.length}):`)
    for (const w of workoutSessions.slice(0, 5)) {
      const mins = w.duration ? `${Math.round(w.duration / 60)}m` : "?"
      lines.push(`  - ${ymd(w.date)} — ${w.name} (${mins}, ${w.status})`)
    }
  } else {
    lines.push(`Recent workouts: none in last ${LOOKBACK_DAYS}d.`)
  }

  if (runs.length > 0) {
    const totalMi = runs.reduce((s, r) => s + r.distance, 0)
    lines.push(
      `Recent runs (${runs.length}): ${fmtNum(totalMi, 1)} mi total over last ${LOOKBACK_DAYS}d.`
    )
  }

  if (last) {
    lines.push(
      `Latest recovery (${ymd(last.date)}): pain ${last.pain}/10, energy ${last.energy}/10, mood ${
        last.mood
      }/10, stress ${last.stress}/10, soreness ${last.soreness}/10, mobility ${
        last.mobility
      }/10, sleep-feel ${last.sleepFeel}/10.`
    )
  }
  if (recoveryAvgs) {
    lines.push(
      `Recovery 7d avg: energy ${fmtNum(recoveryAvgs.energy, 1)}, mood ${fmtNum(
        recoveryAvgs.mood,
        1
      )}, stress ${fmtNum(recoveryAvgs.stress, 1)}, soreness ${fmtNum(
        recoveryAvgs.soreness,
        1
      )}.`
    )
  }

  if (injuries.length > 0) {
    lines.push("Active injuries / illness:")
    for (const inj of injuries.slice(0, 5)) {
      const label = inj.customLabel || inj.conditionKey
      lines.push(
        `  - [${inj.kind}] ${label} (${inj.severity}, ${inj.status})${
          inj.bodyRegion ? ` — ${inj.bodyRegion}` : ""
        }`
      )
    }
  }

  if (journalEntries.length > 0) {
    const moodScores = journalEntries
      .map((j) => j.mood)
      .filter((m): m is number => typeof m === "number" && m > 0)
    if (moodScores.length > 0) {
      lines.push(
        `Recent journal mood: avg ${fmtNum(avg(moodScores), 1)}/5 over ${moodScores.length} entries.`
      )
    }
    const latest = journalEntries[0]
    if (latest?.content) {
      lines.push(`Latest journal note (${ymd(latest.date)}): "${truncate(latest.content, 160)}"`)
    }
  }

  let text = lines.join("\n")
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS - 12) + "\n…(truncated)"
  }

  return { userName, text }
}

function sumByDay(rows: Array<{ date: Date; value: number }>): Record<string, number> {
  const map: Record<string, number> = {}
  for (const r of rows) {
    const k = ymd(r.date)
    map[k] = (map[k] ?? 0) + (r.value ?? 0)
  }
  return map
}

function avg(values: number[]): number {
  const filtered = values.filter((v) => Number.isFinite(v))
  if (filtered.length === 0) return 0
  return filtered.reduce((s, v) => s + v, 0) / filtered.length
}

function hoursBetween(bedtime: Date, wakeTime: Date): number {
  const ms = wakeTime.getTime() - bedtime.getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return ms / 3_600_000
}

function ymd(d: Date): string {
  return format(d, "yyyy-MM-dd")
}

function fmtNum(n: number, digits = 0): string {
  if (!Number.isFinite(n) || n === 0) return "0"
  return digits === 0 ? String(Math.round(n)) : n.toFixed(digits)
}

function truncate(s: string, max: number): string {
  const trimmed = s.trim().replace(/\s+/g, " ")
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

function isVacationActive(resumeDateYmd: string | null, today: Date): boolean {
  if (!resumeDateYmd) return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resumeDateYmd)) return false
  const [y, m, d] = resumeDateYmd.split("-").map(Number)
  const resume = new Date(y, m - 1, d)
  return today < resume
}
