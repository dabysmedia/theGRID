import { subDays } from "date-fns"
import { formatDate, parseLocalDate } from "@/lib/utils"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * When `vacationResumeDate` is set (yyyy-MM-dd), calorie and weight logging are blocked on
 * calendar days strictly before that date. On the resume date and after, logging is allowed.
 */
export function isVacationBlockingCalendarDay(
  vacationResumeDate: string | null | undefined,
  calendarDayYyyyMmDd: string
): boolean {
  if (!vacationResumeDate || !DATE_RE.test(vacationResumeDate) || !DATE_RE.test(calendarDayYyyyMmDd)) {
    return false
  }
  return calendarDayYyyyMmDd < vacationResumeDate
}

/**
 * Same 7 slots as `/api/dashboard` `last7`: index 0 = `refDay - 6`, … index 6 = `refDay`.
 * `true` = that calendar day is in vacation (calorie UI hidden for that segment).
 */
export function vacationCalorieDayMask(
  vacationResumeDate: string | null | undefined,
  refDayYyyyMmDd: string
): boolean[] {
  if (!DATE_RE.test(refDayYyyyMmDd)) return Array.from({ length: 7 }, () => false)
  const ref = parseLocalDate(refDayYyyyMmDd)
  return Array.from({ length: 7 }, (_, i) => {
    const d = subDays(ref, 6 - i)
    const key = formatDate(d)
    return isVacationBlockingCalendarDay(vacationResumeDate, key)
  })
}

export function normalizeDayKey(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== "string") return null
  const s = raw.trim().slice(0, 10)
  return DATE_RE.test(s) ? s : null
}
