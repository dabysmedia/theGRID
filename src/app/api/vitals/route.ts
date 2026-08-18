import { NextRequest, NextResponse } from "next/server"
import { subDays } from "date-fns"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"
import { formatDate, parseLocalDate } from "@/lib/utils"
import {
  utcCalendarDayKeyFromIso,
  utcCalendarDayRangeInclusive,
  utcRangeWhereForCalendarDay,
} from "@/lib/dateStorage"
import { getStepsDayRange, resolveStepsTimezone } from "@/lib/steps-day"
import { resolveCardioAgeYears } from "@/lib/cardio-heart-rate"
import {
  minutesInZones,
  remapGoogleZoneMinutes,
  standardHeartRateThresholds,
} from "@/lib/heart-rate-zones"

type ZoneMinutes = { zone: string; minutes: number }

function parseZones(json: string): ZoneMinutes[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const dateParam = searchParams.get("date")
    const dateYmd =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : formatDate(new Date())
    const refDate = parseLocalDate(dateYmd)

    const trendStartYmd = formatDate(subDays(refDate, 13))
    const trendRange = utcCalendarDayRangeInclusive(trendStartYmd, dateYmd)

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timeZone: true, birthDate: true },
    })
    const stepsTz = resolveStepsTimezone(user?.timeZone)
    const hrRange = getStepsDayRange(dateYmd, stepsTz)

    const [today, trendEntries, samples, connection] = await Promise.all([
      prisma.vitalDailyEntry.findFirst({
        where: { userId, date: utcRangeWhereForCalendarDay(dateYmd) },
      }),
      prisma.vitalDailyEntry.findMany({
        where: { userId, date: trendRange },
        orderBy: { date: "asc" },
      }),
      // Prefer physical 5am→5am window so the chart matches steps tracking day,
      // even for samples still labeled with a legacy midnight calendar date.
      prisma.heartRateSample.findMany({
        where: {
          userId,
          time: { gte: hrRange.start, lt: hrRange.end },
        },
        orderBy: { time: "asc" },
      }),
      prisma.googleHealthConnection.findUnique({
        where: { userId },
        select: { lastSyncAt: true },
      }).catch(() => null),
    ])

    const trend: Array<{
      date: string
      restingHeartRate: number | null
      hrvMs: number | null
      hrAvg: number | null
      hrMin: number | null
      hrMax: number | null
    }> = []
    const byDay = new Map<string, (typeof trendEntries)[number]>()
    for (const e of trendEntries) byDay.set(utcCalendarDayKeyFromIso(e.date), e)
    for (let i = 0; i < 14; i++) {
      const dayKey = formatDate(subDays(refDate, 13 - i))
      const row = byDay.get(dayKey)
      trend.push({
        date: dayKey,
        restingHeartRate: row?.restingHeartRate ?? null,
        hrvMs: row?.hrvMs ?? null,
        hrAvg: row?.hrAvg ?? null,
        hrMin: row?.hrMin ?? null,
        hrMax: row?.hrMax ?? null,
      })
    }

    const ageYears = resolveCardioAgeYears(user?.birthDate, dateYmd)
    const thresholds = standardHeartRateThresholds({
      ageYears,
      restingHeartRate: today?.restingHeartRate ?? null,
    })
    const zonesFromSamples = minutesInZones(
      samples.map((sample) => ({ time: sample.time, bpm: sample.bpm })),
      thresholds,
    )
    const googleZones = today ? remapGoogleZoneMinutes(parseZones(today.zonesJson)) : []
    const zones = zonesFromSamples.length > 0 ? zonesFromSamples : googleZones

    const body = {
      date: dateYmd,
      restingHeartRate: today?.restingHeartRate ?? null,
      hrvMs: today?.hrvMs ?? null,
      hrAvg: today?.hrAvg ?? null,
      hrMin: today?.hrMin ?? null,
      hrMax: today?.hrMax ?? null,
      zones,
      thresholds,
      samples: samples.map((s) => ({ time: s.time.toISOString(), bpm: s.bpm })),
      trend14: trend,
      lastSyncAt: connection?.lastSyncAt ?? null,
      hasConnection: connection != null,
    }

    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store, must-revalidate" },
    })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: "Failed to fetch vitals" }, { status: 500 })
  }
}
