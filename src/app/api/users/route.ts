import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPin } from "@/lib/pin"
import { ensureDefaultUser } from "@/lib/current-user"

export async function GET() {
  try {
    await ensureDefaultUser()
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        avatarColor: true,
        createdAt: true,
      },
    })
    return NextResponse.json(users)
  } catch {
    return NextResponse.json({ error: "Failed to fetch users." }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const pin = typeof body.pin === "string" ? body.pin.trim() : ""
    const avatarColor =
      typeof body.avatarColor === "string" && body.avatarColor.trim()
        ? body.avatarColor.trim()
        : "#22c55e"

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 })
    }
    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits." }, { status: 400 })
    }

    const user = await prisma.user.create({
      data: {
        name,
        pinHash: hashPin(pin),
        avatarColor,
      },
      select: {
        id: true,
        name: true,
        avatarColor: true,
        createdAt: true,
      },
    })
    return NextResponse.json(user, { status: 201 })
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A user with this name already exists." }, { status: 409 })
    }
    return NextResponse.json({ error: "Failed to create user." }, { status: 500 })
  }
}

