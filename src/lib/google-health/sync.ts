import "server-only"

import { prisma } from "@/lib/prisma"
import { parseYyyyMmDdToStoredDate, utcRangeWhereForCalendarDay } from "@/lib/dateStorage"
import { formatDate } from "@/lib/utils"
import { isVacationBlockingCalendarDay } from "@/lib/vacation-mode"
import { GOOGLE_HEALTH_SOURCE } from "@/lib/google-health/config"
import {
  addDaysYmd,
  fetchDailySteps,
  fetchDailyWeight,
  fetchSleepSessions,
} from "@/lib/google-health/client"
import { subDays } from "date-fns"

const GRAMS_PER_LB = 453.59237

export type SyncResult = {
  stepsUpserted: number
  sleepUpserted: number
  weightUpserted: number
  weightSkippedVacation: number
  rangeStart: string
  rangeEnd: string
}

async function getOrCreateBodyweightGoal(userId: string) {
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

function gramsToLbs(grams: number): number {
  return Math.round((grams / GRAMS_PER_LB) * 10) / 10
}

export async function syncGoogleHealthForUser(
  userId: string,
  opts?: { days?: number },
): Promise<SyncResult> {
  const days = Math.min(Math.max(opts?.days ?? 30, 1), 90)
  const endYmd = formatDate(new Date())
  const startYmd = formatDate(subDays(new Date(), days - 1))
  const endExclusive = addDaysYmd(endYmd, 1)

  const [steps, sleep, weights] = await Promise.all([
    fetchDailySteps(userId, startYmd, endExclusive),
    fetchSleepSessions(userId, startYmd),
    fetchDailyWeight(userId, startYmd, endExclusive),
  ])

  let stepsUpserted = 0
  for (const row of steps) {
    const externalId = `${GOOGLE_HEALTH_SOURCE}:steps:${row.date}`
    const date = parseYyyyMmDdToStoredDate(row.date)
    const existing = await prisma.stepEntry.findFirst({
      where: { userId, externalId },
    })
    if (existing) {
      await prisma.stepEntry.update({
        where: { id: existing.id },
        data: { count: row.count, date, source: GOOGLE_HEALTH_SOURCE },
      })
    } else {
      // Replace prior google-health step row for the same calendar day if externalId missing (legacy)
      const dayRange = utcRangeWhereForCalendarDay(row.date)
      const sameDay = await prisma.stepEntry.findFirst({
        where: {
          userId,
          source: GOOGLE_HEALTH_SOURCE,
          date: dayRange,
        },
      })
      if (sameDay) {
        await prisma.stepEntry.update({
          where: { id: sameDay.id },
          data: { count: row.count, externalId, date },
        })
      } else {
        await prisma.stepEntry.create({
          data: {
            userId,
            date,
            count: row.count,
            source: GOOGLE_HEALTH_SOURCE,
            externalId,
          },
        })
      }
    }
    stepsUpserted++
  }

  let sleepUpserted = 0
  for (const session of sleep) {
    const externalId = `${GOOGLE_HEALTH_SOURCE}:sleep:${session.externalId}`
    const date = parseYyyyMmDdToStoredDate(session.dateYmd)
    const existing = await prisma.sleepEntry.findFirst({
      where: { userId, externalId },
    })
    const data = {
      date,
      bedtime: session.bedtime,
      wakeTime: session.wakeTime,
      quality: 3,
      notes: "Synced from Google Health / Fitbit",
      source: GOOGLE_HEALTH_SOURCE,
      externalId,
    }
    if (existing) {
      await prisma.sleepEntry.update({ where: { id: existing.id }, data })
    } else {
      await prisma.sleepEntry.create({ data: { ...data, userId } })
    }
    sleepUpserted++
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { vacationResumeDate: true },
  })
  const goal = await getOrCreateBodyweightGoal(userId)
  let weightUpserted = 0
  let weightSkippedVacation = 0

  for (const row of weights) {
    if (isVacationBlockingCalendarDay(user?.vacationResumeDate ?? null, row.date)) {
      weightSkippedVacation++
      continue
    }
    const externalId = `${GOOGLE_HEALTH_SOURCE}:weight:${row.date}`
    const date = parseYyyyMmDdToStoredDate(row.date)
    const value = gramsToLbs(row.weightGrams)
    const existingByExt = await prisma.longGoalEntry.findFirst({
      where: { goalId: goal.id, externalId },
    })
    if (existingByExt) {
      await prisma.longGoalEntry.update({
        where: { id: existingByExt.id },
        data: {
          value,
          date,
          notes: "Synced from Google Health / Fitbit",
          source: GOOGLE_HEALTH_SOURCE,
        },
      })
    } else {
      const existingDay = await prisma.longGoalEntry.findFirst({
        where: { goalId: goal.id, date },
      })
      if (existingDay) {
        await prisma.longGoalEntry.update({
          where: { id: existingDay.id },
          data: {
            value,
            notes: existingDay.notes ?? "Synced from Google Health / Fitbit",
            source: GOOGLE_HEALTH_SOURCE,
            externalId,
          },
        })
      } else {
        await prisma.longGoalEntry.create({
          data: {
            goalId: goal.id,
            date,
            value,
            notes: "Synced from Google Health / Fitbit",
            source: GOOGLE_HEALTH_SOURCE,
            externalId,
          },
        })
      }
    }
    weightUpserted++
  }

  await prisma.googleHealthConnection.update({
    where: { userId },
    data: {
      lastSyncAt: new Date(),
      lastSyncError: null,
    },
  })

  return {
    stepsUpserted,
    sleepUpserted,
    weightUpserted,
    weightSkippedVacation,
    rangeStart: startYmd,
    rangeEnd: endYmd,
  }
}
