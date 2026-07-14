/**
 * Hours between bedtime and wake time, matching overnight sleep when both
 * clock times are anchored on the same calendar day (wake earlier than bed).
 */
export function sleepDurationHours(
  bedtime: Date | string,
  wakeTime: Date | string
): number {
  const ms = sleepIntervalMs(bedtime, wakeTime)
  if (ms == null) return 0
  return Math.round((ms / 3600000) * 10) / 10
}

export type SleepTimingLike = {
  bedtime: Date | string
  wakeTime: Date | string
  minutesAsleep?: number | null
  minutesInSleepPeriod?: number | null
  remMinutes?: number | null
  lightMinutes?: number | null
  deepMinutes?: number | null
  awakeMinutes?: number | null
  minutesToFallAsleep?: number | null
  efficiency?: number | null
  score?: number | null
  stagesJson?: string | null
  source?: string | null
}

/** Wall-clock span in ms; adds 24h when wake is earlier than bed (same-day manual logs). */
export function sleepIntervalMs(
  bedtime: Date | string,
  wakeTime: Date | string,
): number | null {
  const b = new Date(bedtime)
  const w = new Date(wakeTime)
  if (Number.isNaN(b.getTime()) || Number.isNaN(w.getTime())) return null
  let ms = w.getTime() - b.getTime()
  if (ms < 0) ms += 24 * 3600000
  return ms
}

