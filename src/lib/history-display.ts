/**
 * Page "History" lists cap: oldest calendar days drop off the UI while rows
 * remain in app data for Stats and charts.
 */
export const HISTORY_UI_MAX_DAYS = 28

export type HistoryDayPartition<T> = {
  /** Groups whose date key matches today (active date), newest-first order preserved */
  todayGroups: T[]
  /** Other groups within the visible window (excludes today) */
  earlierGroups: T[]
  /** Distinct days older than the visible window (not rendered in History) */
  archivedDayCount: number
}

/** @param groupsSortedNewestFirst One group per calendar day, date keys descending (newest first). */
export function partitionHistoryDayGroups<T>(
  groupsSortedNewestFirst: readonly T[],
  getDateKey: (group: T) => string,
  todayKey: string,
  maxDays: number = HISTORY_UI_MAX_DAYS
): HistoryDayPartition<T> {
  const totalDays = groupsSortedNewestFirst.length
  const visible = groupsSortedNewestFirst.slice(0, Math.max(0, maxDays))
  const archivedDayCount = Math.max(0, totalDays - visible.length)
  const todayGroups = visible.filter((g) => getDateKey(g) === todayKey)
  const earlierGroups = visible.filter((g) => getDateKey(g) !== todayKey)
  return { todayGroups, earlierGroups, archivedDayCount }
}
