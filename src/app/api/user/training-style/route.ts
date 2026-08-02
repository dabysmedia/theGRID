import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"
import { TRAINING_STYLES, type TrainingStyle } from "@/lib/workouts/training-style"

export async function PATCH(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const trainingStyle = body.trainingStyle as TrainingStyle

    if (!TRAINING_STYLES.includes(trainingStyle)) {
      return NextResponse.json({ error: "Choose Science-Based or Classic." }, { status: 400 })
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { trainingStyle },
      select: { trainingStyle: true },
    })

    return NextResponse.json(user)
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[user training-style PATCH]", error)
    return NextResponse.json({ error: "Failed to save training style." }, { status: 500 })
  }
}
