export type HeartRateSampleBucket = { time: string; bpm: number }

/** Maps Google heart-rate rollUp windows onto the 5-minute chart buckets we store. */
export function heartRateRollupPointsToBuckets(
  rows: Array<{ startTime?: string; avgBpm?: number | null }>,
): HeartRateSampleBucket[] {
  const out: HeartRateSampleBucket[] = []
  for (const row of rows) {
    if (!row.startTime) continue
    const bpm = Number(row.avgBpm)
    if (!Number.isFinite(bpm) || bpm <= 0) continue
    const ts = new Date(row.startTime)
    if (Number.isNaN(ts.getTime())) continue
    out.push({ time: ts.toISOString(), bpm: Math.round(bpm) })
  }
  out.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
  return out
}
