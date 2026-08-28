import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { formatDate } from "@/lib/utils"
import { subDays } from "date-fns"
import {
  parseYyyyMmDdToStoredDate,
  utcCalendarDayKeyFromIso,
  utcCalendarDayRangeInclusive,
} from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"
import { assertNotVacationBlocked } from "@/lib/vacation-block-server"
import { normalizeDayKey } from "@/lib/vacation-mode"
import { addDaysToYmd, localCalendarDayKey } from "@/lib/steps-day"
import { runKmToStepsFromRun } from "@/lib/units"
import {
  considerBodyweightRecordLow,
  ensureBodyweightRecordLow,
} from "@/lib/weight-record-low"
import {
  buildWeightTrendSeries,
  resolveRecordLow,
  summarizeWeightTrend,
  type WeightLog,
} from "@/lib/weight-trend"
import {
  DEFAULT_EXPENDITURE_WINDOW_DAYS,
  RATE_WINDOWS,
  classifyIntakeDays,
  computeRateSet,
  computeWeightRate,
  currentTrendWeight,
  estimateExpenditure,
  projectWeight,
  summarizeActivity,
  type ActivityDayInput,
  type IntakeDayInput,
  type WeightRate,
} from "@/lib/weight-projection"

/** How far back the expenditure / trajectory math reads calories and activity. */
const ANALYTICS_LOOKBACK_DAYS = 120

/** Windows tried in order for the projection's headline rate. */
const PRIMARY_RATE_PREFERENCE = [30, 14, 90, 7] as const

async function getOrCreateGoal(userId: string) {
  let goal = await prisma.longGoal.findFirst({
    where: { category: "bodyweight", userId },
  })
  if (!goal) {
    goal = await prisma.longGoal.create({
      data: {
        name: "Bodyweight",
        category: "bodyweight",
        target: 0,
        unit: "lbs",
        direction: "down",
        active: true,
        userId,
      },
    })
  }
  return goal
}

/**
 * Rate of change, observed expenditure, and the forward projection.
 *
 * Calories are read per calendar day and graded before anything averages them,
 * so days the user never logged — or only half-logged — cannot masquerade as
 * low-intake days and inflate the maintenance estimate.
 */
