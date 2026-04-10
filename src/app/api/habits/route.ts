import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const habits = await prisma.habit.findMany({
      where: { archived: false, userId },
      orderBy: { sortOrder: "asc" },
      include: {
        completions: {
          orderBy: { date: "desc" },
        },
      },
    })
    return NextResponse.json(habits)
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to fetch habits" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const maxSort = await prisma.habit.aggregate({ _max: { sortOrder: true }, where: { userId } })
    const habit = await prisma.habit.create({
      data: {
        name: body.name,
        icon: body.icon || "check",
        color: body.color || "#22c55e",
        frequency: body.frequency || "daily",
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        userId,
      },
      include: { completions: true },
    })
    return NextResponse.json(habit, { status: 201 })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to create habit" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 })

    const existing = await prisma.habit.findFirst({ where: { id: body.id, userId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

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
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to update habit" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

    const { count } = await prisma.habit.deleteMany({ where: { id, userId } })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to delete habit" }, { status: 500 })
  }
}
