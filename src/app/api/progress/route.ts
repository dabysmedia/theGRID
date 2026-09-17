import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { dailySleepDurationHours } from "@/lib/sleepDuration"
import { resolveUserId, UserError } from "@/lib/current-user"
import {
  utcCalendarDayKeyFromIso,
  utcCalendarDayRangeInclusive,
} from "@/lib/dateStorage"
import {
  DEFAULT_STEPS_TIMEZONE,
  addDaysYmd,
  resolveStepsTimezone,
  stepsDayKey,
  stepsRefDayKey,
} from "@/lib/steps-day"
import { kmToMiles, runKmToStepsFromRun } from "@/lib/units"
import { TRACKING_TARGET_DEFAULTS } from "@/lib/tracking-targets"
import {
  GRID_PROGRESS_LOOKBACK_DAYS,
  assembleProgressSnapshot,
  emptyDayValues,
  type DayValues,
  type ProgressGoals,
  type TrackKey,
} from "@/lib/grid-progress"

type GoalRow = {
  category: string
  goalType: string
  direction: string
  target: number
  unit: string
  createdAt: Date
}

function latestGoalByCategory(goals: GoalRow[]): Map<string, GoalRow> {
  const sorted = [...goals].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const map = new Map<string, GoalRow>()
  for (const g of sorted) {
    if (!map.has(g.category)) map.set(g.category, g)
  }
  return map
}

function dailyTarget(goal: GoalRow | undefined, fallback: number): { target: number; direction: "up" | "down" } {
  if (!goal) return { target: fallback, direction: "up" }
  const direction = goal.direction === "down" ? "down" : "up"
  if (goal.goalType === "weekly") {
    return { target: Math.round((goal.target / 7) * 10) / 10, direction }
  }
  return { target: goal.target, direction }
}

