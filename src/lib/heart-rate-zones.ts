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

const ZONE_BY_KEY: Record<string, { number: number; color: string }> = {
  OUT_OF_RANGE: { number: 1, color: "#64748b" },
  ZONE_1: { number: 1, color: "#64748b" },
  Z1: { number: 1, color: "#64748b" },
  FAT_BURN: { number: 2, color: "#84cc16" },
  ZONE_2: { number: 2, color: "#84cc16" },
  Z2: { number: 2, color: "#84cc16" },
  CARDIO: { number: 3, color: "#f59e0b" },
  ZONE_3: { number: 3, color: "#f59e0b" },
  Z3: { number: 3, color: "#f59e0b" },
  PEAK: { number: 4, color: "#f43f5e" },
  ZONE_4: { number: 4, color: "#f43f5e" },
  Z4: { number: 4, color: "#f43f5e" },
  ZONE_5: { number: 5, color: "#e11d48" },
  Z5: { number: 5, color: "#e11d48" },
}

export function normalizeZoneKey(zone: string): string {
  return zone.toUpperCase().replace(/[^A-Z0-9]/g, "_")
}

export function zoneStyle(zone: string): HeartRateZoneInfo {
  const key = normalizeZoneKey(zone)
  const known = ZONE_BY_KEY[key]
  if (known) {
    return { key, label: `Zone ${known.number}`, color: known.color, number: known.number }
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
  return { key, label: "Zone 1", color: "#64748b", number: 1 }
}

export function fallbackHeartRateThresholds(
  restingHeartRate?: number | null,
): HeartRateZoneThreshold[] {
  const rest = restingHeartRate != null && restingHeartRate > 30 ? restingHeartRate : 60
  const fat = Math.max(90, Math.round(rest + 25))
  const cardio = Math.max(fat + 20, 140)
  const peak = Math.max(cardio + 20, 170)
  return [
    { zone: "OUT_OF_RANGE", minBpm: 0, maxBpm: fat },
    { zone: "FAT_BURN", minBpm: fat, maxBpm: cardio },
    { zone: "CARDIO", minBpm: cardio, maxBpm: peak },
    { zone: "PEAK", minBpm: peak, maxBpm: 230 },
  ]
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
): HeartRateZoneInfo {
  const bands =
    thresholds && thresholds.length > 0 ? thresholds : fallbackHeartRateThresholds(restingHeartRate)
  const match = bands.find((band) => inBand(bpm, band.minBpm, band.maxBpm))
  return zoneStyle(match?.zone ?? "OUT_OF_RANGE")
}

export function plottableZoneBands(
  thresholds: HeartRateZoneThreshold[] | null | undefined,
  restingHeartRate: number | null,
  yMin: number,
  yMax: number,
): Array<HeartRateZoneInfo & { from: number; to: number }> {
  const bands =
    thresholds && thresholds.length > 0 ? thresholds : fallbackHeartRateThresholds(restingHeartRate)
  return bands
    .map((band) => {
      const from = Math.max(yMin, band.minBpm ?? yMin)
      const to = Math.min(yMax, band.maxBpm ?? yMax)
      return { ...zoneStyle(band.zone), from, to }
    })
    .filter((band) => band.to > band.from)
}