async function buildWeightAnalytics(
  userId: string,
  logs: WeightLog[],
  trendPoints: ReturnType<typeof buildWeightTrendSeries>,
  opts: { timeZone: string | null; vacationResumeDate: string | null; goalTarget: number | null },
) {
  const today = localCalendarDayKey(new Date(), opts.timeZone)
  // Today's food log is still open, so every intake average stops at yesterday.
  const throughDate = addDaysToYmd(today, -1)
  const analysisStart = addDaysToYmd(today, -(ANALYTICS_LOOKBACK_DAYS - 1))
  const range = utcCalendarDayRangeInclusive(analysisStart, today)

  const [calorieRows, stepRows, runRows] = await Promise.all([
    prisma.calorieEntry.findMany({
      where: { userId, date: range },
      select: { date: true, calories: true },
    }),
    prisma.stepEntry.findMany({
      where: { userId, date: range },
      select: { date: true, count: true },
    }),
    prisma.runEntry.findMany({
      where: { userId, date: range },
      select: { date: true, distance: true },
    }),
  ])

  let cardioRows: { date: Date; calories: number | null }[] = []
  try {
    cardioRows = await prisma.cardioEntry.findMany({
      where: { userId, date: range, deletedAt: null },
      select: { date: true, calories: true },
    })
  } catch {
    // Older DBs without the cardio table just lose the cardio context line.
  }

  const intakeByDay = new Map<string, IntakeDayInput>()
  for (const row of calorieRows) {
    const key = utcCalendarDayKeyFromIso(row.date)
    if (!key) continue
    const prior = intakeByDay.get(key)
    if (prior) {
      prior.kcal += row.calories
      prior.entries += 1
    } else {
      intakeByDay.set(key, { date: key, kcal: row.calories, entries: 1 })
    }
  }

  const coverage = classifyIntakeDays([...intakeByDay.values()], {
    from: analysisStart,
    to: today,
    today,
    vacationResumeDate: opts.vacationResumeDate,
  })

  const activityByDay = new Map<string, ActivityDayInput>()
  const activityRow = (key: string): ActivityDayInput => {
    let row = activityByDay.get(key)
    if (!row) {
      row = { date: key, steps: 0, cardioKcal: 0 }
      activityByDay.set(key, row)
    }
    return row
  }
  for (const row of stepRows) {
    const key = utcCalendarDayKeyFromIso(row.date)
    if (key) activityRow(key).steps = (activityRow(key).steps ?? 0) + row.count
  }
  // Runs credit steps here the same way the steps page and dashboard do.
  for (const row of runRows) {
    const key = utcCalendarDayKeyFromIso(row.date)
    if (key) activityRow(key).steps = (activityRow(key).steps ?? 0) + runKmToStepsFromRun(row.distance)
  }
  for (const row of cardioRows) {
    const key = utcCalendarDayKeyFromIso(row.date)
    if (key && row.calories != null) {
      activityRow(key).cardioKcal = (activityRow(key).cardioKcal ?? 0) + row.calories
    }
  }

  const rateOpts = { vacationResumeDate: opts.vacationResumeDate }
  const rates = computeRateSet(logs, today, [...RATE_WINDOWS], rateOpts)
  let primaryRate: WeightRate | null = null
  for (const window of PRIMARY_RATE_PREFERENCE) {
    if (rates[window]) {
      primaryRate = rates[window]
      break
    }
  }

  const latestWeight = logs.length > 0 ? logs[logs.length - 1]!.value : null
  const activity =
    latestWeight != null
      ? summarizeActivity([...activityByDay.values()], {
          windowDays: DEFAULT_EXPENDITURE_WINDOW_DAYS,
          endDate: throughDate,
          bodyWeightLb: latestWeight,
        })
      : null

  // The expenditure rate has to end where the intake window ends, or the two
  // halves of the energy balance would cover different stretches of time.
  const energyRate = computeWeightRate(
    logs,
    DEFAULT_EXPENDITURE_WINDOW_DAYS,
    throughDate,
    rateOpts,
  )
  const energy = energyRate
    ? estimateExpenditure({ coverage, rate: energyRate, activity, endDate: throughDate })
    : null

  const trendNow = currentTrendWeight(trendPoints, today)
  const projection =
    trendNow && primaryRate
      ? projectWeight({
          startDate: trendNow.date,
          startWeight: trendNow.value,
          lbPerWeek: primaryRate.lbPerWeek,
          targetLb: opts.goalTarget,
        })
      : null

  return {
    today,
    throughDate,
    goalTarget: opts.goalTarget,
    trendWeight: trendNow?.value ?? null,
    rates,
    primaryRate,
    energy,
    projection,
    coverage: {
      from: coverage.from,
      to: coverage.to,
      completeDays: coverage.completeDays,
      partialDays: coverage.partialDays,
      untrackedDays: coverage.untrackedDays,
      excludedDays: coverage.excludedDays,
      eligibleDays: coverage.eligibleDays,
      typicalKcal: coverage.typicalKcal,
    },
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const [goal, profile] = await Promise.all([
      getOrCreateGoal(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: { vacationResumeDate: true, timeZone: true },
      }),
    ])
    const entries = await prisma.longGoalEntry.findMany({
      where: { goalId: goal.id },
      orderBy: { date: "desc" },
    })

    const todayStr = formatDate(new Date())
    const todayD = new Date()
    const weekAgoStr = formatDate(subDays(todayD, 6))
    const monthAgoStr = formatDate(subDays(todayD, 29))

    const todayEntry = entries.find((e) => utcCalendarDayKeyFromIso(e.date) === todayStr)

    function weightsByDayInRange(fromStr: string, toStr: string): Map<string, number> {
      const byDay = new Map<string, number>()
      for (const e of entries) {
        const k = utcCalendarDayKeyFromIso(e.date)
        if (k >= fromStr && k <= toStr && !byDay.has(k)) {
          byDay.set(k, e.value)
        }
      }
      return byDay
    }

    const last7Map = weightsByDayInRange(weekAgoStr, todayStr)
    const last30Map = weightsByDayInRange(monthAgoStr, todayStr)
    const last7Vals = [...last7Map.values()]
    const last30Vals = [...last30Map.values()]

    const values = entries.map((e) => e.value)
    const avg7 =
      last7Vals.length > 0
        ? Math.round(
            (last7Vals.reduce((s, v) => s + v, 0) / last7Vals.length) * 10
          ) / 10
        : null
    const avg30 =
      last30Vals.length > 0
        ? Math.round(
            (last30Vals.reduce((s, v) => s + v, 0) / last30Vals.length) * 10
          ) / 10
        : null

    const allTimeHigh = values.length ? Math.max(...values) : null

    const last7Keys = [...last7Map.keys()].sort()
    const weekChange =
      last7Keys.length >= 2
        ? Math.round(
            (last7Map.get(last7Keys[last7Keys.length - 1])! -
              last7Map.get(last7Keys[0])!) *
              10
          ) / 10
        : null

    const logs: WeightLog[] = [...entries]
      .reverse()
      .map((e) => ({ date: utcCalendarDayKeyFromIso(e.date), value: e.value }))
    const storedLow = await ensureBodyweightRecordLow(goal.id)
    const recordLow = resolveRecordLow(logs, storedLow)
    const points = buildWeightTrendSeries(logs, {
      vacationResumeDate: profile?.vacationResumeDate,
    })
    const latestLog = logs.length ? logs[logs.length - 1]! : null
    const insight = summarizeWeightTrend(points, recordLow, latestLog)

    const analytics = await buildWeightAnalytics(userId, logs, points, {
      timeZone: profile?.timeZone ?? null,
      vacationResumeDate: profile?.vacationResumeDate ?? null,
      goalTarget: goal.target > 0 ? goal.target : null,
    })

    return NextResponse.json({
      goalId: goal.id,
      unit: goal.unit,
      target: goal.target,
      direction: goal.direction,
      startValue: goal.startValue,
      entries,
      stats: {
        current: todayEntry?.value ?? entries[0]?.value ?? null,
        avg7,
        avg30,
        allTimeHigh,
        allTimeLow: insight.recordLow,
        allTimeLowDate: insight.recordLowDate,
        weekChange,
        totalEntries: entries.length,
      },
      trend: {
        points,
        insight,
      },
      analytics,
    })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const dayKey = normalizeDayKey(String(body.date ?? ""))
    if (dayKey) await assertNotVacationBlocked(userId, dayKey)
    const goal = await getOrCreateGoal(userId)
    const date = parseYyyyMmDdToStoredDate(String(body.date))

    const existing = await prisma.longGoalEntry.findFirst({
      where: { goalId: goal.id, date },
    })

    const value = parseFloat(body.value)
    if (existing) {
      const updated = await prisma.longGoalEntry.update({
        where: { id: existing.id },
        data: { value, notes: body.notes || null },
      })
      await considerBodyweightRecordLow(goal.id, value, date)
      return NextResponse.json(updated)
    }

    const entry = await prisma.longGoalEntry.create({
      data: {
        goalId: goal.id,
        date,
        value,
        notes: body.notes || null,
      },
    })
    await considerBodyweightRecordLow(goal.id, value, date)
    return NextResponse.json(entry, { status: 201 })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to create" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    const entry = await prisma.longGoalEntry.findUnique({
      where: { id },
      include: { goal: { select: { userId: true } } },
    })
    if (!entry || entry.goal.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    await prisma.longGoalEntry.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
