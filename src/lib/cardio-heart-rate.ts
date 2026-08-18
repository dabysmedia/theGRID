export const CARDIO_ZONE_FALLBACK_AGE = 27

export type CardioHeartRateZoneKey = "OUT_OF_RANGE" | "FAT_BURN" | "CARDIO" | "PEAK"

export type CardioHeartRateThreshold = {
  zone: CardioHeartRateZoneKey
  minBpm: number
  maxBpm: number
}

export type CardioHeartRateZoneInfo = {
  key: CardioHeartRateZoneKey
  label: string
  color: string
}

export const CARDIO_HEART_RATE_ZONE_STYLE: Record<
  CardioHeartRateZoneKey,
  { label: string; color: string }
> = {
  OUT_OF_RANGE: { label: "Zone 1", color: "#64748b" },
  FAT_BURN: { label: "Zone 2", color: "#84cc16" },
  CARDIO: { label: "Zone 3", color: "#f59e0b" },
  PEAK: { label: "Zone 4", color: "#f43f5e" },
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/

export function ageYearsFromBirthDate(
  birthDate: string | null | undefined,
  onDate: string,
): number | null {
  const birth = YMD.exec(birthDate?.trim() ?? "")
  const on = YMD.exec(onDate.trim())
  if (!birth || !on) return null
  const by = Number(birth[1])
  const bm = Number(birth[2])
  const bd = Number(birth[3])
  const oy = Number(on[1])
  const om = Number(on[2])
  const od = Number(on[3])
  let age = oy - by
  if (om < bm || (om === bm && od < bd)) age -= 1
  if (age < 10 || age > 90) return null
  return age
}

/** Classic Fox max-HR estimate: 220 − age. */
export function estimatedMaxHeartRate(ageYears: number): number {
  return Math.round(220 - ageYears)
}

export function resolveCardioAgeYears(
  birthDate: string | null | undefined,
  onDate: string,
  fallback = CARDIO_ZONE_FALLBACK_AGE,
): number {
  return ageYearsFromBirthDate(birthDate, onDate) ?? fallback
}

/**
 * Karvonen zones from age (max HR) and resting HR.
 * Weight is not part of the bpm cutoffs — it is returned for the chart caption.
 *
 *   Zone 1  < 60% HRR
 *   Zone 2  60–70%
 *   Zone 3  70–85%
 *   Zone 4  85%+
 */
export function profileCardioHeartRateZones(input: {
  ageYears?: number | null
  weightLb?: number | null
  restingHeartRate?: number | null
}): {
  ageYears: number
  weightLb: number | null
  restingHeartRate: number
  maxHr: number
  heartRateReserve: number
  thresholds: CardioHeartRateThreshold[]
  method: "karvonen"
} {
  const ageYears =
    input.ageYears != null && Number.isFinite(input.ageYears) && input.ageYears >= 10
      ? Math.round(input.ageYears)
      : CARDIO_ZONE_FALLBACK_AGE
  const rest =
    input.restingHeartRate != null && input.restingHeartRate > 30
      ? Math.round(input.restingHeartRate)
      : 60
  const maxHr = Math.max(rest + 40, estimatedMaxHeartRate(ageYears))
  const reserve = Math.max(40, maxHr - rest)
  const at = (fraction: number) => Math.round(rest + reserve * fraction)
  const fat = at(0.6)
  const cardio = at(0.7)
  const peak = at(0.85)
  const weightLb =
    input.weightLb != null && Number.isFinite(input.weightLb) && input.weightLb > 50
      ? Math.round(input.weightLb * 10) / 10
      : null

  return {
    ageYears,
    weightLb,
    restingHeartRate: rest,
    maxHr,
    heartRateReserve: reserve,
    method: "karvonen",
    thresholds: [
      { zone: "OUT_OF_RANGE", minBpm: 0, maxBpm: fat },
      { zone: "FAT_BURN", minBpm: fat, maxBpm: cardio },
      { zone: "CARDIO", minBpm: cardio, maxBpm: peak },
      { zone: "PEAK", minBpm: peak, maxBpm: Math.max(peak + 10, maxHr + 15) },
    ],
  }
}

export function cardioZoneStyle(zone: string): CardioHeartRateZoneInfo {
  const key = zone.toUpperCase().replace(/[^A-Z]/g, "_") as CardioHeartRateZoneKey
  const known = CARDIO_HEART_RATE_ZONE_STYLE[key]
  if (known) return { key, ...known }
  return { key: "OUT_OF_RANGE", ...CARDIO_HEART_RATE_ZONE_STYLE.OUT_OF_RANGE }
}

export function cardioZoneForBpm(
  bpm: number,
  thresholds: CardioHeartRateThreshold[],
): CardioHeartRateZoneInfo {
  const match = thresholds.find((band) => bpm >= band.minBpm && bpm < band.maxBpm)
  return cardioZoneStyle(match?.zone ?? (bpm >= (thresholds.at(-1)?.minBpm ?? 200) ? "PEAK" : "OUT_OF_RANGE"))
}

export function plottableCardioZoneBands(
  thresholds: CardioHeartRateThreshold[],
  yMin: number,
  yMax: number,
): Array<CardioHeartRateZoneInfo & { from: number; to: number }> {
  return thresholds
    .map((band) => {
      const from = Math.max(yMin, band.minBpm)
      const to = Math.min(yMax, band.maxBpm)
      return { ...cardioZoneStyle(band.zone), from, to }
    })
    .filter((band) => band.to > band.from)
}

export function cardioZoneLegend(
  thresholds: CardioHeartRateThreshold[],
): CardioHeartRateZoneInfo[] {
  const seen = new Set<string>()
  const legend: CardioHeartRateZoneInfo[] = []
  for (const band of thresholds) {
    const info = cardioZoneStyle(band.zone)
    if (seen.has(info.label)) continue
    seen.add(info.label)
    legend.push(info)
  }
  return legend
}

export type CardioHrSample = { time: string; bpm: number }

export function samplesInWindow(
  samples: CardioHrSample[],
  startIso: string,
  endIso: string,
): CardioHrSample[] {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return []
  return samples.filter((sample) => {
    const t = new Date(sample.time).getTime()
    return Number.isFinite(t) && t >= start && t < end
  })
}

export function pickPrimaryCardioSession<
  T extends { id: string; minutes: number; startTime: string; endTime: string },
>(sessions: T[], samples: CardioHrSample[]): T | null {
  if (sessions.length === 0) return null
  return [...sessions].sort((a, b) => {
    const aCount = samplesInWindow(samples, a.startTime, a.endTime).length
    const bCount = samplesInWindow(samples, b.startTime, b.endTime).length
    if (bCount !== aCount) return bCount - aCount
    if (b.minutes !== a.minutes) return b.minutes - a.minutes
    return new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  })[0] ?? null
}

export type CardioScrubPoint = { t: number; v: number }

export function interpolateCardioSeries(
  points: CardioScrubPoint[],
  t: number,
): { t: number; v: number } | null {
  if (points.length === 0) return null
  if (t <= points[0]!.t) return { t: points[0]!.t, v: points[0]!.v }
  const last = points[points.length - 1]!
  if (t >= last.t) return { t: last.t, v: last.v }

  let lo = 0
  let hi = points.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (points[mid]!.t <= t) lo = mid
    else hi = mid
  }
  const left = points[lo]!
  const right = points[hi]!
  const span = right.t - left.t
  const mix = span > 0 ? (t - left.t) / span : 0
  return { t, v: left.v + (right.v - left.v) * mix }
}

export function ratioToTime(start: number, end: number, ratio: number): number {
  const span = end - start
  if (!Number.isFinite(span) || span <= 0) return start
  const clamped = Math.max(0, Math.min(1, ratio))
  return start + clamped * span
}
