export type HeartRateZoneThreshold = {
  zone: string
  minBpm: number | null
  maxBpm: number | null
}

export type HeartRateZoneInfo = {
  key: string
  label: string
  color: string
}

export const HEART_RATE_ZONE_STYLE: Record<string, { label: string; color: string }> = {
  OUT_OF_RANGE: { label: "Rest / easy", color: "#64748b" },
  FAT_BURN: { label: "Fat burn", color: "#22c55e" },
  CARDIO: { label: "Cardio", color: "#f59e0b" },
  PEAK: { label: "Peak", color: "#ef4444" },
}

export function normalizeZoneKey(zone: string): string {
  return zone.toUpperCase().replace(/[^A-Z]/g, "_")
}

export function zoneStyle(zone: string): HeartRateZoneInfo {
  const key = normalizeZoneKey(zone)
  const known = HEART_RATE_ZONE_STYLE[key]
  if (known) return { key, ...known }
  return {
    key,
    label: zone
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase()),
    color: "#f43f5e",
  }
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
