import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { kmToMiles, runKmToStepsFromRun } from "@/lib/units"
import { formatDate, parseLocalDate } from "@/lib/utils"
import { format } from "date-fns"
import { subDays } from "date-fns"
import { startOfISOWeek } from "date-fns"
import {
  utcCalendarDayKeyFromIso,
  utcCalendarDayRangeInclusive,
} from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"
import { sleepDurationHours } from "@/lib/sleepDuration"
import { computeReadinessScore } from "@/lib/readiness-score"
import { deriveSleepScore, qualityToScore } from "@/lib/sleep-score"

interface GoalRow {
  category: string
  goalType: string
  direction: string
  target: number
  unit: string
  createdAt: Date
}

interface DatedRow {
  date: Date
}

type WeightBaselineTrend = "losing" | "maintaining" | "gaining"

const WEEKLY_WEIGHT_MAINTAIN_LB = 0.45

function computeWeeklyWeightTrend(
  entries: { date: Date; value: number }[]
): {
  baselineTrend: WeightBaselineTrend
  vsBaselineLb: number
} | null {
  const byWeekStart = new Map<number, number[]>()
  for (const entry of entries) {
    const t = startOfISOWeek(entry.date).getTime()
    if (!byWeekStart.has(t)) byWeekStart.set(t, [])
    byWeekStart.get(t)!.push(entry.value)
  }
  if (byWeekStart.size === 0) return null

  const weekAverages = [...byWeekStart.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, vals]) => vals.reduce((s, v) => s + v, 0) / vals.length)
  if (weekAverages.length === 0) return null

  const lastWeekAverage = weekAverages[weekAverages.length - 1]!
  const grandMean = weekAverages.reduce((s, v) => s + v, 0) / weekAverages.length
  const vsBaselineLb = Math.round((lastWeekAverage - grandMean) * 10) / 10

  let baselineTrend: WeightBaselineTrend = "maintaining"
  if (vsBaselineLb < -WEEKLY_WEIGHT_MAINTAIN_LB) baselineTrend = "losing"
  else if (vsBaselineLb > WEEKLY_WEIGHT_MAINTAIN_LB) baselineTrend = "gaining"

  return { baselineTrend, vsBaselineLb }
}

function recoveryCompositeFromEntry(e: {
  pain: number
  energy: number
  mood: number
  soreness: number
  stress: number
  mobility: number
  sleepFeel: number
}): number {
  const inv = (x: number) => 11 - x
  return (
    (e.energy + e.mood + e.mobility + e.sleepFeel + inv(e.pain) + inv(e.soreness) + inv(e.stress)) / 7
  )
}

