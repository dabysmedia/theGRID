import "server-only"

import { GOOGLE_HEALTH_API } from "@/lib/google-health/config"
import { getValidAccessToken } from "@/lib/google-health/tokens"

type CivilDate = { year?: number; month?: number; day?: number }
type CivilTime = { hours?: number; minutes?: number; seconds?: number }
type CivilDateTime = { date?: CivilDate; time?: CivilTime }

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

export function civilDateToYmd(date?: CivilDate | null): string | null {
  if (!date?.year || !date?.month || !date?.day) return null
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`
}

function civilBody(ymd: string, endExclusive = false): CivilDateTime {
  const [y, m, d] = ymd.split("-").map(Number)
  return {
    date: { year: y, month: m, day: d },
    time: endExclusive ? undefined : { hours: 0, minutes: 0, seconds: 0 },
  }
}

async function healthFetch(
  userId: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const accessToken = await getValidAccessToken(userId)
  return fetch(`${GOOGLE_HEALTH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  })
}

export type DailyStepsRollup = { date: string; count: number }
export type HourlyStepsBucket = { startTime: string; endTime: string; count: number }
export type DailyWeightRollup = { date: string; weightGrams: number }

export async function fetchDailySteps(
  userId: string,
  startYmd: string,
  endExclusiveYmd: string,
): Promise<DailyStepsRollup[]> {
  const res = await healthFetch(userId, "/users/me/dataTypes/steps/dataPoints:dailyRollUp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      range: {
        start: civilBody(startYmd),
        end: civilBody(endExclusiveYmd),
      },
      windowSizeDays: 1,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    rollupDataPoints?: Array<{
      civilStartTime?: CivilDateTime
      steps?: { countSum?: string | number }
    }>
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(data.error?.message || `Steps rollup failed (${res.status})`)
  }

  const out: DailyStepsRollup[] = []
  for (const row of data.rollupDataPoints ?? []) {
    const date = civilDateToYmd(row.civilStartTime?.date)
    const count = Number(row.steps?.countSum ?? 0)
    if (date && Number.isFinite(count) && count > 0) {
      out.push({ date, count: Math.round(count) })
    }
  }
  return out
}

/**
 * Hourly step totals over a physical UTC range (for 5am→5am re-bucketing).
 * Google Health caps steps rollUp ranges at 90 days.
 */
export async function fetchHourlySteps(
  userId: string,
  startTimeIso: string,
  endTimeIso: string,
): Promise<HourlyStepsBucket[]> {
  const out: HourlyStepsBucket[] = []
  let pageToken: string | undefined

  do {
    const res = await healthFetch(userId, "/users/me/dataTypes/steps/dataPoints:rollUp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        range: { startTime: startTimeIso, endTime: endTimeIso },
        windowSize: "3600s",
        ...(pageToken ? { pageToken } : {}),
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      rollupDataPoints?: Array<{
        startTime?: string
        endTime?: string
        steps?: { countSum?: string | number }
      }>
      nextPageToken?: string
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new Error(data.error?.message || `Steps hourly rollup failed (${res.status})`)
    }
    for (const row of data.rollupDataPoints ?? []) {
      if (!row.startTime || !row.endTime) continue
      const count = Number(row.steps?.countSum ?? 0)
      if (!Number.isFinite(count) || count <= 0) continue
      out.push({
        startTime: row.startTime,
        endTime: row.endTime,
        count: Math.round(count),
      })
    }
    pageToken = data.nextPageToken || undefined
  } while (pageToken)

  return out
}

export async function fetchDailyWeight(
  userId: string,
  startYmd: string,
  endExclusiveYmd: string,
): Promise<DailyWeightRollup[]> {
  const res = await healthFetch(userId, "/users/me/dataTypes/weight/dataPoints:dailyRollUp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      range: {
        start: civilBody(startYmd),
        end: civilBody(endExclusiveYmd),
      },
      windowSizeDays: 1,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    rollupDataPoints?: Array<{
      civilStartTime?: CivilDateTime
      weight?: { weightGramsAvg?: number }
    }>
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(data.error?.message || `Weight rollup failed (${res.status})`)
  }

  const out: DailyWeightRollup[] = []
  for (const row of data.rollupDataPoints ?? []) {
    const date = civilDateToYmd(row.civilStartTime?.date)
    const grams = Number(row.weight?.weightGramsAvg ?? 0)
    if (date && Number.isFinite(grams) && grams > 0) {
      out.push({ date, weightGrams: grams })
    }
  }
  return out
}

