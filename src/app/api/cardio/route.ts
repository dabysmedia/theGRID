import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  parseYyyyMmDdToStoredDate,
  utcRangeWhereForCalendarDay,
} from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"
import { TRACKING_TARGET_DEFAULTS } from "@/lib/tracking-targets"
import { isCardioActivity } from "@/lib/cardio"
import {
  DEFAULT_STEPS_TIMEZONE,
  resolveStepsTimezone,
  stepsRefDayKey,
} from "@/lib/steps-day"

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_SESSION_MINUTES = 600

async function resolveCardioDayKey(userId: string, requestedDate: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timeZone: true },
  })
  const timeZone = resolveStepsTimezone(user?.timeZone ?? DEFAULT_STEPS_TIMEZONE)
  return stepsRefDayKey(requestedDate, new Date(), timeZone)
}

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const date = new URL(req.url).searchParams.get("date") ?? ""

    if (!DATE_PATTERN.test(date)) {
      return NextResponse.json({ error: "Valid date required" }, { status: 400 })
    }

    const dayKey = await resolveCardioDayKey(userId, date)

    const [sessions, cardioGoal] = await Promise.all([
      prisma.cardioEntry.findMany({
        where: { userId, date: utcRangeWhereForCalendarDay(dayKey) },
        orderBy: { startTime: "desc" },
        select: {
          id: true,
          activityType: true,
          displayName: true,
          minutes: true,
          calories: true,
          distanceMeters: true,
          avgHeartRate: true,
          startTime: true,
          source: true,
        },
      }),
      prisma.goal.findFirst({
        where: { userId, category: "cardio", goalType: "daily", active: true },
        orderBy: { createdAt: "desc" },
        select: { target: true },
      }),
    ])

    const totalMinutes =
      Math.round(sessions.reduce((sum, session) => sum + session.minutes, 0) * 10) / 10
    const goalMinutes =
      cardioGoal && Number.isFinite(cardioGoal.target) && cardioGoal.target > 0
        ? cardioGoal.target
        : TRACKING_TARGET_DEFAULTS.cardio

    return NextResponse.json({ sessions, totalMinutes, goalMinutes })
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed to fetch cardio" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const date = String(body.date ?? "")
    const minutes = Number(body.minutes)
    const activityType = String(body.activityType ?? "cardio")

    if (
      !DATE_PATTERN.test(date) ||
      !Number.isFinite(minutes) ||
      minutes <= 0 ||
      minutes > MAX_SESSION_MINUTES ||
      !isCardioActivity(activityType)
    ) {
      return NextResponse.json(
        {
          error: `Valid date, known cardio activity, and duration between 0 and ${MAX_SESSION_MINUTES} minutes required`,
        },
        { status: 400 },
      )
    }

    const dayKey = await resolveCardioDayKey(userId, date)
    const roundedMinutes = Math.round(minutes * 10) / 10
    // Manual logs have no real clock times — anchor the session to "now" so the
    // day list still orders sensibly against synced sessions.
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - roundedMinutes * 60_000)

    const session = await prisma.cardioEntry.create({
      data: {
        date: parseYyyyMmDdToStoredDate(dayKey),
        startTime,
        endTime,
        activityType,
        minutes: roundedMinutes,
        notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
        userId,
      },
      select: {
        id: true,
        activityType: true,
        displayName: true,
        minutes: true,
        calories: true,
        distanceMeters: true,
        avgHeartRate: true,
        startTime: true,
        source: true,
      },
    })

    return NextResponse.json(session, { status: 201 })
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed to log cardio" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const goalMinutes = Number(body.goalMinutes)

    if (!Number.isFinite(goalMinutes) || goalMinutes < 1 || goalMinutes > 600) {
      return NextResponse.json(
        { error: "Cardio goal must be between 1 and 600 minutes" },
        { status: 400 },
      )
    }

    const roundedGoal = Math.round(goalMinutes)
    const existing = await prisma.goal.findFirst({
      where: { userId, category: "cardio", goalType: "daily", active: true },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })

    if (existing) {
      await prisma.goal.update({
        where: { id: existing.id },
        data: { target: roundedGoal, unit: "min", direction: "up" },
      })
    } else {
      await prisma.goal.create({
        data: {
          category: "cardio",
          goalType: "daily",
          direction: "up",
          target: roundedGoal,
          unit: "min",
          userId,
        },
      })
    }

    return NextResponse.json({ goalMinutes: roundedGoal })
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed to update cardio goal" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const id = new URL(req.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    // Synced sessions are owned by Google Health — deleting one here just makes it
    // reappear on the next 15-minute pull, so refuse instead of pretending.
    const { count } = await prisma.cardioEntry.deleteMany({ where: { id, userId, source: null } })
    if (!count) {
      return NextResponse.json(
        { error: "Only manually logged sessions can be removed" },
        { status: 404 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Failed to delete cardio session" }, { status: 500 })
  }
}
