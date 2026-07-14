import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"
import {
  DEFAULT_WORK_CYCLE_PATTERN,
  DEFAULT_WORKOUT_GOAL_PER_CYCLE,
} from "@/lib/work-cycle"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function PATCH(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const enabled = body.enabled !== false
    const anchorDate = typeof body.anchorDate === "string" ? body.anchorDate.trim() : ""
    const goal = Number(body.goal ?? DEFAULT_WORKOUT_GOAL_PER_CYCLE)

    if (!DATE_RE.test(anchorDate)) {
      return NextResponse.json({ error: "Choose the date that begins rotation day 1." }, { status: 400 })
    }
    if (!Number.isInteger(goal) || goal < 1 || goal > 14) {
      return NextResponse.json({ error: "Workout goal must be between 1 and 14." }, { status: 400 })
    }

    const patternJson = JSON.stringify(DEFAULT_WORK_CYCLE_PATTERN)
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        workCycleEnabled: enabled,
        workCycleAnchorDate: anchorDate,
        workCycleLength: 8,
        workCyclePatternJson: patternJson,
        workoutGoalPerCycle: goal,
      },
      select: {
        workCycleEnabled: true,
        workCycleAnchorDate: true,
        workCycleLength: true,
        workCyclePatternJson: true,
        workoutGoalPerCycle: true,
      },
    })

    return NextResponse.json(user)
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[user work-cycle PATCH]", error)
    return NextResponse.json({ error: "Failed to save work rotation." }, { status: 500 })
  }
}
