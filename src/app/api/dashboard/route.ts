import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { kmToMiles, runKmToStepsFromRun } from "@/lib/units"
import { startOfDay, subDays } from "date-fns"

export async function GET(req: NextRequest) {
  try {
    const dateParam = req.nextUrl.searchParams.get("d")
    const refDate = dateParam
      ? startOfDay(new Date(dateParam + "T00:00:00"))
      : startOfDay(new Date())

    const today = refDate
    const weekAgo = subDays(today, 6)

    const [
      calorieEntries,
      stepEntries,
      runEntries,
      workoutEntries,
      sleepEntries,
      alcoholEntries,
      bowelEntries,
      goals,
    ] = await Promise.all([
      prisma.calorieEntry.findMany({ where: { date: { gte: weekAgo } } }),
      prisma.stepEntry.findMany({ where: { date: { gte: weekAgo } } }),
      prisma.runEntry.findMany({ where: { date: { gte: weekAgo } } }),
      prisma.workoutEntry.findMany({ where: { date: { gte: weekAgo } } }),
      prisma.sleepEntry.findMany({ where: { date: { gte: weekAgo } } }),
      prisma.alcoholEntry.findMany({ where: { date: { gte: weekAgo } } }),
      prisma.bowelEntry.findMany({ where: { date: { gte: weekAgo } } }),
      prisma.goal.findMany({ where: { active: true } }),
    ])

    const dailyGoalMap = new Map<string, { target: number; direction: string }>()
    for (const g of goals) {
      if (g.goalType === "daily" || g.goalType === "target") {
        dailyGoalMap.set(g.category, { target: g.target, direction: g.direction })
      }
    }

    function dailyTotals<T extends { date: Date }>(
      entries: T[],
      valueExtractor: (items: T[]) => number
    ): number[] {
      const result: number[] = []
      for (let i = 0; i <= 6; i++) {
        const day = subDays(today, 6 - i)
        const dayEntries = entries.filter(
          (e) => startOfDay(e.date).getTime() === day.getTime()
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
    const workoutLast7 = dailyTotals(workoutEntries, (items) => items.length)
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

    return NextResponse.json({
      calories: {
        todayValue: calorieLast7[6],
        goal: dailyGoalMap.get("calories")?.target ?? 2000,
        direction: dailyGoalMap.get("calories")?.direction ?? "up",
        unit: "cal",
        last7: calorieLast7,
      },
      steps: {
        todayValue: stepsLast7[6],
        goal: dailyGoalMap.get("steps")?.target ?? 10000,
        direction: dailyGoalMap.get("steps")?.direction ?? "up",
        unit: "steps",
        last7: stepsLast7,
      },
      running: {
        todayValue: Math.round(runLast7[6] * 10) / 10,
        goal: dailyGoalMap.get("running")
          ? Math.round(kmToMiles(dailyGoalMap.get("running")!.target) * 10) / 10
          : null,
        direction: dailyGoalMap.get("running")?.direction ?? "up",
        unit: "mi",
        last7: runLast7,
      },
      workouts: {
        todayValue: workoutLast7[6],
        goal: dailyGoalMap.get("workouts")?.target ?? null,
        direction: dailyGoalMap.get("workouts")?.direction ?? "up",
        unit: "sessions",
        last7: workoutLast7,
      },
      sleep: {
        todayValue: Math.round(sleepLast7[6] * 10) / 10,
        goal: dailyGoalMap.get("sleep")?.target ?? 8,
        direction: dailyGoalMap.get("sleep")?.direction ?? "up",
        unit: "hrs",
        last7: sleepLast7,
      },
      alcohol: {
        todayValue: alcoholLast7[6],
        goal: dailyGoalMap.get("alcohol")?.target ?? null,
        direction: dailyGoalMap.get("alcohol")?.direction ?? "down",
        unit: "units",
        last7: alcoholLast7,
      },
      bowel: {
        todayValue: bowelLast7[6],
        goal: null,
        direction: "up",
        unit: "",
        last7: bowelLast7,
      },
    })
  } catch {
    return NextResponse.json(
      { error: "Database not connected" },
      { status: 503 }
    )
  }
}
