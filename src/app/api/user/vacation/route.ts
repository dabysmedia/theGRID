import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"
import { formatDate } from "@/lib/utils"
import {
  ensureUserVacationColumn,
  isMissingUserVacationColumnError,
} from "@/lib/ensure-user-vacation-column"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function patchVacationDate(userId: string, value: string | null) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { vacationResumeDate: value },
    })
  } catch (e) {
    if (!isMissingUserVacationColumnError(e)) throw e
    try {
      await ensureUserVacationColumn()
    } catch (alterErr) {
      const m = alterErr instanceof Error ? alterErr.message : String(alterErr)
      if (!/duplicate column/i.test(m)) throw alterErr
    }
    await prisma.user.update({
      where: { id: userId },
      data: { vacationResumeDate: value },
    })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const raw = body.vacationResumeDate

    if (raw === null || raw === "") {
      await patchVacationDate(userId, null)
      return NextResponse.json({ vacationResumeDate: null })
    }

    const s = typeof raw === "string" ? raw.trim().slice(0, 10) : ""
    if (!DATE_RE.test(s)) {
      return NextResponse.json({ error: "Return date must be yyyy-MM-dd." }, { status: 400 })
    }

    const today = formatDate(new Date())
    if (s < today) {
      return NextResponse.json(
        { error: "Return date cannot be in the past. Clear vacation instead." },
        { status: 400 }
      )
    }

    await patchVacationDate(userId, s)
    return NextResponse.json({ vacationResumeDate: s })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error("[user vacation PATCH]", e)
    const dev = process.env.NODE_ENV === "development"
    return NextResponse.json(
      {
        error:
          dev && e instanceof Error
            ? e.message
            : "Failed to update vacation mode. Try again after a refresh, or run: npx prisma db push",
      },
      { status: 500 }
    )
  }
}
