import "server-only"

import { prisma } from "@/lib/prisma"
import { UserError } from "@/lib/current-user"
import { isVacationBlockingCalendarDay, normalizeDayKey } from "@/lib/vacation-mode"
import { isMissingUserVacationColumnError } from "@/lib/ensure-user-vacation-column"

export async function assertNotVacationBlocked(userId: string, dateInput: string | undefined | null) {
  const dayKey = normalizeDayKey(dateInput ?? undefined)
  if (!dayKey) return
  let vacationResumeDate: string | null | undefined
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { vacationResumeDate: true },
    })
    vacationResumeDate = u?.vacationResumeDate
  } catch (e) {
    if (!isMissingUserVacationColumnError(e)) throw e
    vacationResumeDate = null
  }
  if (isVacationBlockingCalendarDay(vacationResumeDate ?? null, dayKey)) {
    throw new UserError(
      "Vacation mode is on. Calorie and weight logging resume on your return date.",
      403
    )
  }
}
