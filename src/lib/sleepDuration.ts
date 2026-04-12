/**
 * Hours between bedtime and wake time, matching overnight sleep when both
 * clock times are anchored on the same calendar day (wake earlier than bed).
 */
export function sleepDurationHours(
  bedtime: Date | string,
  wakeTime: Date | string
): number {
  const b = new Date(bedtime)
  const w = new Date(wakeTime)
  let hours = (w.getTime() - b.getTime()) / 3600000
  if (hours < 0) hours += 24
  return Math.round(hours * 10) / 10
}
