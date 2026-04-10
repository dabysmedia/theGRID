import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPin } from "@/lib/pin-hash"

const AVATAR_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#a855f7", "#f59e0b",
  "#ec4899", "#6366f1", "#14b8a6", "#f97316", "#06b6d4",
]

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, avatarColor: true, avatarUrl: true },
      orderBy: { createdAt: "asc" },
    })
    return NextResponse.json(users)
  } catch {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 })
    }
    const pin = typeof body.pin === "string" ? body.pin : ""
    if (pin && (pin.length < 4 || pin.length > 8)) {
      return NextResponse.json({ error: "PIN must be 4–8 characters." }, { status: 400 })
    }

    const count = await prisma.user.count()
    const avatarColor = body.avatarColor || AVATAR_COLORS[count % AVATAR_COLORS.length]

    const user = await prisma.user.create({
      data: {
        name,
        pinHash: pin ? hashPin(pin) : "",
        avatarColor,
      },
      select: { id: true, name: true, avatarColor: true, avatarUrl: true },
    })
    return NextResponse.json(user, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 })
  }
}
