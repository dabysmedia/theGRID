export type HeartRateZoneThreshold = {
  zone: string
  minBpm: number | null
  maxBpm: number | null
}

export type HeartRateZoneInfo = {
  key: string
  label: string
  color: string
  number: number
}

export type HeartRateZoneMinutes = { zone: string; minutes: number }

export const DEFAULT_ZONE_AGE_YEARS = 27

/**
 * Standard 5-zone Karvonen (heart-rate reserve).
 *
 * Fitbit/Google still ship four marketing bands (light / fat-burn / cardio / peak).
 * Fat-burn is 40–59% HRR — easy, conversational work — which is Zone 1, not Zone 2.
 *
 *   Rest    < 40% HRR
 *   Zone 1  40–60%   recovery + easy (Fitbit moderate / fat burn)
 *   Zone 2  60–70%   aerobic endurance
 *   Zone 3  70–80%   tempo
 *   Zone 4  80–90%   threshold
 *   Zone 5  90%+     VO2 / peak
 */
const KARVONEN_FRACTIONS = [
  { zone: "REST", from: 0, to: 0.4, number: 0 },
  { zone: "ZONE_1", from: 0.4, to: 0.6, number: 1 },
  { zone: "ZONE_2", from: 0.6, to: 0.7, number: 2 },
  { zone: "ZONE_3", from: 0.7, to: 0.8, number: 3 },
  { zone: "ZONE_4", from: 0.8, to: 0.9, number: 4 },
  { zone: "ZONE_5", from: 0.9, to: 1.05, number: 5 },
] as const

const ZONE_BY_KEY: Record<string, { number: number; color: string; label?: string }> = {
  REST: { number: 0, color: "#64748b", label: "Rest" },
  BELOW: { number: 0, color: "#64748b", label: "Rest" },
  BELOW_ZONES: { number: 0, color: "#64748b", label: "Rest" },
  LIGHT: { number: 0, color: "#64748b", label: "Rest" },
  OUT_OF_RANGE: { number: 0, color: "#64748b", label: "Rest" },
  FAT_BURN: { number: 1, color: "#94a3b8" },
  MODERATE: { number: 1, color: "#94a3b8" },
  ZONE_1: { number: 1, color: "#94a3b8" },
  Z1: { number: 1, color: "#94a3b8" },
  ZONE_2: { number: 2, color: "#84cc16" },
  Z2: { number: 2, color: "#84cc16" },
  CARDIO: { number: 3, color: "#f59e0b" },
  VIGOROUS: { number: 3, color: "#f59e0b" },
  ZONE_3: { number: 3, color: "#f59e0b" },
  Z3: { number: 3, color: "#f59e0b" },
  ZONE_4: { number: 4, color: "#f97316" },
  Z4: { number: 4, color: "#f97316" },
  PEAK: { number: 5, color: "#f43f5e" },
  ZONE_5: { number: 5, color: "#f43f5e" },
  Z5: { number: 5, color: "#f43f5e" },
}

const GOOGLE_TO_STANDARD: Record<string, string> = {
  OUT_OF_RANGE: "REST",
  LIGHT: "REST",
  BELOW: "REST",
  BELOW_ZONES: "REST",
  FAT_BURN: "ZONE_1",
  MODERATE: "ZONE_1",
  CARDIO: "ZONE_3",
  VIGOROUS: "ZONE_3",
  PEAK: "ZONE_5",
}

/** Classic Fox max-HR estimate: 220 − age. */
export function estimatedMaxHeartRate(ageYears: number): number {
  return Math.round(220 - ageYears)
}

export function normalizeZoneKey(zone: string): string {
  return zone.toUpperCase().replace(/[^A-Z0-9]/g, "_")
}

export function zoneStyle(zone: string): HeartRateZoneInfo {
  const key = normalizeZoneKey(zone)
  const known = ZONE_BY_KEY[key]
  if (known) {
    const label = known.label ?? `Zone ${known.number}`
    return { key, label, color: known.color, number: known.number }
  }
  const numbered = key.match(/^Z(?:ONE)?_?([1-5])$/)
  if (numbered) {
    const number = Number(numbered[1])
    return {
      key,
      label: `Zone ${number}`,
      color: ZONE_BY_KEY[`Z${number}`]?.color ?? "#f43f5e",
      number,
    }
  }
  return { key, label: "Rest", color: "#64748b", number: 0 }
}

export function standardHeartRateThresholds(input: {
  restingHeartRate?: number | null
  ageYears?: number | null
  maxHr?: number | null
}): HeartRateZoneThreshold[] {
  const age =
    input.ageYears != null && Number.isFinite(input.ageYears) && input.ageYears >= 10
      ? Math.round(input.ageYears)
      : DEFAULT_ZONE_AGE_YEARS
  const rest =
    input.restingHeartRate != null && input.restingHeartRate > 30
      ? Math.round(input.restingHeartRate)
      : 60
  const maxHr =
    input.maxHr != null && Number.isFinite(input.maxHr) && input.maxHr > rest + 20
      ? Math.round(input.maxHr)
      : Math.max(rest + 40, estimatedMaxHeartRate(age))
  const reserve = Math.max(40, maxHr - rest)
  const at = (fraction: number) => Math.round(rest + reserve * fraction)
  return KARVONEN_FRACTIONS.map((band, index) => {
    const minBpm = index === 0 ? 0 : at(band.from)
    const maxBpm = index === KARVONEN_FRACTIONS.length - 1 ? Math.max(at(band.to), maxHr + 15) : at(band.to)
    return { zone: band.zone, minBpm, maxBpm }
  })
}

