import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPin } from "@/lib/pin-hash"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const userId = typeof body.userId === "string" ? body.userId : ""
    const pin = typeof body.pin === "string" ? body.pin : ""

    if (!userId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, avatarColor: true, pinHash: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 })
    }

    if (!user.pinHash) {
      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          avatarColor: user.avatarColor,
        },
      })
    }

    if (!verifyPin(pin, user.pinHash)) {
      return NextResponse.json({ error: "Wrong PIN." }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        avatarColor: user.avatarColor,
      },
    })
  } catch {
    return NextResponse.json({ error: "Unlock failed." }, { status: 500 })
  }
}