export type SleepStageSegment = {
  type: string
  startTime: string
  endTime: string
}

export type SleepSession = {
  externalId: string
  bedtime: Date
  wakeTime: Date
  dateYmd: string
  minutesAsleep?: number
  minutesAwake?: number
  minutesInSleepPeriod?: number
  minutesToFallAsleep?: number
  minutesAfterWakeUp?: number
  restlessMinutes?: number
  interruptionCount?: number
  remMinutes?: number
  lightMinutes?: number
  deepMinutes?: number
  awakeMinutes?: number
  stages?: SleepStageSegment[]
}

type SleepStagesSummaryRow = { type?: string; count?: number; minutes?: number }

type SleepDataPoint = {
  name?: string
  sleep?: {
    interval?: {
      startTime?: string
      endTime?: string
      civilEndTime?: CivilDateTime
    }
    stages?: Array<{ type?: string; startTime?: string; endTime?: string }>
    summary?: {
      minutesInSleepPeriod?: number
      minutesAsleep?: number
      minutesAwake?: number
      minutesToFallAsleep?: number
      minutesAfterWakeUp?: number
      stagesSummary?: SleepStagesSummaryRow[]
    }
  }
}

function stageMinutes(rows: SleepStagesSummaryRow[] | undefined, type: string): number {
  if (!rows) return 0
  return rows
    .filter((r) => (r.type ?? "").toUpperCase() === type)
    .reduce((s, r) => s + Number(r.minutes ?? 0), 0)
}

function stageCount(rows: SleepStagesSummaryRow[] | undefined, type: string): number {
  if (!rows) return 0
  return rows
    .filter((row) => (row.type ?? "").toUpperCase() === type)
    .reduce((sum, row) => sum + Number(row.count ?? 0), 0)
}

export async function fetchSleepSessions(
  userId: string,
  startYmd: string,
): Promise<SleepSession[]> {
  const filter = `sleep.interval.civil_end_time >= "${startYmd}T00:00:00"`
  const out: SleepSession[] = []
  let pageToken: string | undefined

  do {
    const qs = new URLSearchParams({ filter, pageSize: "25" })
    if (pageToken) qs.set("pageToken", pageToken)
    const res = await healthFetch(
      userId,
      `/users/me/dataTypes/sleep/dataPoints?${qs.toString()}`,
    )
    const data = (await res.json().catch(() => ({}))) as {
      dataPoints?: SleepDataPoint[]
      nextPageToken?: string
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new Error(data.error?.message || `Sleep list failed (${res.status})`)
    }

    for (const dp of data.dataPoints ?? []) {
      const start = dp.sleep?.interval?.startTime
      const end = dp.sleep?.interval?.endTime
      if (!start || !end || !dp.name) continue
      const bedtime = new Date(start)
      const wakeTime = new Date(end)
      if (Number.isNaN(bedtime.getTime()) || Number.isNaN(wakeTime.getTime())) continue
      const dateYmd =
        civilDateToYmd(dp.sleep?.interval?.civilEndTime?.date) ||
        `${wakeTime.getUTCFullYear()}-${pad2(wakeTime.getUTCMonth() + 1)}-${pad2(wakeTime.getUTCDate())}`

      const stagesRaw = dp.sleep?.stages ?? []
      const stages: SleepStageSegment[] = stagesRaw
        .filter((s) => s.type && s.startTime && s.endTime)
        .map((s) => ({ type: s.type!, startTime: s.startTime!, endTime: s.endTime! }))

      const summary = dp.sleep?.summary
      const stagesSummary = summary?.stagesSummary
      out.push({
        externalId: dp.name,
        bedtime,
        wakeTime,
        dateYmd,
        minutesAsleep: summary?.minutesAsleep,
        minutesAwake: summary?.minutesAwake,
        minutesInSleepPeriod: summary?.minutesInSleepPeriod,
        minutesToFallAsleep: summary?.minutesToFallAsleep,
        minutesAfterWakeUp: summary?.minutesAfterWakeUp,
        restlessMinutes: stagesSummary ? stageMinutes(stagesSummary, "RESTLESS") : undefined,
        interruptionCount: stagesSummary ? stageCount(stagesSummary, "AWAKE") : undefined,
        remMinutes: stagesSummary ? stageMinutes(stagesSummary, "REM") : undefined,
        lightMinutes: stagesSummary ? stageMinutes(stagesSummary, "LIGHT") : undefined,
        deepMinutes: stagesSummary ? stageMinutes(stagesSummary, "DEEP") : undefined,
        awakeMinutes: stagesSummary ? stageMinutes(stagesSummary, "AWAKE") : undefined,
        stages: stages.length > 0 ? stages : undefined,
      })
    }
    pageToken = data.nextPageToken || undefined
  } while (pageToken)

  return out
}

