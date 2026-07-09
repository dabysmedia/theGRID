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

export type SleepSession = {
  externalId: string
  bedtime: Date
  wakeTime: Date
  dateYmd: string
}

type SleepDataPoint = {
  name?: string
  sleep?: {
    interval?: {
      startTime?: string
      endTime?: string
      civilEndTime?: CivilDateTime
    }
  }
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
      out.push({
        externalId: dp.name,
        bedtime,
        wakeTime,
        dateYmd,
      })
    }
    pageToken = data.nextPageToken || undefined
  } while (pageToken)

  return out
}
