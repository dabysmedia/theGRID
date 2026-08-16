export type ScrubPoint = {
  t: number
  v: number
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

export function ratioToTime(start: number, end: number, ratio: number): number {
  const span = end - start
  if (!Number.isFinite(span) || span <= 0) return start
  return start + clamp01(ratio) * span
}

/** Linear interpolation along a time-sorted series. */
export function interpolateSeries(
  points: ScrubPoint[],
  t: number,
): { t: number; v: number; leftIndex: number } | null {
  if (points.length === 0) return null
  if (t <= points[0]!.t) return { t: points[0]!.t, v: points[0]!.v, leftIndex: 0 }
  const last = points[points.length - 1]!
  if (t >= last.t) return { t: last.t, v: last.v, leftIndex: points.length - 1 }

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
  return {
    t,
    v: left.v + (right.v - left.v) * mix,
    leftIndex: lo,
  }
}

/**
 * Interpolate a calendar-aligned series that may have gaps.
 * `index` is a fractional position in `values` (0 … length-1).
 */
export function interpolateSparseByIndex(
  values: Array<number | null>,
  index: number,
): number | null {
  if (values.length === 0 || !Number.isFinite(index)) return null
  const clamped = Math.max(0, Math.min(values.length - 1, index))
  const leftHit = values[Math.floor(clamped)]
  if (Number.isInteger(clamped) && leftHit != null && Number.isFinite(leftHit)) {
    return leftHit
  }

  let left = Math.floor(clamped)
  while (left >= 0 && (values[left] == null || !Number.isFinite(values[left]))) left -= 1
  let right = Math.ceil(clamped)
  while (right < values.length && (values[right] == null || !Number.isFinite(values[right]))) {
    right += 1
  }
  if (left < 0 && right >= values.length) return null
  if (left < 0) return values[right] ?? null
  if (right >= values.length) return values[left] ?? null
  if (right === left) return values[left] ?? null
  const leftVal = values[left]!
  const rightVal = values[right]!
  const mix = (clamped - left) / (right - left)
  return leftVal + (rightVal - leftVal) * mix
}

export function hourlyValueRanges(
  points: ScrubPoint[],
): Array<{ start: number; end: number; min: number; max: number; avg: number }> {
  const buckets = new Map<number, number[]>()
  for (const point of points) {
    const local = new Date(point.t)
    local.setMinutes(0, 0, 0)
    const key = local.getTime()
    const bucket = buckets.get(key)
    if (bucket) bucket.push(point.v)
    else buckets.set(key, [point.v])
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, values]) => ({
      start,
      end: start + 60 * 60 * 1000,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    }))
}
