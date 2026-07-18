import "server-only"

import { prisma } from "@/lib/prisma"
import {
  parseYyyyMmDdToStoredDate,
  utcCalendarDayKeyFromIso,
  utcCalendarDayRangeInclusive,
  utcRangeWhereForCalendarDay,
} from "@/lib/dateStorage"
import { formatDate } from "@/lib/utils"
import { isVacationBlockingCalendarDay } from "@/lib/vacation-mode"
import { GOOGLE_HEALTH_SOURCE } from "@/lib/google-health/config"
import {
  addDaysYmd,
  fetchDailyHeartRateVariability,
  fetchDailyHeartRateZones,
  fetchDailyRestingHeartRate,
  fetchDailyWeight,
  fetchHeartRateDailyRollup,
  fetchHeartRateSamplesBucketed,
  fetchHourlySteps,
  fetchSleepSessions,
  fetchTimeInHeartRateZoneDailyRollup,
  type DailyStepsRollup,
  type HeartRateZoneMinutes,
  type HeartRateZoneThreshold,
} from "@/lib/google-health/client"
import {
  DEFAULT_STEPS_TIMEZONE,
  bucketStepsByStepsDay,
  getStepsDayRange,
  hourlyStepsForStepsDay,
  resolveStepsTimezone,
  stepsDayKey,
} from "@/lib/steps-day"
import { deriveSleepScore, computeSleepEfficiency } from "@/lib/sleep-score"
import { optionalNonNegativeInt } from "@/lib/google-health/normalize"
import { subDays } from "date-fns"

const GRAMS_PER_LB = 453.59237
/** How many trailing days get ~5-minute heart-rate sample buckets synced (keeps row counts sane). */
const HR_SAMPLE_SYNC_DAYS = 2

export type SyncMetrics = {
  steps?: boolean
  sleep?: boolean
  weight?: boolean
  vitals?: boolean
}

export type SyncResult = {
  stepsUpserted: number
  sleepUpserted: number
  weightUpserted: number
  weightSkippedVacation: number
  vitalsUpserted: number
  rangeStart: string
  rangeEnd: string
  warnings: string[]
}

