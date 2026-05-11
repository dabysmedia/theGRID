import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"

interface ProfileBody {
  fastHours?: number
  eatHours?: number
  /** Epoch ms when the eating window last ended */
  lastMealAtMs?: number | null
  /** "anchored" | "clock" */
  mode?: string
  eatWindowStartMinutes?: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = (await req.json()) as ProfileBody

    const fastHours = clamp(Math.round(body.fastHours ?? 16), 1, 23)
    let eatHours = clamp(Math.round(body.eatHours ?? 8), 1, 23)
    if (fastHours + eatHours !== 24) eatHours = clamp(24 - fastHours, 1, 23)
    const mode = body.mode === "clock" ? "clock" : "anchored"
    const eatWindowStartMinutes = clamp(
      Math.round(body.eatWindowStartMinutes ?? 720),
      0,
      1439
    )
    const lastMealAtMs =
      typeof body.lastMealAtMs === "number" && Number.isFinite(body.lastMealAtMs)
        ? BigInt(Math.round(body.lastMealAtMs))
        : null

    await prisma.fastingProfile.upsert({
      where: { userId },
      create: { userId, fastHours, eatHours, mode, eatWindowStartMinutes, lastMealAtMs },
      update: { fastHours, eatHours, mode, eatWindowStartMinutes, lastMealAtMs },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[fasting profile PUT]", e)
    return NextResponse.json({ error: "Failed to save" }, { status: 500 })
  }
}
