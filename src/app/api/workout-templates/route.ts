import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const templates = await prisma.workoutTemplate.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(templates)
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const { name, exercises } = body
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    const template = await prisma.workoutTemplate.create({
      data: {
        name: name.trim(),
        exercises: JSON.stringify(Array.isArray(exercises) ? exercises : []),
        userId,
      },
    })
    return NextResponse.json(template, { status: 201 })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to create" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const { id, name, exercises } = body
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    const existing = await prisma.workoutTemplate.findFirst({ where: { id, userId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const template = await prisma.workoutTemplate.update({
      where: { id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(exercises !== undefined
          ? { exercises: JSON.stringify(Array.isArray(exercises) ? exercises : []) }
          : {}),
      },
    })
    return NextResponse.json(template)
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const id = new URL(req.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    const { count } = await prisma.workoutTemplate.deleteMany({ where: { id, userId } })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