/** Splits [startYmd, endExclusiveYmd) into chunks no longer than `maxDays` (Google Health caps some rollups at 14 days). */
function chunkDateRange(
  startYmd: string,
  endExclusiveYmd: string,
  maxDays: number,
): Array<{ start: string; endExclusive: string }> {
  const chunks: Array<{ start: string; endExclusive: string }> = []
  let cursor = startYmd
  while (cursor < endExclusiveYmd) {
    const chunkEnd = addDaysYmd(cursor, maxDays)
    const endExclusive = chunkEnd < endExclusiveYmd ? chunkEnd : endExclusiveYmd
    chunks.push({ start: cursor, endExclusive })
    cursor = endExclusive
  }
  return chunks
}

export type DailyRestingHeartRateRow = { date: string; bpm: number }
export type DailyHrvRow = { date: string; ms: number }
export type HeartRateZoneThreshold = { zone: string; minBpm: number | null; maxBpm: number | null }
export type DailyHeartRateZonesRow = { date: string; thresholds: HeartRateZoneThreshold[] }
export type HeartRateZoneMinutes = { zone: string; minutes: number }
export type HeartRateDailyRollup = {
  date: string
  avgBpm: number | null
  minBpm: number | null
  maxBpm: number | null
}
export type TimeInHeartRateZoneRollup = { date: string; zones: HeartRateZoneMinutes[] }
export type HeartRateSampleBucket = { time: string; bpm: number }

