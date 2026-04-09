import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { kmToMiles, runKmToStepsFromRun } from "@/lib/units"
import { formatDate } from "@/lib/utils"
import { subDays } from "date-fns"
import {
  parseYyyyMmDdToStoredDate,
  utcCalendarDayKeyFromIso,
  utcCalendarDayRangeInclusive,
} from "@/lib/dateStorage"

/** Matches Prisma Goal — used here so dashboard logic stays typed if client stubs lag schema. */
interface GoalRow {
  category: string
  goalType: string
  direction: string
  target: number
  unit: string
  createdAt: Date
}

/** Running distance goals are entered in miles (`unit: mi`); legacy rows may store km. */
function runningTargetMiles(target: number, unit: string): number {
  if (unit === "mi") return target
  return kmToMiles(target)
}

/**
 * Maps CategoryGoal presets to a single number comparable to today's dashboard value.
 * Weekly-style goals are converted to daily equivalents where the UI shows daily totals.
 */
function dashboardGoalValue(g: GoalRow): number | null {
  const { category, goalType, target, unit } = g
  switch (category) {
    case "calories":
      if (goalType === "daily" || goalType === "weekly_avg" || goalType === "target") {
        return target
      }
      return null
    case "steps":
      if (goalType === "daily" || goalType === "target") return target
      if (goalType === "weekly") return Math.round((target / 7) * 10) / 10
      return null
    case "running": {
      if (goalType === "pace") return null
      const mi = runningTargetMiles(target, unit)
      if (goalType === "weekly") return Math.round((mi / 7) * 10) / 10
      if (goalType === "daily" || goalType === "target" || goalType === "per_session") {
        return Math.round(mi * 10) / 10
      }
      return null
    }
    case "workouts":
      if (goalType === "per_session") return null
      if (goalType === "weekly") return Math.round((target / 7) * 10) / 10
      if (goalType === "daily" || goalType === "target") return target
      return null
    case "sleep":
      if (goalType === "daily" || goalType === "weekly_avg" || goalType === "target") {
        return target
      }
      return null
    case "alcohol":
      if (goalType === "daily" || goalType === "target") return target
      if (goalType === "weekly") return Math.round((target / 7) * 10) / 10
      return null
    case "bowel":
      if (goalType === "daily" || goalType === "target") return target
      return null
    default:
      return null
  }
}

function latestGoalByCategory(goals: GoalRow[]): Map<string, GoalRow> {
  const sorted = [...goals].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )
  const map = new Map<string, GoalRow>()
  for (const g of sorted) {
    if (!map.has(g.category)) map.set(g.category, g)
  }
  return map
}