function bump(map: Map<string, DayValues>, date: string, patch: (day: DayValues) => void) {
  const current = map.get(date) ?? emptyDayValues()
  patch(current)
  map.set(date, current)
}

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const dateParam = req.nextUrl.searchParams.get("d")
    const now = new Date()
    const profile = await prisma.user.findUnique({
      where: { id: userId },
      select: { timeZone: true },
    })
    const trackingTz = resolveStepsTimezone(profile?.timeZone ?? DEFAULT_STEPS_TIMEZONE)
    const requested =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : stepsDayKey(now, trackingTz)
    const asOf = stepsRefDayKey(requested, now, trackingTz)
    const currentDay = stepsDayKey(now, trackingTz)
    const isCurrent = asOf === currentDay
    const rangeStart = addDaysYmd(asOf, -(GRID_PROGRESS_LOOKBACK_DAYS - 1))
    const dateRange = utcCalendarDayRangeInclusive(rangeStart, asOf)

    const [
      calorieEntries,
      stepEntries,
      runEntries,
      workoutEntries,
      sleepEntries,
      waterEntries,
      journalEntries,
      goals,
    ] = await Promise.all([
      prisma.calorieEntry.findMany({
        where: { date: dateRange, userId },
        select: { date: true, calories: true },
      }),
      prisma.stepEntry.findMany({
        where: { date: dateRange, userId },
        select: { date: true, count: true },
      }),
      prisma.runEntry.findMany({
        where: { date: dateRange, userId },
        select: { date: true, distance: true },
      }),
      prisma.workoutEntry.findMany({
        where: { date: dateRange, userId },
        select: { date: true },
      }),
      prisma.sleepEntry.findMany({
        where: { date: dateRange, userId },
        select: { date: true, bedtime: true, wakeTime: true, minutesAsleep: true },
      }),
      prisma.waterEntry.findMany({
        where: { date: dateRange, userId },
        select: { date: true, amountOz: true },
      }),
      prisma.journalEntry.findMany({
        where: { date: dateRange, userId },
        select: { date: true },
      }),
      prisma.goal.findMany({ where: { active: true, userId } }),
    ])

    const habits: Array<{
      id: string
      createdAt: Date
      completions: Array<{ date: Date }>
    }> = await prisma.habit.findMany({
      where: { userId, archived: false },
      select: {
        id: true,
        createdAt: true,
        completions: {
          where: { date: dateRange },
          select: { date: true },
        },
      },
    })

    let workoutSessions: { date: Date }[] = []
    try {
      workoutSessions = await prisma.workoutSession.findMany({
        where: { date: dateRange, status: "completed", userId },
        select: { date: true },
      })
    } catch {
      workoutSessions = []
    }

    let cardioEntries: { date: Date; minutes: number }[] = []
    try {
      cardioEntries = await prisma.cardioEntry.findMany({
        where: { date: dateRange, userId, deletedAt: null },
        select: { date: true, minutes: true },
      })
    } catch {
      cardioEntries = []
    }

    let weightEntries: { date: Date; value: number }[] = []
    try {
      const bodyWeightGoal = await prisma.longGoal.findFirst({
        where: { category: "bodyweight", userId },
        select: { id: true },
      })
      if (bodyWeightGoal) {
        weightEntries = await prisma.longGoalEntry.findMany({
          where: { goalId: bodyWeightGoal.id, date: dateRange },
          select: { date: true, value: true },
        })
      }
    } catch {
      weightEntries = []
    }

    const days = new Map<string, DayValues>()

    for (const e of calorieEntries) {
      const key = utcCalendarDayKeyFromIso(e.date)
      bump(days, key, (d) => {
        d.calories += e.calories
      })
    }
    for (const e of stepEntries) {
      const key = utcCalendarDayKeyFromIso(e.date)
      bump(days, key, (d) => {
        d.steps += e.count
      })
    }
    for (const e of runEntries) {
      const key = utcCalendarDayKeyFromIso(e.date)
      bump(days, key, (d) => {
        d.steps += runKmToStepsFromRun(e.distance)
        d.runMiles += kmToMiles(e.distance)
      })
    }
    for (const e of workoutEntries) {
      const key = utcCalendarDayKeyFromIso(e.date)
      bump(days, key, (d) => {
        d.workouts += 1
      })
    }
    for (const e of workoutSessions) {
      const key = utcCalendarDayKeyFromIso(e.date)
      bump(days, key, (d) => {
        d.workouts += 1
      })
    }
    for (const e of cardioEntries) {
      const key = utcCalendarDayKeyFromIso(e.date)
      bump(days, key, (d) => {
        d.cardioMinutes += e.minutes
      })
    }

    const sleepByDay = new Map<string, Array<{ bedtime: Date; wakeTime: Date; minutesAsleep: number | null }>>()
    for (const e of sleepEntries) {
      const key = utcCalendarDayKeyFromIso(e.date)
      const bucket = sleepByDay.get(key) ?? []
      bucket.push({ bedtime: e.bedtime, wakeTime: e.wakeTime, minutesAsleep: e.minutesAsleep })
      sleepByDay.set(key, bucket)
    }
    for (const [key, items] of sleepByDay) {
      bump(days, key, (d) => {
        d.sleepHrs = dailySleepDurationHours(items)
      })
    }

    for (const e of waterEntries) {
      const key = utcCalendarDayKeyFromIso(e.date)
      bump(days, key, (d) => {
        d.waterOz += e.amountOz
      })
    }
    for (const e of journalEntries) {
      const key = utcCalendarDayKeyFromIso(e.date)
      bump(days, key, (d) => {
        d.journal = true
      })
    }
    for (const e of weightEntries) {
      const key = utcCalendarDayKeyFromIso(e.date)
      bump(days, key, (d) => {
        d.weight = e.value
      })
    }

    if (habits.length > 0) {
      let cursor = rangeStart
      while (cursor <= asOf) {
        const activeCount = habits.filter((h) => utcCalendarDayKeyFromIso(h.createdAt) <= cursor).length
        bump(days, cursor, (d) => {
          d.habitsTotal = activeCount
        })
        cursor = addDaysYmd(cursor, 1)
      }
      for (const habit of habits) {
        for (const completion of habit.completions) {
          const key = utcCalendarDayKeyFromIso(completion.date)
          bump(days, key, (d) => {
            d.habitsDone += 1
          })
        }
      }
    }

    const goalByCategory = latestGoalByCategory(goals)
    const progressGoals: ProgressGoals = {
      calories: {
        ...dailyTarget(goalByCategory.get("calories"), TRACKING_TARGET_DEFAULTS.calories),
        direction: goalByCategory.get("calories")?.direction === "up" ? "up" : "down",
      },
      steps: dailyTarget(goalByCategory.get("steps"), TRACKING_TARGET_DEFAULTS.steps),
      sleep: dailyTarget(goalByCategory.get("sleep"), TRACKING_TARGET_DEFAULTS.sleep),
      water: dailyTarget(goalByCategory.get("water"), TRACKING_TARGET_DEFAULTS.water),
    }

    const enabledTracks: TrackKey[] = [
      "calories",
      "steps",
      "sleep",
      "training",
      "weight",
      "water",
      "journal",
    ]
    if (habits.length > 0) enabledTracks.splice(6, 0, "habits")

    const snapshot = assembleProgressSnapshot({
      asOf,
      isCurrent,
      rangeStart,
      days,
      goals: progressGoals,
      enabledTracks,
    })

    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store, must-revalidate" },
    })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json(
        { error: e.message },
        { status: e.status, headers: { "Cache-Control": "no-store, must-revalidate" } },
      )
    }
    console.error("[progress] GET failed:", e)
    return NextResponse.json(
      { error: "Failed to load progression" },
      { status: 500, headers: { "Cache-Control": "no-store, must-revalidate" } },
    )
  }
}