function parseStagesLength(stagesJson: string | null | undefined): number {
  if (!stagesJson) return 0
  try {
    const parsed = JSON.parse(stagesJson) as unknown
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

/** Metadata richness — stages and Google summary fields. Does not include duration. */
export function sleepEntryCompletenessScore(entry: SleepTimingLike): number {
  const stageMinutes =
    (entry.awakeMinutes ?? 0) +
    (entry.remMinutes ?? 0) +
    (entry.lightMinutes ?? 0) +
    (entry.deepMinutes ?? 0)
  return (
    (parseStagesLength(entry.stagesJson) > 0 ? 1000 : 0) +
    (stageMinutes > 0 ? 500 : 0) +
    (entry.minutesAsleep != null || entry.minutesToFallAsleep != null ? 300 : 0) +
    (entry.efficiency != null ? 100 : 0) +
    (entry.source === "google-health" ? 50 : 0)
  )
}

/**
 * Rank for picking the night's primary row. Duration dominates so a full Google
 * night (e.g. 3:10–11:03) beats a staged sub-session (7:02–11:07) that used to
 * win on completeness alone.
 */
export function sleepEntryPrimaryRank(entry: SleepTimingLike): number {
  return sleepDurationHours(entry.bedtime, entry.wakeTime) * 1000 + sleepEntryCompletenessScore(entry)
}

export function pickPrimarySleepEntry<T extends SleepTimingLike>(entries: T[]): T | null {
  if (!entries.length) return null
  return [...entries].sort((a, b) => sleepEntryPrimaryRank(b) - sleepEntryPrimaryRank(a))[0] ?? null
}

function intervalsOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start <= b.end && b.start <= a.end
}

/**
 * Total sleep hours for one wake-day.
 *
 * Google Health often returns overlapping datapoints for the same night (a full
 * session plus a staged subset). Averaging those under-reports (e.g. 7.9h + 4.1h
 * → 6.0h). We merge overlapping wall-clock intervals, then sum disjoint blocks
 * (night + nap).
 *
 * When the primary session reports `minutesAsleep`, prefer that over time-in-bed
 * for the merged night span — matching Google's "asleep" total.
 */
export function dailySleepDurationHours(entries: SleepTimingLike[]): number {
  if (!entries.length) return 0

  const intervals = entries
    .map((entry) => {
      const ms = sleepIntervalMs(entry.bedtime, entry.wakeTime)
      if (ms == null || ms <= 0) return null
      const start = new Date(entry.bedtime).getTime()
      return { start, end: start + ms, entry }
    })
    .filter((row): row is { start: number; end: number; entry: SleepTimingLike } => row != null)
    .sort((a, b) => a.start - b.start)

  if (!intervals.length) return 0

  type Cluster = {
    start: number
    end: number
    entries: SleepTimingLike[]
  }
  const clusters: Cluster[] = []
  for (const iv of intervals) {
    const last = clusters[clusters.length - 1]
    if (!last || iv.start > last.end) {
      clusters.push({ start: iv.start, end: iv.end, entries: [iv.entry] })
      continue
    }
    last.end = Math.max(last.end, iv.end)
    last.entries.push(iv.entry)
  }

  let totalHours = 0
  for (const cluster of clusters) {
    const wallHours = (cluster.end - cluster.start) / 3600000
    const primary = pickPrimarySleepEntry(cluster.entries)
    const asleepHours =
      primary?.minutesAsleep != null && primary.minutesAsleep > 0
        ? primary.minutesAsleep / 60
        : null
    // Prefer Google's minutesAsleep when it is within the merged wall span;
    // otherwise use the merged wall-clock length (covers partial/missing summaries).
    if (asleepHours != null && asleepHours <= wallHours + 0.05) {
      totalHours += asleepHours
    } else {
      totalHours += wallHours
    }
  }

  return Math.round(totalHours * 10) / 10
}

/** True when two sleep rows overlap in wall-clock time (including containment). */
export function sleepEntriesOverlap(a: SleepTimingLike, b: SleepTimingLike): boolean {
  const aMs = sleepIntervalMs(a.bedtime, a.wakeTime)
  const bMs = sleepIntervalMs(b.bedtime, b.wakeTime)
  if (aMs == null || bMs == null) return false
  const aStart = new Date(a.bedtime).getTime()
  const bStart = new Date(b.bedtime).getTime()
  return intervalsOverlap(
    { start: aStart, end: aStart + aMs },
    { start: bStart, end: bStart + bMs },
  )
}

/**
 * Primary night row for UI, with stage/summary fields filled from the richest
 * overlapping sibling when the longest session lacks them (common with Google).
 */
export function resolveSleepNightEntry<T extends SleepTimingLike>(entries: T[]): T | null {
  const primary = pickPrimarySleepEntry(entries)
  if (!primary) return null

  const overlapping = entries.filter(
    (entry) => entry === primary || sleepEntriesOverlap(entry, primary),
  )
  const donor = [...overlapping].sort(
    (a, b) => sleepEntryCompletenessScore(b) - sleepEntryCompletenessScore(a),
  )[0]
  if (!donor || donor === primary) return primary

  const primaryStages = parseStagesLength(primary.stagesJson)
  const donorStages = parseStagesLength(donor.stagesJson)
  const primaryStageMinutes =
    (primary.awakeMinutes ?? 0) +
    (primary.remMinutes ?? 0) +
    (primary.lightMinutes ?? 0) +
    (primary.deepMinutes ?? 0)
  const donorStageMinutes =
    (donor.awakeMinutes ?? 0) +
    (donor.remMinutes ?? 0) +
    (donor.lightMinutes ?? 0) +
    (donor.deepMinutes ?? 0)

  const useDonorStages = primaryStages === 0 && donorStages > 0
  const useDonorStageMinutes = primaryStageMinutes === 0 && donorStageMinutes > 0

  return {
    ...primary,
    stagesJson: useDonorStages ? donor.stagesJson : primary.stagesJson,
    remMinutes: useDonorStageMinutes ? donor.remMinutes : (primary.remMinutes ?? donor.remMinutes),
    lightMinutes: useDonorStageMinutes
      ? donor.lightMinutes
      : (primary.lightMinutes ?? donor.lightMinutes),
    deepMinutes: useDonorStageMinutes ? donor.deepMinutes : (primary.deepMinutes ?? donor.deepMinutes),
    awakeMinutes: useDonorStageMinutes
      ? donor.awakeMinutes
      : (primary.awakeMinutes ?? donor.awakeMinutes),
    minutesAsleep: primary.minutesAsleep ?? donor.minutesAsleep,
    minutesInSleepPeriod: primary.minutesInSleepPeriod ?? donor.minutesInSleepPeriod,
    minutesToFallAsleep: primary.minutesToFallAsleep ?? donor.minutesToFallAsleep,
    efficiency: primary.efficiency ?? donor.efficiency,
    score: primary.score ?? donor.score,
  }
}