function firstNumber(...vals: Array<unknown>): number | null {
  for (const v of vals) {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

/** Daily kind (list-only) — resting HR summary per calendar day. */
export async function fetchDailyRestingHeartRate(
  userId: string,
  startYmd: string,
  endExclusiveYmd: string,
): Promise<DailyRestingHeartRateRow[]> {
  const filter = `daily_resting_heart_rate.date >= "${startYmd}" AND daily_resting_heart_rate.date < "${endExclusiveYmd}"`
  const out: DailyRestingHeartRateRow[] = []
  let pageToken: string | undefined
  do {
    const qs = new URLSearchParams({ filter, pageSize: "100" })
    if (pageToken) qs.set("pageToken", pageToken)
    const res = await healthFetch(
      userId,
      `/users/me/dataTypes/daily-resting-heart-rate/dataPoints?${qs.toString()}`,
    )
    const data = (await res.json().catch(() => ({}))) as {
      dataPoints?: Array<{
        dailyRestingHeartRate?: {
          date?: CivilDate
          beatsPerMinute?: number
          restingHeartRate?: { beatsPerMinute?: number }
        }
      }>
      nextPageToken?: string
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new Error(data.error?.message || `Resting HR list failed (${res.status})`)
    }
    for (const dp of data.dataPoints ?? []) {
      const row = dp.dailyRestingHeartRate
      const date = civilDateToYmd(row?.date)
      const bpm = firstNumber(row?.beatsPerMinute, row?.restingHeartRate?.beatsPerMinute)
      if (date && bpm != null && bpm > 0) out.push({ date, bpm: Math.round(bpm) })
    }
    pageToken = data.nextPageToken || undefined
  } while (pageToken)
  return out
}

/** Daily kind (list-only) — HRV summary per calendar day. */
export async function fetchDailyHeartRateVariability(
  userId: string,
  startYmd: string,
  endExclusiveYmd: string,
): Promise<DailyHrvRow[]> {
  const filter = `daily_heart_rate_variability.date >= "${startYmd}" AND daily_heart_rate_variability.date < "${endExclusiveYmd}"`
  const out: DailyHrvRow[] = []
  let pageToken: string | undefined
  do {
    const qs = new URLSearchParams({ filter, pageSize: "100" })
    if (pageToken) qs.set("pageToken", pageToken)
    const res = await healthFetch(
      userId,
      `/users/me/dataTypes/daily-heart-rate-variability/dataPoints?${qs.toString()}`,
    )
    const data = (await res.json().catch(() => ({}))) as {
      dataPoints?: Array<{
        dailyHeartRateVariability?: {
          date?: CivilDate
          averageHeartRateVariabilityMilliseconds?: number
          rmssdMilliseconds?: number
        }
      }>
      nextPageToken?: string
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new Error(data.error?.message || `HRV list failed (${res.status})`)
    }
    for (const dp of data.dataPoints ?? []) {
      const row = dp.dailyHeartRateVariability
      const date = civilDateToYmd(row?.date)
      const ms = firstNumber(
        row?.averageHeartRateVariabilityMilliseconds,
        row?.rmssdMilliseconds,
      )
      if (date && ms != null && ms > 0) out.push({ date, ms: Math.round(ms * 10) / 10 })
    }
    pageToken = data.nextPageToken || undefined
  } while (pageToken)
  return out
}

/** Daily kind (list-only) — per-user heart-rate zone bpm thresholds per calendar day. */
export async function fetchDailyHeartRateZones(
  userId: string,
  startYmd: string,
  endExclusiveYmd: string,
): Promise<DailyHeartRateZonesRow[]> {
  const filter = `daily_heart_rate_zones.date >= "${startYmd}" AND daily_heart_rate_zones.date < "${endExclusiveYmd}"`
  const out: DailyHeartRateZonesRow[] = []
  let pageToken: string | undefined
  do {
    const qs = new URLSearchParams({ filter, pageSize: "100" })
    if (pageToken) qs.set("pageToken", pageToken)
    const res = await healthFetch(
      userId,
      `/users/me/dataTypes/daily-heart-rate-zones/dataPoints?${qs.toString()}`,
    )
    const data = (await res.json().catch(() => ({}))) as {
      dataPoints?: Array<{
        dailyHeartRateZones?: {
          date?: CivilDate
          zones?: Array<{
            name?: string
            zoneName?: string
            minBpm?: number
            maxBpm?: number
            lowerBoundBpm?: number
            upperBoundBpm?: number
          }>
        }
      }>
      nextPageToken?: string
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new Error(data.error?.message || `Heart rate zones list failed (${res.status})`)
    }
    for (const dp of data.dataPoints ?? []) {
      const row = dp.dailyHeartRateZones
      const date = civilDateToYmd(row?.date)
      if (!date) continue
      const thresholds: HeartRateZoneThreshold[] = (row?.zones ?? []).map((z) => ({
        zone: z.name ?? z.zoneName ?? "ZONE",
        minBpm: firstNumber(z.minBpm, z.lowerBoundBpm),
        maxBpm: firstNumber(z.maxBpm, z.upperBoundBpm),
      }))
      if (thresholds.length > 0) out.push({ date, thresholds })
    }
    pageToken = data.nextPageToken || undefined
  } while (pageToken)
  return out
}

/** Sample kind, aggregated via dailyRollUp — all-day avg/min/max bpm. Google caps this range at 14 days. */
export async function fetchHeartRateDailyRollup(
  userId: string,
  startYmd: string,
  endExclusiveYmd: string,
): Promise<HeartRateDailyRollup[]> {
  const out: HeartRateDailyRollup[] = []
  for (const chunk of chunkDateRange(startYmd, endExclusiveYmd, 14)) {
    const res = await healthFetch(userId, "/users/me/dataTypes/heart-rate/dataPoints:dailyRollUp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        range: { start: civilBody(chunk.start), end: civilBody(chunk.endExclusive) },
        windowSizeDays: 1,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      rollupDataPoints?: Array<{
        civilStartTime?: CivilDateTime
        heartRate?: { beatsPerMinuteAvg?: number; beatsPerMinuteMin?: number; beatsPerMinuteMax?: number }
      }>
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new Error(data.error?.message || `Heart rate rollup failed (${res.status})`)
    }
    for (const row of data.rollupDataPoints ?? []) {
      const date = civilDateToYmd(row.civilStartTime?.date)
      if (!date) continue
      const hr = row.heartRate
      if (!hr) continue
      out.push({
        date,
        avgBpm: firstNumber(hr.beatsPerMinuteAvg),
        minBpm: firstNumber(hr.beatsPerMinuteMin),
        maxBpm: firstNumber(hr.beatsPerMinuteMax),
      })
    }
  }
  return out
}

/** Interval kind, aggregated via dailyRollUp — minutes spent in each heart-rate zone per day. */
export async function fetchTimeInHeartRateZoneDailyRollup(
  userId: string,
  startYmd: string,
  endExclusiveYmd: string,
): Promise<TimeInHeartRateZoneRollup[]> {
  const out: TimeInHeartRateZoneRollup[] = []
  for (const chunk of chunkDateRange(startYmd, endExclusiveYmd, 14)) {
    const res = await healthFetch(
      userId,
      "/users/me/dataTypes/time-in-heart-rate-zone/dataPoints:dailyRollUp",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          range: { start: civilBody(chunk.start), end: civilBody(chunk.endExclusive) },
          windowSizeDays: 1,
        }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      rollupDataPoints?: Array<{
        civilStartTime?: CivilDateTime
        timeInHeartRateZone?: {
          zoneDurations?: Array<{ zoneName?: string; name?: string; durationMinutes?: number; minutes?: number }>
        }
      }>
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new Error(data.error?.message || `Time in HR zone rollup failed (${res.status})`)
    }
    for (const row of data.rollupDataPoints ?? []) {
      const date = civilDateToYmd(row.civilStartTime?.date)
      if (!date) continue
      const durations = row.timeInHeartRateZone?.zoneDurations ?? []
      const zones: HeartRateZoneMinutes[] = durations
        .map((z) => ({
          zone: z.zoneName ?? z.name ?? "ZONE",
          minutes: Math.round(Number(z.durationMinutes ?? z.minutes ?? 0)),
        }))
        .filter((z) => z.minutes > 0)
      if (zones.length > 0) out.push({ date, zones })
    }
  }
  return out
}

/** Raw bpm samples for one calendar day, bucketed to `bucketMinutes` resolution (default ~5 min). */
export async function fetchHeartRateSamplesBucketed(
  userId: string,
  dayYmd: string,
  bucketMinutes = 5,
): Promise<HeartRateSampleBucket[]> {
  const startIso = `${dayYmd}T00:00:00Z`
  const endIso = `${addDaysYmd(dayYmd, 1)}T00:00:00Z`
  const filter = `heart_rate.sample_time.physical_time >= "${startIso}" AND heart_rate.sample_time.physical_time < "${endIso}"`
  const buckets = new Map<number, { sum: number; count: number }>()
  const bucketMs = bucketMinutes * 60_000
  let pageToken: string | undefined

  do {
    const qs = new URLSearchParams({ filter, pageSize: "10000" })
    if (pageToken) qs.set("pageToken", pageToken)
    const res = await healthFetch(userId, `/users/me/dataTypes/heart-rate/dataPoints?${qs.toString()}`)
    const data = (await res.json().catch(() => ({}))) as {
      dataPoints?: Array<{ heartRate?: { sampleTime?: { physicalTime?: string }; beatsPerMinute?: number } }>
      nextPageToken?: string
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new Error(data.error?.message || `Heart rate samples list failed (${res.status})`)
    }
    for (const dp of data.dataPoints ?? []) {
      const hr = dp.heartRate
      const t = hr?.sampleTime?.physicalTime
      const bpm = Number(hr?.beatsPerMinute)
      if (!t || !Number.isFinite(bpm) || bpm <= 0) continue
      const ts = new Date(t).getTime()
      if (Number.isNaN(ts)) continue
      const bucketStart = Math.floor(ts / bucketMs) * bucketMs
      const bucket = buckets.get(bucketStart) ?? { sum: 0, count: 0 }
      bucket.sum += bpm
      bucket.count += 1
      buckets.set(bucketStart, bucket)
    }
    pageToken = data.nextPageToken || undefined
  } while (pageToken)

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ms, { sum, count }]) => ({
      time: new Date(ms).toISOString(),
      bpm: Math.round(sum / count),
    }))
}