export function fallbackHeartRateThresholds(
  restingHeartRate?: number | null,
  ageYears?: number | null,
): HeartRateZoneThreshold[] {
  return standardHeartRateThresholds({ restingHeartRate, ageYears })
}

function inBand(bpm: number, minBpm: number | null, maxBpm: number | null): boolean {
  if (minBpm != null && bpm < minBpm) return false
  if (maxBpm != null && bpm >= maxBpm) return false
  return true
}

export function zoneForBpm(
  bpm: number,
  thresholds: HeartRateZoneThreshold[] | null | undefined,
  restingHeartRate?: number | null,
  ageYears?: number | null,
): HeartRateZoneInfo {
  const bands =
    thresholds && thresholds.length > 0
      ? thresholds
      : standardHeartRateThresholds({ restingHeartRate, ageYears })
  const match = bands.find((band) => inBand(bpm, band.minBpm, band.maxBpm))
  if (match) return zoneStyle(match.zone)
  const last = bands[bands.length - 1]
  if (last?.maxBpm != null && bpm >= last.maxBpm) return zoneStyle(last.zone)
  return zoneStyle("REST")
}

export function plottableZoneBands(
  thresholds: HeartRateZoneThreshold[] | null | undefined,
  restingHeartRate: number | null,
  yMin: number,
  yMax: number,
  ageYears?: number | null,
): Array<HeartRateZoneInfo & { from: number; to: number }> {
  const bands =
    thresholds && thresholds.length > 0
      ? thresholds
      : standardHeartRateThresholds({ restingHeartRate, ageYears })
  return bands
    .map((band) => {
      const from = Math.max(yMin, band.minBpm ?? yMin)
      const to = Math.min(yMax, band.maxBpm ?? yMax)
      return { ...zoneStyle(band.zone), from, to }
    })
    .filter((band) => band.to > band.from && band.number >= 1)
}

/** Training-zone legend (Zone 1–5). Rest is not a training zone. */
export function zoneLegend(
  thresholds: HeartRateZoneThreshold[] | null | undefined,
  restingHeartRate?: number | null,
  ageYears?: number | null,
): HeartRateZoneInfo[] {
  const bands =
    thresholds && thresholds.length > 0
      ? thresholds
      : standardHeartRateThresholds({ restingHeartRate, ageYears })
  const seen = new Set<number>()
  const legend: HeartRateZoneInfo[] = []
  for (const band of bands) {
    const info = zoneStyle(band.zone)
    if (info.number < 1 || seen.has(info.number)) continue
    seen.add(info.number)
    legend.push(info)
  }
  return legend
}

const DEFAULT_SAMPLE_MINUTES = 5
const MAX_SAMPLE_GAP_MINUTES = 12

/** Estimate minutes in each training zone from bpm samples (skips rest). */
export function minutesInZones(
  samples: Array<{ time: Date | string | number; bpm: number }>,
  thresholds: HeartRateZoneThreshold[],
): HeartRateZoneMinutes[] {
  const points = samples
    .map((sample) => ({
      t:
        sample.time instanceof Date
          ? sample.time.getTime()
          : typeof sample.time === "number"
            ? sample.time
            : new Date(sample.time).getTime(),
      bpm: sample.bpm,
    }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.bpm))
    .sort((a, b) => a.t - b.t)
  if (points.length === 0) return []

  const totals = new Map<string, number>()
  for (let i = 0; i < points.length; i++) {
    const next = points[i + 1]
    const gapMin = next ? (next.t - points[i]!.t) / 60_000 : DEFAULT_SAMPLE_MINUTES
    const minutes = Math.min(MAX_SAMPLE_GAP_MINUTES, Math.max(0, gapMin || DEFAULT_SAMPLE_MINUTES))
    const info = zoneForBpm(points[i]!.bpm, thresholds)
    if (info.number < 1) continue
    totals.set(info.key, (totals.get(info.key) ?? 0) + minutes)
  }

  return [...totals.entries()]
    .map(([zone, minutes]) => ({ zone, minutes: Math.round(minutes) }))
    .filter((row) => row.minutes > 0)
    .sort((a, b) => zoneStyle(a.zone).number - zoneStyle(b.zone).number)
}

/** Last-resort remap of Google/Fitbit rollup names when samples are missing. */
export function remapGoogleZoneMinutes(rows: HeartRateZoneMinutes[]): HeartRateZoneMinutes[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const key = GOOGLE_TO_STANDARD[normalizeZoneKey(row.zone)] ?? normalizeZoneKey(row.zone)
    const info = zoneStyle(key)
    if (info.number < 1 || !Number.isFinite(row.minutes) || row.minutes <= 0) continue
    totals.set(info.key, (totals.get(info.key) ?? 0) + row.minutes)
  }
  return [...totals.entries()]
    .map(([zone, minutes]) => ({ zone, minutes: Math.round(minutes) }))
    .sort((a, b) => zoneStyle(a.zone).number - zoneStyle(b.zone).number)
}