function runningTargetMiles(target: number, unit: string): number {
  if (unit === "mi") return target
  return kmToMiles(target)
}

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
    case "peptides":
      if (goalType === "weekly") return target
      if (goalType === "daily" || goalType === "target") return target
      return null
    case "alcohol":
      if (goalType === "daily" || goalType === "target") return target
      if (goalType === "weekly") return Math.round((target / 7) * 10) / 10
      return null
    case "bowel":
      if (goalType === "daily" || goalType === "target") return target
      return null
    case "recovery":
      if (goalType === "daily" || goalType === "weekly_avg" || goalType === "target") {
        return target
      }
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
    const userId = await resolveUserId(req)

    const dateParam = req.nextUrl.searchParams.get("d")
    const refDate =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? parseLocalDate(dateParam)
        : new Date()
    const refDayStr = formatDate(refDate)
    const weekStartStr = formatDate(subDays(refDate, 6))
    const vitalsBaselineStartStr = formatDate(subDays(refDate, 29))
    const weightRangeStartStr = formatDate(subDays(refDate, 55))
    const dateInRange = utcCalendarDayRangeInclusive(weekStartStr, refDayStr)
    const vitalsBaselineRange = utcCalendarDayRangeInclusive(
      vitalsBaselineStartStr,
      refDayStr,
    )
    const weightDateInRange = utcCalendarDayRangeInclusive(weightRangeStartStr, refDayStr)

    const [
      calorieEntries,
      stepEntries,
      runEntries,
      workoutEntries,
      sleepEntries,
      peptideEntries,
      alcoholEntries,
      bowelEntries,
      recoveryEntries,
      vitalEntries,
      vitalBaselineEntries,
      goals,
      bodyWeightGoal,
    ] = await Promise.all([
      prisma.calorieEntry.findMany({ where: { date: dateInRange, userId } }),
      prisma.stepEntry.findMany({ where: { date: dateInRange, userId } }),
      prisma.runEntry.findMany({ where: { date: dateInRange, userId } }),
      prisma.workoutEntry.findMany({ where: { date: dateInRange, userId } }),
      prisma.sleepEntry.findMany({ where: { date: dateInRange, userId } }),
      prisma.peptideEntry.findMany({ where: { date: dateInRange, userId } }),
      prisma.alcoholEntry.findMany({ where: { date: dateInRange, userId } }),
      prisma.bowelEntry.findMany({ where: { date: dateInRange, userId } }),
      prisma.recoveryDailyEntry.findMany({ where: { date: dateInRange, userId } }),
      prisma.vitalDailyEntry.findMany({ where: { date: dateInRange, userId } }),
      prisma.vitalDailyEntry.findMany({
        where: { date: vitalsBaselineRange, userId },
        select: { date: true, hrvMs: true, restingHeartRate: true },
      }),
      prisma.goal.findMany({ where: { active: true, userId } }),
      prisma.longGoal.findFirst({
        where: { category: "bodyweight", userId },
        select: { id: true },
      }),
    ])

    let workoutSessions: DatedRow[] = []
    try {
      workoutSessions = await prisma.workoutSession.findMany({
        where: { date: dateInRange, status: "completed", userId },
        select: { date: true },
      })
    } catch (err) {
      console.warn(
        "[dashboard] workoutSession query failed, falling back to legacy workouts only:",
        (err as Error).message
      )
    }

    const goalByCategory = latestGoalByCategory(goals)
    const weightEntries =
      bodyWeightGoal != null
        ? await prisma.longGoalEntry.findMany({
            where: { goalId: bodyWeightGoal.id, date: weightDateInRange },
            select: { date: true, value: true },
          })
        : []

    function dailyTotals<T extends { date: Date }>(
      entries: T[],
      valueExtractor: (items: T[]) => number
    ): number[] {
      const result: number[] = []
      for (let i = 0; i <= 6; i++) {
        const day = subDays(refDate, 6 - i)
        const dayKey = format(day, "yyyy-MM-dd")
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
      const hrs = items.map((e) => sleepDurationHours(e.bedtime, e.wakeTime))
      return Math.round((hrs.reduce((s, v) => s + v, 0) / hrs.length) * 10) / 10
    })
    const peptidesLast7 = dailyTotals(peptideEntries, (items) =>
      items.reduce((s, e) => s + e.doseMg, 0)
    )
    const alcoholLast7 = dailyTotals(alcoholEntries, (items) =>
      items.reduce((s, e) => s + e.units, 0)
    )
    const bowelLast7 = dailyTotals(bowelEntries, (items) => items.length)
    const recoveryLast7 = dailyTotals(recoveryEntries, (items) => {
      if (!items.length) return 0
      const e = items[0]
      return recoveryCompositeFromEntry(e)
    })
    const vitalsLast7 = dailyTotals(vitalEntries, (items) => {
      const withHrv = items.filter((e) => e.hrvMs != null)
      if (!withHrv.length) return 0
      return withHrv.reduce((s, e) => s + (e.hrvMs ?? 0), 0) / withHrv.length
    })

    const sleepScoreLast7 = dailyTotals(sleepEntries, (items) => {
      if (!items.length) return 0
      const scores = items.map((e) => {
        if (e.score != null && Number.isFinite(e.score)) return e.score
        const derived = deriveSleepScore({
          remMinutes: e.remMinutes,
          lightMinutes: e.lightMinutes,
          deepMinutes: e.deepMinutes,
          awakeMinutes: e.awakeMinutes,
          efficiency: e.efficiency,
        })
        if (derived != null) return derived
        return qualityToScore(e.quality)
      })
      return scores.reduce((s, v) => s + v, 0) / scores.length
    })

    const hrvBaselineSamples = vitalBaselineEntries
      .map((e) => e.hrvMs)
      .filter((v): v is number => v != null && v > 0)
    const rhrBaselineSamples = vitalBaselineEntries
      .map((e) => e.restingHeartRate)
      .filter((v): v is number => v != null && v > 0)

    const readinessLast7: number[] = []
    let todayHrvMs: number | null = null
    let todayRhr: number | null = null
    for (let i = 0; i <= 6; i++) {
      const day = subDays(refDate, 6 - i)
      const dayKey = format(day, "yyyy-MM-dd")
      const dayVitals = vitalEntries.filter(
        (e) => utcCalendarDayKeyFromIso(e.date) === dayKey,
      )
      const hrvVals = dayVitals
        .map((e) => e.hrvMs)
        .filter((v): v is number => v != null && v > 0)
      const rhrVals = dayVitals
        .map((e) => e.restingHeartRate)
        .filter((v): v is number => v != null && v > 0)
      const hrvMs = hrvVals.length
        ? hrvVals.reduce((s, v) => s + v, 0) / hrvVals.length
        : null
      const restingHeartRate = rhrVals.length
        ? Math.round(rhrVals.reduce((s, v) => s + v, 0) / rhrVals.length)
        : null
      if (i === 6) {
        todayHrvMs = hrvMs
        todayRhr = restingHeartRate
      }
      const sleepScore = sleepScoreLast7[i] > 0 ? sleepScoreLast7[i] : null
      const readiness = computeReadinessScore({
        hrvMs,
        restingHeartRate,
        sleepScore,
        hrvBaselineSamples,
        rhrBaselineSamples,
      })
      readinessLast7.push(readiness ?? 0)
    }

    const readinessLogged = readinessLast7.filter((v) => v > 0)
    const readinessWeekAvg =
      readinessLogged.length > 0
        ? Math.round(
            readinessLogged.reduce((s, v) => s + v, 0) / readinessLogged.length,
          )
        : null

    const calG = goalByCategory.get("calories")
    const stepsG = goalByCategory.get("steps")
    const runG = goalByCategory.get("running")
    const woG = goalByCategory.get("workouts")
    const sleepG = goalByCategory.get("sleep")
    const peptidesG = goalByCategory.get("peptides")
    const alcG = goalByCategory.get("alcohol")
    const bowelG = goalByCategory.get("bowel")
    const recoveryG = goalByCategory.get("recovery")

    const calGoal = calG ? dashboardGoalValue(calG) : null
    const stepsGoal = stepsG ? dashboardGoalValue(stepsG) : null
    const runGoal = runG ? dashboardGoalValue(runG) : null
    const woGoal = woG ? dashboardGoalValue(woG) : null
    const sleepGoal = sleepG ? dashboardGoalValue(sleepG) : null
    const peptidesGoal = peptidesG ? dashboardGoalValue(peptidesG) : null
    const alcGoal = alcG ? dashboardGoalValue(alcG) : null
    const bowelGoal = bowelG ? dashboardGoalValue(bowelG) : null
    const recoveryGoal = recoveryG ? dashboardGoalValue(recoveryG) : null

    const weightTrend = computeWeeklyWeightTrend(weightEntries)

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
      peptides: {
        todayValue: Math.round(peptidesLast7[6] * 10) / 10,
        goal: peptidesGoal,
        direction: peptidesG?.direction ?? "up",
        unit: "mg",
        last7: peptidesLast7.map((v) => Math.round(v * 10) / 10),
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
      recovery: {
        todayValue: Math.round(recoveryLast7[6] * 10) / 10,
        goal: recoveryGoal ?? 7,
        direction: recoveryG?.direction ?? "up",
        unit: "/10",
        last7: recoveryLast7.map((v) => Math.round(v * 10) / 10),
      },
      vitals: {
        todayValue: Math.round(vitalsLast7[6] * 10) / 10,
        goal: null,
        direction: "up",
        unit: "ms",
        last7: vitalsLast7.map((v) => Math.round(v * 10) / 10),
      },
      readiness: {
        /** Derived proxy — Google Health does not expose Fitbit Daily Readiness. */
        todayValue: readinessLast7[6] > 0 ? readinessLast7[6] : null,
        weekAvg: readinessWeekAvg,
        hrvMs: todayHrvMs != null ? Math.round(todayHrvMs * 10) / 10 : null,
        restingHeartRate: todayRhr,
        last7: readinessLast7,
      },
      weightTrend,
    }

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json(
        { error: e.message },
        { status: e.status, headers: { "Cache-Control": "no-store, must-revalidate" } }
      )
    }
    return NextResponse.json(
      { error: "Database not connected" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store, must-revalidate" },
      }
    )
  }
}
