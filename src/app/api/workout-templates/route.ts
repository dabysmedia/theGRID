import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const templates = await prisma.workoutTemplate.findMany({
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(templates)
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, exercises } = body
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    const template = await prisma.workoutTemplate.create({
      data: {
        name: name.trim(),
        exercises: JSON.stringify(Array.isArray(exercises) ? exercises : []),
      },
    })
    return NextResponse.json(template, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, name, exercises } = body
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })
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
  } catch {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })
  try {
    await prisma.workoutTemplate.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
