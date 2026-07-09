import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns"

export const HUB_PREFS_CHANGED_EVENT = "grid:hub-prefs-changed"
/** Bottom nav Home → collapse hub expand back to the default overview. */
export const HUB_RESET_OVERVIEW_EVENT = "grid:hub-reset-overview"

const sleepWakeKey = (userId: string) => `theGRID_sleepWake_${userId}`
const peptideIntervalKey = (userId: string) => `theGRID_peptideIntervalDays_${userId}`

export const DEFAULT_DESIRED_WAKE_TIME = "06:30"
export const DEFAULT_INJECTION_INTERVAL_DAYS = 7

export function readDesiredWakeTime(userId: string | undefined): string {
  if (typeof window === "undefined" || !userId) return DEFAULT_DESIRED_WAKE_TIME
  try {
    const raw = localStorage.getItem(sleepWakeKey(userId))
    if (raw && /^\d{2}:\d{2}$/.test(raw)) return raw
  } catch {}
  return DEFAULT_DESIRED_WAKE_TIME
}

export function writeDesiredWakeTime(userId: string, wakeTime: string) {
  if (!/^\d{2}:\d{2}$/.test(wakeTime)) return
  localStorage.setItem(sleepWakeKey(userId), wakeTime)
  window.dispatchEvent(new CustomEvent(HUB_PREFS_CHANGED_EVENT))
}

export function readInjectionIntervalDays(userId: string | undefined): number {
  if (typeof window === "undefined" || !userId) return DEFAULT_INJECTION_INTERVAL_DAYS
  try {
    const raw = localStorage.getItem(peptideIntervalKey(userId))
    const n = raw ? Number(raw) : NaN
    if (Number.isFinite(n) && n >= 1 && n <= 30) return Math.round(n)
  } catch {}
  return DEFAULT_INJECTION_INTERVAL_DAYS
}

export function writeInjectionIntervalDays(userId: string, days: number) {
  const n = Math.round(days)
  if (!Number.isFinite(n) || n < 1 || n > 30) return
  localStorage.setItem(peptideIntervalKey(userId), String(n))
  window.dispatchEvent(new CustomEvent(HUB_PREFS_CHANGED_EVENT))
}

/** Minutes since midnight for "HH:mm". */
function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Target bedtime = desired wake minus sleep goal hours (wraps previous calendar day). */
export function computeTargetBedtime(
  desiredWakeTime: string,
  sleepHoursGoal: number
): string {
  return computeTargetBedtimeParts(desiredWakeTime, sleepHoursGoal).display
}

export function computeTargetBedtimeParts(
  desiredWakeTime: string,
  sleepHoursGoal: number
): { hours24: number; minutes: number; display: string } {
  const wakeMin = parseTimeToMinutes(desiredWakeTime)
  const bedMin =
    (((wakeMin - Math.round(sleepHoursGoal * 60)) % (24 * 60)) + 24 * 60) % (24 * 60)
  const hours24 = Math.floor(bedMin / 60)
  const minutes = bedMin % 60
  const d = new Date(2000, 0, 1, hours24, minutes)
  return { hours24, minutes, display: format(d, "h:mm a") }
}

export type NextInjectionInfo = {
  daysUntil: number
  nextDateKey: string
  nextLabel: string
  overdue: boolean
  dueToday: boolean
}

export function computeNextInjection(
  lastInjectedAt: string | null | undefined,
  intervalDays: number,
  refDateKey: string
): NextInjectionInfo | null {
  if (!lastInjectedAt) return null
  const last = startOfDay(new Date(lastInjectedAt))
  const ref = startOfDay(new Date(refDateKey + "T12:00:00"))
  const next = addDays(last, intervalDays)
  const daysUntil = differenceInCalendarDays(next, ref)
  return {
    daysUntil,
    nextDateKey: format(next, "yyyy-MM-dd"),
    nextLabel: format(next, "MMM d"),
    overdue: daysUntil < 0,
    dueToday: daysUntil === 0,
  }
}