export async function GET(req: NextRequest) {
  try {
    const dateParam = req.nextUrl.searchParams.get("d")
    const refDayStr =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? dateParam
        : formatDate(new Date())
    /** Same UTC-noon anchor as weigh-in / Prisma writes — avoids local-vs-UTC bucket mismatch. */
    const anchorDate = parseYyyyMmDdToStoredDate(refDayStr)
    const weekStartStr = utcCalendarDayKeyFromIso(subDays(anchorDate, 6))
    const rangeEndStr = utcCalendarDayKeyFromIso(anchorDate)
    const dateInRange = utcCalendarDayRangeInclusive(weekStartStr, rangeEndStr)

    const [
      calorieEntries,
      stepEntries,
      runEntries,
      workoutEntries,
      workoutSessions,
      sleepEntries,
      alcoholEntries,
      bowelEntries,
      goals,
    ] = await Promise.all([
      prisma.calorieEntry.findMany({ where: { date: dateInRange } }),
      prisma.stepEntry.findMany({ where: { date: dateInRange } }),
      prisma.runEntry.findMany({ where: { date: dateInRange } }),
      prisma.workoutEntry.findMany({ where: { date: dateInRange } }),
      prisma.workoutSession.findMany({
        where: { date: dateInRange, status: "completed" },
      }),
      prisma.sleepEntry.findMany({ where: { date: dateInRange } }),
      prisma.alcoholEntry.findMany({ where: { date: dateInRange } }),
      prisma.bowelEntry.findMany({ where: { date: dateInRange } }),
      prisma.goal.findMany({ where: { active: true } }),
    ])

    const goalByCategory = latestGoalByCategory(goals)

    function dailyTotals<T extends { date: Date }>(
      entries: T[],
      valueExtractor: (items: T[]) => number
    ): number[] {
      const result: number[] = []
      for (let i = 0; i <= 6; i++) {
        const day = subDays(anchorDate, 6 - i)
        const dayKey = utcCalendarDayKeyFromIso(day)
        const dayEntries = entries.filter(
          (e) => utcCalendarDayKeyFromIso(e.date) === dayKey
        )
        result.push(valueExtractor(dayEntries))
      }
      return result
    }

    const calorieLast7 = dailyTotals(calorieEntries, (items) =>
      items.reduce((s, e) => s + e.calories, 0)
    )
    const stepsLoggedLast7 = dailyTotals(stepEntries, (items) =>
      items.reduce((s, e) => s + e.count, 0)
    )
    const stepsFromRunsLast7 = dailyTotals(runEntries, (items) =>
      items.reduce((s, e) => s + runKmToStepsFromRun(e.distance), 0)
    )
    const stepsLast7 = stepsLoggedLast7.map((s, i) => s + stepsFromRunsLast7[i])
    const runLast7Km = dailyTotals(runEntries, (items) =>
      items.reduce((s, e) => s + e.distance, 0)
    )
    const runLast7 = runLast7Km.map((km) => Math.round(kmToMiles(km) * 10) / 10)
    const legacyWorkoutLast7 = dailyTotals(workoutEntries, (items) => items.length)
    const sessionWorkoutLast7 = dailyTotals(workoutSessions, (items) => items.length)
    const workoutLast7 = legacyWorkoutLast7.map((v, i) => v + sessionWorkoutLast7[i])
    const sleepLast7 = dailyTotals(sleepEntries, (items) => {
      if (!items.length) return 0
      const entry = items[0]
      return (
        (new Date(entry.wakeTime).getTime() -
          new Date(entry.bedtime).getTime()) /
        3600000
      )
    })
    const alcoholLast7 = dailyTotals(alcoholEntries, (items) =>
      items.reduce((s, e) => s + e.units, 0)
    )
    const bowelLast7 = dailyTotals(bowelEntries, (items) => items.length)

    const calG = goalByCategory.get("calories")
    const stepsG = goalByCategory.get("steps")
    const runG = goalByCategory.get("running")
    const woG = goalByCategory.get("workouts")
    const sleepG = goalByCategory.get("sleep")
    const alcG = goalByCategory.get("alcohol")
    const bowelG = goalByCategory.get("bowel")

    const calGoal = calG ? dashboardGoalValue(calG) : null
    const stepsGoal = stepsG ? dashboardGoalValue(stepsG) : null
    const runGoal = runG ? dashboardGoalValue(runG) : null
    const woGoal = woG ? dashboardGoalValue(woG) : null
    const sleepGoal = sleepG ? dashboardGoalValue(sleepG) : null
    const alcGoal = alcG ? dashboardGoalValue(alcG) : null
    const bowelGoal = bowelG ? dashboardGoalValue(bowelG) : null

    const body = {
      calories: {
        todayValue: calorieLast7[6],
        goal: calGoal ?? 2000,
        direction: calG?.direction ?? "down",
        unit: "cal",
        last7: calorieLast7,
      },
      steps: {
        todayValue: stepsLast7[6],
        goal: stepsGoal ?? 10000,
        direction: stepsG?.direction ?? "up",
        unit: "steps",
        last7: stepsLast7,
      },
      running: {
        todayValue: Math.round(runLast7[6] * 10) / 10,
        goal: runGoal,
        direction: runG?.direction ?? "up",
        unit: "mi",
        last7: runLast7,
      },
      workouts: {
        todayValue: workoutLast7[6],
        goal: woGoal,
        direction: woG?.direction ?? "up",
        unit: "sessions",
        last7: workoutLast7,
      },
      sleep: {
        todayValue: Math.round(sleepLast7[6] * 10) / 10,
        goal: sleepGoal ?? 8,
        direction: sleepG?.direction ?? "up",
        unit: "hrs",
        last7: sleepLast7,
      },
      alcohol: {
        todayValue: alcoholLast7[6],
        goal: alcGoal,
        direction: alcG?.direction ?? "down",
        unit: "units",
        last7: alcoholLast7,
      },
      bowel: {
        todayValue: bowelLast7[6],
        goal: bowelGoal,
        direction: bowelG?.direction ?? "up",
        unit: "",
        last7: bowelLast7,
      },
    }

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    })
  } catch {
    return NextResponse.json(
      { error: "Database not connected" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store, must-revalidate" },
      }
    )
  }
}
