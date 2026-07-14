import "server-only"

import { prisma } from "@/lib/prisma"
import { utcCalendarDayKeyFromIso } from "@/lib/dateStorage"
import { dailySleepDurationHours, pickPrimarySleepEntry } from "@/lib/sleepDuration"
import {
  isValidTimeZone,
  localDayKey,
} from "@/lib/notifications/server/local-time"
import { differenceInMinutes, format, startOfDay, subDays } from "date-fns"

/**
 * Produces a compact, deterministic text snapshot of the user's recent state
 * for injection into the coach system prompt. The snapshot is hard-capped near
 * ~6k characters (~1.5k tokens) so the per-turn cost stays predictable while
 * giving the coach visibility into every tracked surface on the site:
 * goals, weight, nutrition (incl. logged meals), workouts, runs, sleep,
 * recovery, injuries + treatments, journal, habits, steps, alcohol, bowel
 * movements, and the current fasting profile.
 */

const MAX_CHARS = 6000
const LOOKBACK_DAYS = 7
/** Wider window for slow-moving signals like weigh-ins. */
const WEIGHT_LOOKBACK_DAYS = 30

interface BuildContextOptions {
  userId: string
  /** "now" override for testability; defaults to `new Date()`. */
  now?: Date
  /**
   * Browser/device IANA zone from the client (e.g. "America/New_York").
   * Takes precedence over `User.timeZone` so "today" matches the user's wall
   * clock regardless of server UTC or missing DB timezone.
   */
  clientTimeZone?: string | null
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
  const weightSince = subDays(today, WEIGHT_LOOKBACK_DAYS - 1)

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
    bodyweightGoal,
    steps,
    bowel,
    alcohol,
    habits,
    habitCompletions,
    treatmentLogs,
    fasting,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: opts.userId },
      select: { name: true, vacationResumeDate: true, timeZone: true },
    }),
    prisma.goal.findMany({
      where: { userId: opts.userId, active: true },
      select: { category: true, goalType: true, direction: true, target: true, unit: true },
      take: 12,
    }),
    prisma.longGoal.findMany({
      where: { userId: opts.userId, active: true },
      select: { name: true, category: true, target: true, unit: true, direction: true },
      take: 8,
    }),
    prisma.workoutSession.findMany({
      where: {
        userId: opts.userId,
        date: { gte: since },
        status: { in: ["completed", "active"] },
      },
      select: {
        name: true,
        date: true,
        duration: true,
        status: true,
        bodyWeightLb: true,
      },
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
      select: {
        date: true,
        mealType: true,
        description: true,
        calories: true,
        protein: true,
        carbs: true,
        fat: true,
        createdAt: true,
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
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
    // Bodyweight is stored as a LongGoal of category="bodyweight" with one
    // LongGoalEntry per weigh-in (see /api/weigh-in). Fetch the goal here so
    // we can pull entries in a follow-up query only when one exists.
    prisma.longGoal.findFirst({
      where: { userId: opts.userId, category: "bodyweight" },
      select: { id: true, unit: true, target: true, direction: true },
    }),
    prisma.stepEntry.findMany({
      where: { userId: opts.userId, date: { gte: since } },
      select: { date: true, count: true },
      orderBy: { date: "desc" },
    }),
    prisma.bowelEntry.findMany({
      where: { userId: opts.userId, date: { gte: since } },
      select: { date: true, time: true, bristolScale: true, notes: true },
      orderBy: { time: "desc" },
      take: 12,
    }),
    prisma.alcoholEntry.findMany({
      where: { userId: opts.userId, date: { gte: since } },
      select: { date: true, drinkType: true, quantity: true, units: true },
      orderBy: { date: "desc" },
    }),
    prisma.habit.findMany({
      where: { userId: opts.userId, archived: false },
      select: { id: true, name: true, frequency: true },
      orderBy: { sortOrder: "asc" },
      take: 12,
    }),
    prisma.habitCompletion.findMany({
      where: {
        habit: { userId: opts.userId },
        date: { gte: since },
      },
      select: { habitId: true, date: true },
    }),
    prisma.treatmentLog.findMany({
      where: { userId: opts.userId, date: { gte: since } },
      select: {
        date: true,
        treatmentKey: true,
        completed: true,
        injury: { select: { conditionKey: true, customLabel: true } },
      },
      orderBy: { date: "desc" },
      take: 10,
    }),
    prisma.fastingProfile.findUnique({
      where: { userId: opts.userId },
      select: {
        fastHours: true,
        eatHours: true,
        mode: true,
        lastMealAtMs: true,
        eatWindowStartMinutes: true,
      },
    }),
  ])

  // Bodyweight history (gated on the goal existing — most users have one).
  const bodyweightEntries = bodyweightGoal
    ? await prisma.longGoalEntry.findMany({
        where: { goalId: bodyweightGoal.id, date: { gte: weightSince } },
        select: { date: true, value: true },
        orderBy: { date: "desc" },
        take: 30,
      })
    : []

  const userName = user?.name ?? "Friend"
  const onVacation = isVacationActive(user?.vacationResumeDate ?? null, today)

  // "Today" for food / coach copy must follow the user's wall clock (same as
  // the rest of the app). Row dates are stored as UTC calendar days (see
  // dateStorage.ts); we match those with utcCalendarDayKeyFromIso. Using the
  // server's local midnight for "today" breaks everywhere that isn't UTC — the
  // weekly totals still looked fine because they bucketed by DB key, but the
  // "today's meals" filter returned nothing.
  const userTz =
    isValidTimeZone(opts.clientTimeZone) ? opts.clientTimeZone! : isValidTimeZone(user?.timeZone) ? user.timeZone! : "UTC"
  const todayKey = localDayKey(now, userTz)
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: userTz,
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(now)
  const tzSource =
    isValidTimeZone(opts.clientTimeZone)
      ? "device"
      : isValidTimeZone(user?.timeZone)
        ? "profile"
        : "UTC fallback"

  // ── Aggregations ───────────────────────────────────────────────────────────
  const calsByDay = sumByDay(calorieEntries.map((e) => ({ date: e.date, value: e.calories })))
  const proteinByDay = sumByDay(
    calorieEntries.map((e) => ({ date: e.date, value: e.protein ?? 0 }))
  )
  const carbsByDay = sumByDay(
    calorieEntries.map((e) => ({ date: e.date, value: e.carbs ?? 0 }))
  )
  const fatByDay = sumByDay(
    calorieEntries.map((e) => ({ date: e.date, value: e.fat ?? 0 }))
  )
  const cals7Avg = avg(Object.values(calsByDay))
  const protein7Avg = avg(Object.values(proteinByDay))
  const carbs7Avg = avg(Object.values(carbsByDay))
  const fat7Avg = avg(Object.values(fatByDay))

  const todaysMeals = calorieEntries
    .filter((e) => utcCalendarDayKeyFromIso(e.date) === todayKey)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const todaysCals = sum(todaysMeals.map((m) => m.calories))
  const todaysProtein = sum(todaysMeals.map((m) => m.protein ?? 0))
  const todaysCarbs = sum(todaysMeals.map((m) => m.carbs ?? 0))
  const todaysFat = sum(todaysMeals.map((m) => m.fat ?? 0))

  const sleepByDay = new Map<string, typeof sleepEntries>()
  for (const e of sleepEntries) {
    const key = ymd(e.date)
    const bucket = sleepByDay.get(key)
    if (bucket) bucket.push(e)
    else sleepByDay.set(key, [e])
  }
  const sleepHrsByDay = Array.from(sleepByDay.entries())
    .map(([key, items]) => {
      const primary = pickPrimarySleepEntry(items)
      return {
        key,
        hrs: dailySleepDurationHours(items),
        qual: primary?.quality ?? items[0]?.quality ?? 0,
      }
    })
    .filter((s) => s.hrs > 0)
  const sleep7AvgHrs = avg(sleepHrsByDay.map((s) => s.hrs))
  const sleep7AvgQual = avg(sleepHrsByDay.map((s) => s.qual))

  const stepsByDay = sumByDay(steps.map((s) => ({ date: s.date, value: s.count })))
  const steps7Avg = avg(Object.values(stepsByDay))

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

  const habitCompletionCount: Record<string, number> = {}
  for (const c of habitCompletions) {
    habitCompletionCount[c.habitId] = (habitCompletionCount[c.habitId] ?? 0) + 1
  }

  const lines: string[] = []
  lines.push(`Today is ${todayLabel} (local date ${todayKey}, tz ${userTz}, source: ${tzSource}).`)
  lines.push(`User: ${userName}.`)
  if (onVacation) lines.push("Status: VACATION MODE — calorie tracking is paused.")

  // ── Goals ──────────────────────────────────────────────────────────────────
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

  // ── Bodyweight ─────────────────────────────────────────────────────────────
  if (bodyweightGoal && bodyweightEntries.length > 0) {
    const unit = bodyweightGoal.unit || "lb"
    const latest = bodyweightEntries[0]
    const oldest = bodyweightEntries[bodyweightEntries.length - 1]
    const target =
      bodyweightGoal.target && bodyweightGoal.target > 0
        ? `, target ${fmtNum(bodyweightGoal.target, 1)} ${unit} (${bodyweightGoal.direction})`
        : ""
    const trend =
      bodyweightEntries.length >= 2
        ? ` — ${signed(latest.value - oldest.value, 1)} ${unit} over ${bodyweightEntries.length} weigh-ins (${WEIGHT_LOOKBACK_DAYS}d)`
        : ""
    lines.push(
      `Bodyweight: ${fmtNum(latest.value, 1)} ${unit} on ${ymd(latest.date)}${trend}${target}.`
    )
    if (bodyweightEntries.length > 1) {
      const recent = bodyweightEntries
        .slice(0, 4)
        .map((e) => `${ymd(e.date)} ${fmtNum(e.value, 1)}`)
        .join(", ")
      lines.push(`  Recent weigh-ins: ${recent}.`)
    }
  } else {
    lines.push("Bodyweight: (no weigh-ins logged)")
  }

  // ── Nutrition ──────────────────────────────────────────────────────────────
  lines.push(
    `Nutrition ${LOOKBACK_DAYS}d avg: ${fmtNum(cals7Avg)} kcal, ${fmtNum(protein7Avg)}P / ${fmtNum(
      carbs7Avg
    )}C / ${fmtNum(fat7Avg)}F g per day (${Object.keys(calsByDay).length} days logged). Each row below is a separate CalorieEntry (same as the food log).`
  )
  if (todaysMeals.length > 0) {
    lines.push(
      `Today's logged food (${todayKey}): ${fmtNum(todaysCals)} kcal, ${fmtNum(
        todaysProtein
      )}P / ${fmtNum(todaysCarbs)}C / ${fmtNum(todaysFat)}F g — ${todaysMeals.length} line item(s):`
    )
    for (const m of todaysMeals.slice(0, 55)) {
      const desc = m.description ? truncate(m.description, 100) : "(no description)"
      const loggedAt = formatHmUserTz(m.createdAt, userTz)
      lines.push(
        `  - [${m.mealType}] ${desc} — ${m.calories} kcal (${mealMacroFragment(m)}); logged ${loggedAt}`
      )
    }
    if (todaysMeals.length > 55) {
      lines.push(`  …and ${todaysMeals.length - 55} more line items for today (list truncated).`)
    }
  } else {
    lines.push(
      `Today (${todayKey}): no CalorieEntry rows for this calendar day — if the user logged food, confirm their timezone matches the device (stored under User.timeZone) so "today" aligns.`
    )
  }
  // Yesterday & day-before quick glance, useful for trend questions.
  const recentMealDays = Object.keys(calsByDay)
    .filter((k) => k !== todayKey)
    .sort()
    .reverse()
    .slice(0, 2)
  if (recentMealDays.length > 0) {
    const parts = recentMealDays.map(
      (k) => `${k} ${Math.round(calsByDay[k])} kcal / ${Math.round(proteinByDay[k] ?? 0)}P`
    )
    lines.push(`  Prior days: ${parts.join("; ")}.`)
  }

  // ── Sleep ──────────────────────────────────────────────────────────────────
  lines.push(
    `Sleep ${LOOKBACK_DAYS}d: avg ${fmtNum(sleep7AvgHrs, 1)} hrs/night, quality ${fmtNum(
      sleep7AvgQual,
      1
    )}/5 (${sleepHrsByDay.length} nights).`
  )
  if (sleepHrsByDay.length > 0) {
    const recent = sleepHrsByDay
      .slice(0, 4)
      .map((s) => `${s.key} ${fmtNum(s.hrs, 1)}h q${s.qual}`)
      .join(", ")
    lines.push(`  Recent nights: ${recent}.`)
  }

  // ── Steps ──────────────────────────────────────────────────────────────────
  if (Object.keys(stepsByDay).length > 0) {
    const todaysSteps = stepsByDay[todayKey]
    lines.push(
      `Steps ${LOOKBACK_DAYS}d avg: ${fmtNum(steps7Avg)}/day${
        typeof todaysSteps === "number" ? ` (today ${fmtNum(todaysSteps)})` : ""
      }.`
    )
  } else {
    lines.push("Steps: (none logged)")
  }

  // ── Workouts ───────────────────────────────────────────────────────────────
  if (workoutSessions.length > 0) {
    lines.push(`Recent workouts (${workoutSessions.length} in ${LOOKBACK_DAYS}d):`)
    for (const w of workoutSessions.slice(0, 6)) {
      const mins = w.duration ? `${Math.round(w.duration / 60)}m` : "?"
      const bw = w.bodyWeightLb ? `, BW ${fmtNum(w.bodyWeightLb, 1)}lb` : ""
      lines.push(`  - ${ymd(w.date)} — ${w.name} (${mins}, ${w.status}${bw})`)
    }
  } else {
    lines.push(`Recent workouts: none in last ${LOOKBACK_DAYS}d.`)
  }

  // ── Runs ───────────────────────────────────────────────────────────────────
  if (runs.length > 0) {
    const totalMi = runs.reduce((s, r) => s + r.distance, 0)
    const totalMin = runs.reduce((s, r) => s + r.duration, 0) / 60
    lines.push(
      `Recent runs (${runs.length}): ${fmtNum(totalMi, 1)} mi total, ${fmtNum(
        totalMin
      )} min over last ${LOOKBACK_DAYS}d.`
    )
    for (const r of runs.slice(0, 4)) {
      lines.push(
        `  - ${ymd(r.date)} — ${fmtNum(r.distance, 1)} mi in ${Math.round(
          r.duration / 60
        )} min (${r.environment})`
      )
    }
  }

  // ── Habits ─────────────────────────────────────────────────────────────────
  if (habits.length > 0) {
    lines.push(`Habits (last ${LOOKBACK_DAYS}d hit-rate):`)
    for (const h of habits) {
      const hits = habitCompletionCount[h.id] ?? 0
      lines.push(`  - ${h.name} (${h.frequency}): ${hits}/${LOOKBACK_DAYS}`)
    }
  }

  // ── Recovery ───────────────────────────────────────────────────────────────
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

  // ── Injuries / Treatments ──────────────────────────────────────────────────
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
  if (treatmentLogs.length > 0) {
    lines.push(`Recent treatments (${treatmentLogs.length} in ${LOOKBACK_DAYS}d):`)
    for (const t of treatmentLogs.slice(0, 5)) {
      const label = t.injury?.customLabel || t.injury?.conditionKey || "unknown"
      lines.push(
        `  - ${ymd(t.date)} — ${t.treatmentKey} for ${label}${t.completed ? "" : " (skipped)"}`
      )
    }
  }

  // ── Journal ────────────────────────────────────────────────────────────────
  if (journalEntries.length > 0) {
    const moodScores = journalEntries
      .map((j) => j.mood)
      .filter((m): m is number => typeof m === "number" && m > 0)
    if (moodScores.length > 0) {
      lines.push(
        `Journal mood: avg ${fmtNum(avg(moodScores), 1)}/5 over ${moodScores.length} entries.`
      )
    }
    const withContent = journalEntries.filter((j) => j.content && j.content.trim().length > 0)
    for (const j of withContent.slice(0, 2)) {
      lines.push(`  - ${ymd(j.date)} note: "${truncate(j.content, 200)}"`)
    }
  }

  // ── Bowel ──────────────────────────────────────────────────────────────────
  if (bowel.length > 0) {
    const avgScale = avg(bowel.map((b) => b.bristolScale))
    lines.push(
      `Bowel (${bowel.length} in ${LOOKBACK_DAYS}d): avg Bristol ${fmtNum(avgScale, 1)}/7.`
    )
    for (const b of bowel.slice(0, 3)) {
      const noteSuffix = b.notes ? ` — "${truncate(b.notes, 60)}"` : ""
      lines.push(
        `  - ${ymd(b.date)} ${format(b.time, "HH:mm")} Bristol ${b.bristolScale}${noteSuffix}`
      )
    }
  }

  // ── Alcohol ────────────────────────────────────────────────────────────────
  if (alcohol.length > 0) {
    const totalUnits = sum(alcohol.map((a) => a.units))
    lines.push(
      `Alcohol (${alcohol.length} drinks in ${LOOKBACK_DAYS}d): ${fmtNum(
        totalUnits,
        1
      )} std drinks total.`
    )
    for (const a of alcohol.slice(0, 3)) {
      lines.push(
        `  - ${ymd(a.date)} ${a.drinkType} ×${fmtNum(a.quantity, 1)} (${fmtNum(a.units, 1)} u)`
      )
    }
  } else {
    lines.push("Alcohol: none in last 7d.")
  }

  // ── Fasting ────────────────────────────────────────────────────────────────
  if (fasting) {
    const baseLine = `Fasting profile: ${fasting.fastHours}:${fasting.eatHours} (${fasting.mode}).`
    if (fasting.mode === "anchored" && fasting.lastMealAtMs) {
      const lastMealMs = Number(fasting.lastMealAtMs)
      if (Number.isFinite(lastMealMs)) {
        const minsSince = differenceInMinutes(now, new Date(lastMealMs))
        const hrsSince = minsSince / 60
        const eatWindowEnd = lastMealMs + fasting.eatHours * 60 * 60 * 1000
        const fastEnd = eatWindowEnd + fasting.fastHours * 60 * 60 * 1000
        const phase =
          now.getTime() < eatWindowEnd
            ? `eating window (closes in ${fmtNum((eatWindowEnd - now.getTime()) / 3_600_000, 1)}h)`
            : now.getTime() < fastEnd
              ? `fasting (${fmtNum(
                  (now.getTime() - eatWindowEnd) / 3_600_000,
                  1
                )}h in, ${fmtNum((fastEnd - now.getTime()) / 3_600_000, 1)}h to go)`
              : `fast complete (${fmtNum((now.getTime() - fastEnd) / 3_600_000, 1)}h past target)`
        lines.push(
          `${baseLine} Last meal ${fmtNum(hrsSince, 1)}h ago — currently in ${phase}.`
        )
      } else {
        lines.push(baseLine)
      }
    } else if (fasting.mode === "clock") {
      const startH = Math.floor(fasting.eatWindowStartMinutes / 60)
      const startM = fasting.eatWindowStartMinutes % 60
      lines.push(
        `${baseLine} Eating window opens at ${pad2(startH)}:${pad2(startM)} local each day.`
      )
    } else {
      lines.push(baseLine)
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
    const k = utcCalendarDayKeyFromIso(r.date)
    if (!k) continue
    map[k] = (map[k] ?? 0) + (r.value ?? 0)
  }
  return map
}

function sum(values: number[]): number {
  let total = 0
  for (const v of values) {
    if (Number.isFinite(v)) total += v
  }
  return total
}

function avg(values: number[]): number {
  const filtered = values.filter((v) => Number.isFinite(v))
  if (filtered.length === 0) return 0
  return filtered.reduce((s, v) => s + v, 0) / filtered.length
}

/**
 * yyyy-MM-dd matching how dates are stored for most trackers in this app
 * (UTC calendar components — see `dateStorage.ts`).
 */
function ymd(d: Date): string {
  return utcCalendarDayKeyFromIso(d) || format(d, "yyyy-MM-dd")
}

function mealMacroFragment(m: {
  protein: number | null
  carbs: number | null
  fat: number | null
}): string {
  const p = m.protein != null ? `${fmtNum(m.protein)}P` : "—P"
  const c = m.carbs != null ? `${fmtNum(m.carbs)}C` : "—C"
  const f = m.fat != null ? `${fmtNum(m.fat)}F` : "—F"
  return `${p}/${c}/${f}`
}

function formatHmUserTz(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d)
}

function fmtNum(n: number, digits = 0): string {
  if (!Number.isFinite(n) || n === 0) return "0"
  return digits === 0 ? String(Math.round(n)) : n.toFixed(digits)
}

function signed(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "0"
  const sign = n > 0 ? "+" : ""
  return `${sign}${digits === 0 ? Math.round(n) : n.toFixed(digits)}`
}

function pad2(n: number): string {
  return String(Math.max(0, Math.round(n))).padStart(2, "0")
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