export type SyncAllResult = {
  users: number
  ok: number
  failed: number
  results: Array<{ userId: string; ok: boolean; error?: string; sync?: SyncResult }>
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

async function fetchStepsForStepsDays(
  userId: string,
  startStepsKey: string,
  endStepsKey: string,
  timeZone: string,
): Promise<{
  daily: DailyStepsRollup[]
  hourlyByDay: Map<string, number[]>
}> {
  const { start } = getStepsDayRange(startStepsKey, timeZone)
  const { end } = getStepsDayRange(endStepsKey, timeZone)
  const hourly = await fetchHourlySteps(userId, start.toISOString(), end.toISOString())
  const bucketed = bucketStepsByStepsDay(
    hourly.map((h) => ({
      startTime: new Date(h.startTime),
      count: h.count,
    })),
    timeZone,
  )
  const out: DailyStepsRollup[] = []
  const hourlyByDay = new Map<string, number[]>()
  for (const [date, count] of bucketed) {
    if (date < startStepsKey || date > endStepsKey) continue
    if (count > 0) {
      out.push({ date, count: Math.round(count) })
      hourlyByDay.set(date, hourlyStepsForStepsDay(hourly, date, timeZone))
    }
  }
  return { daily: out, hourlyByDay }
}

export async function syncGoogleHealthForUser(
  userId: string,
  opts?: { days?: number; metrics?: SyncMetrics },
): Promise<SyncResult> {
  const days = Math.min(Math.max(opts?.days ?? 30, 1), 90)
  const metrics: Required<SyncMetrics> = {
    steps: opts?.metrics?.steps ?? true,
    sleep: opts?.metrics?.sleep ?? true,
    weight: opts?.metrics?.weight ?? true,
    vitals: opts?.metrics?.vitals ?? true,
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { vacationResumeDate: true, timeZone: true },
  })
  const stepsTz = resolveStepsTimezone(user?.timeZone ?? DEFAULT_STEPS_TIMEZONE)
  const endStepsKey = stepsDayKey(new Date(), stepsTz)
  const startStepsKey = addDaysYmd(endStepsKey, -(days - 1))
  const endYmd = formatDate(new Date())
  const startYmd = formatDate(subDays(new Date(), days - 1))
  const endExclusive = addDaysYmd(endYmd, 1)
  const hrSampleEndKey = endStepsKey
  const hrSampleStartKey = addDaysYmd(endStepsKey, -(HR_SAMPLE_SYNC_DAYS - 1))

  const fetchWarnings: string[] = []
  let fetchAttempts = 0
  let fetchSuccesses = 0

  async function safeFetch<T>(
    label: string,
    enabled: boolean,
    load: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    if (!enabled) return fallback
    fetchAttempts++
    try {
      const value = await load()
      fetchSuccesses++
      return value
    } catch (error) {
      const message = error instanceof Error ? error.message : "request failed"
      fetchWarnings.push(`${label}: ${message}`)
      return fallback
    }
  }

  const [steps, sleep, weights, restingHr, hrv, hrZoneThresholds, hrRollup, timeInZone] =
    await Promise.all([
      safeFetch(
        "Steps",
        metrics.steps,
        () => fetchStepsForStepsDays(userId, startStepsKey, endStepsKey, stepsTz),
        {
          daily: [] as DailyStepsRollup[],
          hourlyByDay: new Map<string, number[]>(),
        },
      ),
      safeFetch("Sleep", metrics.sleep, () => fetchSleepSessions(userId, startYmd), []),
      safeFetch(
        "Weight",
        metrics.weight,
        () => fetchDailyWeight(userId, startYmd, endExclusive),
        [],
      ),
      safeFetch(
        "Resting heart rate",
        metrics.vitals,
        () => fetchDailyRestingHeartRate(userId, startYmd, endExclusive),
        [],
      ),
      safeFetch(
        "HRV",
        metrics.vitals,
        () => fetchDailyHeartRateVariability(userId, startYmd, endExclusive),
        [],
      ),
      safeFetch(
        "Heart-rate zones",
        metrics.vitals,
        () => fetchDailyHeartRateZones(userId, startYmd, endExclusive),
        [],
      ),
      safeFetch(
        "Heart-rate rollup",
        metrics.vitals,
        () => fetchHeartRateDailyRollup(userId, startYmd, endExclusive),
        [],
      ),
      safeFetch(
        "Time in heart-rate zones",
        metrics.vitals,
        () => fetchTimeInHeartRateZoneDailyRollup(userId, startYmd, endExclusive),
        [],
      ),
    ])

  if (fetchAttempts > 0 && fetchSuccesses === 0) {
    throw new Error(`Google Health sync failed: ${fetchWarnings.join(" | ")}`)
  }

  const hrSampleDays: Array<{ ymd: string; samples: Array<{ time: string; bpm: number }> }> = []
  if (metrics.vitals) {
    let cursor = hrSampleStartKey
    while (cursor <= hrSampleEndKey) {
      try {
        const samples = await fetchHeartRateSamplesBucketed(userId, cursor, 5, stepsTz)
        if (samples.length > 0) hrSampleDays.push({ ymd: cursor, samples })
      } catch {
        // Some accounts/devices don't have intraday HR — skip that day rather than fail the sync.
      }
      cursor = addDaysYmd(cursor, 1)
    }
  }

  let stepsUpserted = 0
  const syncedStepsKeys = new Set<string>()
  for (const row of steps.daily) {
    syncedStepsKeys.add(row.date)
    const externalId = `${GOOGLE_HEALTH_SOURCE}:steps:${row.date}`
    const date = parseYyyyMmDdToStoredDate(row.date)
    const existing = await prisma.stepEntry.findFirst({
      where: { userId, externalId },
    })
    if (existing) {
      await prisma.stepEntry.update({
        where: { id: existing.id },
        data: {
          count: row.count,
          date,
          source: GOOGLE_HEALTH_SOURCE,
          hourlyJson: JSON.stringify(steps.hourlyByDay.get(row.date) ?? []),
        },
      })
    } else {
      // Replace prior google-health step row for the same steps-day if externalId missing (legacy)
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
          data: {
            count: row.count,
            externalId,
            date,
            hourlyJson: JSON.stringify(steps.hourlyByDay.get(row.date) ?? []),
          },
        })
      } else {
        await prisma.stepEntry.create({
          data: {
            userId,
            date,
            count: row.count,
            source: GOOGLE_HEALTH_SOURCE,
            externalId,
            hourlyJson: JSON.stringify(steps.hourlyByDay.get(row.date) ?? []),
          },
        })
      }
    }
    stepsUpserted++
  }

  // Drop stale google-health rows in the sync window (e.g. early-morning steps
  // that moved to the previous tracking day after 5am re-bucketing).
  if (metrics.steps) {
    const stepsRange = utcCalendarDayRangeInclusive(startStepsKey, endStepsKey)
    const existingGh = await prisma.stepEntry.findMany({
      where: { userId, source: GOOGLE_HEALTH_SOURCE, date: stepsRange },
      select: { id: true, date: true },
    })
    for (const row of existingGh) {
      const key = utcCalendarDayKeyFromIso(row.date)
      if (key && !syncedStepsKeys.has(key)) {
        await prisma.stepEntry.delete({ where: { id: row.id } })
      }
    }
  }

  let sleepUpserted = 0
  for (const session of sleep) {
    const externalId = `${GOOGLE_HEALTH_SOURCE}:sleep:${session.externalId}`
    const date = parseYyyyMmDdToStoredDate(session.dateYmd)
    const existing = await prisma.sleepEntry.findFirst({
      where: { userId, externalId },
    })

    const reportedMinutesInBed = optionalNonNegativeInt(session.minutesInSleepPeriod)
    const reportedMinutesAsleep = optionalNonNegativeInt(session.minutesAsleep)
    const minutesInBed =
      reportedMinutesInBed ??
      Math.round((session.wakeTime.getTime() - session.bedtime.getTime()) / 60000)
    const minutesAsleep =
      reportedMinutesAsleep ??
      (session.remMinutes ?? 0) + (session.lightMinutes ?? 0) + (session.deepMinutes ?? 0)
    const efficiency =
      minutesAsleep > 0 ? computeSleepEfficiency(minutesAsleep, minutesInBed) : null
    const score = deriveSleepScore({
      efficiency,
      remMinutes: session.remMinutes,
      lightMinutes: session.lightMinutes,
      deepMinutes: session.deepMinutes,
      awakeMinutes: session.awakeMinutes,
    })

    const data = {
      date,
      bedtime: session.bedtime,
      wakeTime: session.wakeTime,
      quality: score != null ? Math.max(1, Math.min(5, Math.round(score / 20))) : 3,
      score,
      remMinutes: session.remMinutes ?? null,
      lightMinutes: session.lightMinutes ?? null,
      deepMinutes: session.deepMinutes ?? null,
      awakeMinutes: session.awakeMinutes ?? null,
      minutesAsleep: reportedMinutesAsleep ?? null,
      minutesInSleepPeriod: reportedMinutesInBed ?? null,
      minutesToFallAsleep: optionalNonNegativeInt(session.minutesToFallAsleep) ?? null,
      minutesAfterWakeUp: optionalNonNegativeInt(session.minutesAfterWakeUp) ?? null,
      restlessMinutes: optionalNonNegativeInt(session.restlessMinutes) ?? null,
      interruptionCount: optionalNonNegativeInt(session.interruptionCount) ?? null,
      efficiency,
      stagesJson: JSON.stringify(session.stages ?? []),
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

  let vitalsUpserted = 0
  if (metrics.vitals) {
    const byDate = new Map<
      string,
      {
        restingHeartRate?: number
        hrvMs?: number
        hrAvg?: number
        hrMin?: number
        hrMax?: number
        zones?: HeartRateZoneMinutes[]
        thresholds?: HeartRateZoneThreshold[]
      }
    >()
    const ensure = (date: string) => {
      let row = byDate.get(date)
      if (!row) {
        row = {}
        byDate.set(date, row)
      }
      return row
    }
    for (const r of restingHr) ensure(r.date).restingHeartRate = r.bpm
    for (const r of hrv) ensure(r.date).hrvMs = r.ms
    for (const r of hrZoneThresholds) ensure(r.date).thresholds = r.thresholds
    for (const r of hrRollup) {
      const row = ensure(r.date)
      row.hrAvg = r.avgBpm ?? undefined
      row.hrMin = r.minBpm ?? undefined
      row.hrMax = r.maxBpm ?? undefined
    }
    for (const r of timeInZone) ensure(r.date).zones = r.zones

    for (const [dateYmd, row] of byDate) {
      const hasAnyData =
        row.restingHeartRate != null ||
        row.hrvMs != null ||
        row.hrAvg != null ||
        (row.zones && row.zones.length > 0) ||
        (row.thresholds && row.thresholds.length > 0)
      if (!hasAnyData) continue

      const externalId = `${GOOGLE_HEALTH_SOURCE}:vitals:${dateYmd}`
      const date = parseYyyyMmDdToStoredDate(dateYmd)
      const data = {
        date,
        restingHeartRate: row.restingHeartRate ?? null,
        hrvMs: row.hrvMs ?? null,
        hrAvg: row.hrAvg ?? null,
        hrMin: row.hrMin ?? null,
        hrMax: row.hrMax ?? null,
        zonesJson: JSON.stringify(row.zones ?? []),
        thresholdsJson: JSON.stringify(row.thresholds ?? []),
        source: GOOGLE_HEALTH_SOURCE,
        externalId,
      }
      const existing = await prisma.vitalDailyEntry.findFirst({ where: { userId, externalId } })
      if (existing) {
        await prisma.vitalDailyEntry.update({ where: { id: existing.id }, data })
      } else {
        await prisma.vitalDailyEntry.create({ data: { ...data, userId } })
      }
      vitalsUpserted++
    }

    for (const day of hrSampleDays) {
      const date = parseYyyyMmDdToStoredDate(day.ymd)
      for (const sample of day.samples) {
        const externalId = `${GOOGLE_HEALTH_SOURCE}:hr-sample:${sample.time}`
        const data = {
          date,
          time: new Date(sample.time),
          bpm: sample.bpm,
          source: GOOGLE_HEALTH_SOURCE,
          externalId,
        }
        const existing = await prisma.heartRateSample.findFirst({ where: { userId, externalId } })
        if (existing) {
          await prisma.heartRateSample.update({ where: { id: existing.id }, data })
        } else {
          await prisma.heartRateSample.create({ data: { ...data, userId } })
        }
      }
    }
  }

  await prisma.googleHealthConnection.update({
    where: { userId },
    data: {
      lastSyncAt: new Date(),
      lastSyncError: fetchWarnings.length > 0 ? fetchWarnings.join(" | ") : null,
    },
  })

  return {
    stepsUpserted,
    sleepUpserted,
    weightUpserted,
    weightSkippedVacation,
    vitalsUpserted,
    rangeStart: startStepsKey,
    rangeEnd: endStepsKey,
    warnings: fetchWarnings,
  }
}

/** Background sync for every connected account (used by cron). */
export async function syncGoogleHealthForAllUsers(opts?: {
  days?: number
  metrics?: SyncMetrics
}): Promise<SyncAllResult> {
  const connections = await prisma.googleHealthConnection.findMany({
    select: { userId: true },
  })
  const results: SyncAllResult["results"] = []
  let ok = 0
  let failed = 0

  for (const { userId } of connections) {
    try {
      const sync = await syncGoogleHealthForUser(userId, opts)
      results.push({ userId, ok: true, sync })
      ok++
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sync failed"
      await prisma.googleHealthConnection.update({
        where: { userId },
        data: { lastSyncError: message },
      })
      results.push({ userId, ok: false, error: message })
      failed++
    }
  }

  return { users: connections.length, ok, failed, results }
}
