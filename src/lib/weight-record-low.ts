import "server-only"

import { prisma } from "@/lib/prisma"
import { utcCalendarDayKeyFromIso } from "@/lib/dateStorage"
import {
  resolveRecordLow,
  shouldUpdateStoredRecordLow,
  type WeightLog,
  type WeightRecordLow,
} from "@/lib/weight-trend"

function toRecord(value: number | null | undefined, date: Date | null | undefined): WeightRecordLow | null {
  if (value == null || date == null || !Number.isFinite(value)) return null
  const key = utcCalendarDayKeyFromIso(date)
  if (!key) return null
  return { value, date: key }
}

/** Persist a new all-time low when this weigh-in undercuts the saved record. */
export async function considerBodyweightRecordLow(
  goalId: string,
  value: number,
  date: Date,
): Promise<void> {
  if (!Number.isFinite(value) || value <= 0) return
  const goal = await prisma.longGoal.findUnique({
    where: { id: goalId },
    select: { recordLow: true, recordLowDate: true },
  })
  if (!goal) return
  const stored = toRecord(goal.recordLow, goal.recordLowDate)
  const candidate: WeightLog = { date: utcCalendarDayKeyFromIso(date), value }
  if (!shouldUpdateStoredRecordLow(stored, candidate)) return
  await prisma.longGoal.update({
    where: { id: goalId },
    data: { recordLow: value, recordLowDate: date },
  })
}

/**
 * Return the independently stored low, backfilling from history once if unset.
 * Does not lower the saved record when later entries are higher or missing.
 */
export async function ensureBodyweightRecordLow(goalId: string): Promise<WeightRecordLow | null> {
  const goal = await prisma.longGoal.findUnique({
    where: { id: goalId },
    select: { recordLow: true, recordLowDate: true },
  })
  if (!goal) return null

  const stored = toRecord(goal.recordLow, goal.recordLowDate)
  if (stored) return stored

  const entries = await prisma.longGoalEntry.findMany({
    where: { goalId },
    select: { date: true, value: true },
    orderBy: { date: "asc" },
  })
  const logs: WeightLog[] = entries.map((entry) => ({
    date: utcCalendarDayKeyFromIso(entry.date),
    value: entry.value,
  }))
  const resolved = resolveRecordLow(logs, null)
  if (!resolved) return null

  const recordDate = entries.find(
    (entry) => utcCalendarDayKeyFromIso(entry.date) === resolved.date,
  )?.date
  if (recordDate) {
    await prisma.longGoal.update({
      where: { id: goalId },
      data: { recordLow: resolved.value, recordLowDate: recordDate },
    })
  }
  return resolved
}
