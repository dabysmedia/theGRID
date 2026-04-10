import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { startOfMonth, endOfMonth, eachDayOfInterval, format, addDays } from "date-fns"
import { kmToMiles } from "@/lib/units"
import { resolveUserId, UserError } from "@/lib/current-user"

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const monthParam = req.nextUrl.searchParams.get("month")
    const ref = monthParam
      ? new Date(monthParam + "-01T00:00:00")
      : new Date()

    const start = startOfMonth(ref)
    const end = endOfMonth(ref)
    const days = eachDayOfInterval({ start, end })
    const dayKeys = days.map((d) => format(d, "yyyy-MM-dd"))

    const dateRange = { gte: start, lte: end }

    const weightRange = { gte: start, lte: addDays(end, 2) }

    const [calories, steps, runs, workouts, sleeps, alcohols, bowels, weightData] =
      await Promise.all([
        prisma.calorieEntry.findMany({ where: { date: dateRange, userId } }),
        prisma.stepEntry.findMany({ where: { date: dateRange, userId } }),
        prisma.runEntry.findMany({ where: { date: dateRange, userId } }),
        prisma.workoutEntry.findMany({ where: { date: dateRange, userId } }),
        prisma.sleepEntry.findMany({ where: { date: dateRange, userId } }),
        prisma.alcoholEntry.findMany({ where: { date: dateRange, userId } }),
        prisma.bowelEntry.findMany({ where: { date: dateRange, userId } }),
        prisma.longGoalEntry.findMany({
          where: { date: weightRange, goal: { userId } },
          include: { goal: { select: { category: true } } },
        }),
      ])

    function dateKey(d: Date): string {
      return format(d, "yyyy-MM-dd")
    }

    const calByDay = new Map<string, number>()
    for (const e of calories) calByDay.set(dateKey(e.date), (calByDay.get(dateKey(e.date)) ?? 0) + e.calories)

    const stepsByDay = new Map<string, number>()
    for (const e of steps) stepsByDay.set(dateKey(e.date), (stepsByDay.get(dateKey(e.date)) ?? 0) + e.count)

    const runDistByDay = new Map<string, number>()
    const runPaceByDay = new Map<string, number[]>()
    for (const e of runs) {
      const k = dateKey(e.date)
      runDistByDay.set(k, (runDistByDay.get(k) ?? 0) + kmToMiles(e.distance))
      if (e.distance > 0 && e.duration > 0) {
        const pace = e.duration / kmToMiles(e.distance)
        if (!runPaceByDay.has(k)) runPaceByDay.set(k, [])
        runPaceByDay.get(k)!.push(pace)
      }
    }

    const workoutsByDay = new Map<string, number>()
    for (const e of workouts) workoutsByDay.set(dateKey(e.date), (workoutsByDay.get(dateKey(e.date)) ?? 0) + 1)

    const sleepByDay = new Map<string, number>()
    for (const e of sleeps) {
      const hrs = (new Date(e.wakeTime).getTime() - new Date(e.bedtime).getTime()) / 3600000
      sleepByDay.set(dateKey(e.date), hrs)
    }

    const alcoholByDay = new Map<string, number>()
    for (const e of alcohols) alcoholByDay.set(dateKey(e.date), (alcoholByDay.get(dateKey(e.date)) ?? 0) + e.units)

    const bowelByDay = new Map<string, number>()
    for (const e of bowels) bowelByDay.set(dateKey(e.date), (bowelByDay.get(dateKey(e.date)) ?? 0) + 1)

    const weightByDay = new Map<string, number>()
    for (const e of weightData) {
      if (e.goal?.category === "bodyweight") {
        weightByDay.set(dateKey(e.date), e.value)
      }
    }

    const daily = dayKeys.map((k) => {
      const paces = runPaceByDay.get(k)
      const bestPace = paces && paces.length > 0 ? Math.min(...paces) : null
      const base = new Date(k + "T12:00:00")
      const k1 = format(addDays(base, 1), "yyyy-MM-dd")
      const k2 = format(addDays(base, 2), "yyyy-MM-dd")
      /** Next bodyweight after this day: prefer day +1, else day +2 (for lagged correlation). */
      const weightForward = weightByDay.get(k1) ?? weightByDay.get(k2) ?? null
      return {
        date: k,
        label: format(base, "d"),
        calories: calByDay.get(k) ?? 0,
        steps: stepsByDay.get(k) ?? 0,
        runMiles: Math.round((runDistByDay.get(k) ?? 0) * 100) / 100,
        pace: bestPace ? Math.round(bestPace * 100) / 100 : null,
        workouts: workoutsByDay.get(k) ?? 0,
        sleepHrs: sleepByDay.get(k) ? Math.round(sleepByDay.get(k)! * 10) / 10 : null,
        alcohol: alcoholByDay.get(k) ?? 0,
        bowel: bowelByDay.get(k) ?? 0,
        weight: weightByDay.get(k) ?? null,
        weightForward,
      }
    })

    function avg(arr: number[]): number | null {
      if (arr.length === 0) return null
      return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
    }
    function total(arr: number[]): number {
      return arr.reduce((a, b) => a + b, 0)
    }

    const calVals = daily.map((d) => d.calories).filter((v) => v > 0)
    const stepVals = daily.map((d) => d.steps).filter((v) => v > 0)
    const runVals = daily.map((d) => d.runMiles).filter((v) => v > 0)
    const paceVals = daily.map((d) => d.pace).filter((v): v is number => v != null)
    const workoutVals = daily.map((d) => d.workouts).filter((v) => v > 0)
    const sleepVals = daily.map((d) => d.sleepHrs).filter((v): v is number => v != null)
    const alcoholVals = daily.map((d) => d.alcohol).filter((v) => v > 0)
    const bowelVals = daily.map((d) => d.bowel).filter((v) => v > 0)
    const weightVals = daily.map((d) => d.weight).filter((v): v is number => v != null)

    const summary = {
      calories: { avg: avg(calVals), total: total(calVals), daysLogged: calVals.length },
      steps: { avg: avg(stepVals), total: total(stepVals), daysLogged: stepVals.length },
      running: {
        totalMiles: Math.round(total(runVals) * 10) / 10,
        runs: runVals.length,
        avgPace: avg(paceVals),
        bestPace: paceVals.length > 0 ? Math.round(Math.min(...paceVals) * 100) / 100 : null,
      },
      workouts: { total: total(workoutVals), daysActive: workoutVals.length },
      sleep: { avg: avg(sleepVals), daysLogged: sleepVals.length },
      alcohol: { avg: avg(alcoholVals), total: Math.round(total(alcoholVals) * 10) / 10, daysLogged: alcoholVals.length },
      bowel: { avg: avg(bowelVals), total: total(bowelVals), daysLogged: bowelVals.length },
      weight: {
        start: weightVals.length > 0 ? weightVals[0] : null,
        end: weightVals.length > 0 ? weightVals[weightVals.length - 1] : null,
        change: weightVals.length >= 2 ? Math.round((weightVals[weightVals.length - 1] - weightVals[0]) * 10) / 10 : null,
        daysLogged: weightVals.length,
      },
    }

    return NextResponse.json({
      month: format(start, "yyyy-MM"),
      monthLabel: format(start, "MMMM yyyy"),
      daysInMonth: dayKeys.length,
      daily,
      summary,
    })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to fetch monthly stats" }, { status: 500 })
  }
}
