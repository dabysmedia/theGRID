import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"
import { TRAINING_SPLITS, type TrainingSplit } from "@/lib/workouts/training-split"

export async function PATCH(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const trainingSplit = body.trainingSplit as TrainingSplit
    if (!TRAINING_SPLITS.includes(trainingSplit)) {
      return NextResponse.json({ error: "Choose a valid training split." }, { status: 400 })
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data: { trainingSplit },
      select: { trainingSplit: true },
    })
    return NextResponse.json(user)
  } catch (error) {
    if (error instanceof UserError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error("[user training-split PATCH]", error)
    return NextResponse.json({ error: "Failed to save training split." }, { status: 500 })
  }
}
