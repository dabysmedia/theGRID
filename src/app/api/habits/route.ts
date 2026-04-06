import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const habits = await prisma.habit.findMany({
      where: { archived: false },
      orderBy: { sortOrder: "asc" },
      include: {
        completions: {
          orderBy: { date: "desc" },
        },
      },
    })
    return NextResponse.json(habits)
  } catch {
    return NextResponse.json({ error: "Failed to fetch habits" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const maxSort = await prisma.habit.aggregate({ _max: { sortOrder: true } })
    const habit = await prisma.habit.create({
      data: {
        name: body.name,
        icon: body.icon || "check",
        color: body.color || "#22c55e",
        frequency: body.frequency || "daily",
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
      include: { completions: true },
    })
    return NextResponse.json(habit, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create habit" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 })
    const habit = await prisma.habit.update({
      where: { id: body.id },
      data: {
        name: body.name ?? undefined,
        icon: body.icon ?? undefined,
        color: body.color ?? undefined,
        frequency: body.frequency ?? undefined,
        archived: body.archived ?? undefined,
        sortOrder: body.sortOrder ?? undefined,
      },
      include: { completions: true },
    })
    return NextResponse.json(habit)
  } catch {
    return NextResponse.json({ error: "Failed to update habit" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
    await prisma.habit.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete habit" }, { status: 500 })
  }
}
