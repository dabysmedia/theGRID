import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"

export async function PATCH(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Choose whether Protocol is enabled." }, { status: 400 })
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { protocolEnabled: body.enabled },
      select: { protocolEnabled: true },
    })
    return NextResponse.json(user)
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[user protocol PATCH]", error)
    return NextResponse.json({ error: "Failed to update Protocol preference." }, { status: 500 })
  }
}
