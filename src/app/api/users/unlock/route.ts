import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPin, isLegacyPlainPin, verifyPin } from "@/lib/pin"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const userId = typeof body.userId === "string" ? body.userId.trim() : ""
    const pin = typeof body.pin === "string" ? body.pin.trim() : ""
    if (!userId || !pin) {
      return NextResponse.json({ error: "userId and pin are required." }, { status: 400 })
    }
    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits." }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 })
    }

    const valid = verifyPin(pin, user.pinHash)
    if (!valid) {
      return NextResponse.json({ error: "Invalid PIN." }, { status: 401 })
    }

    if (isLegacyPlainPin(user.pinHash)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { pinHash: hashPin(pin) },
      })
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        avatarColor: user.avatarColor,
      },
    })
  } catch {
    return NextResponse.json({ error: "Failed to unlock user." }, { status: 500 })
  }
}

