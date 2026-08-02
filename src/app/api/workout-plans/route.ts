import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  parseYyyyMmDdToStoredDate,
  utcCalendarDayRangeInclusive,
} from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function noStore<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store, must-revalidate" },
  })
}

function readDate(value: unknown): string | null {
  const date = String(value ?? "").trim()
  if (!DATE_RE.test(date)) return null
  try {
    parseYyyyMmDdToStoredDate(date)
    return date
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const from = readDate(searchParams.get("from"))
    const to = readDate(searchParams.get("to"))
    if (!from || !to || from > to) {
      return noStore({ error: "Valid from/to dates are required." }, { status: 400 })
    }

    const date = utcCalendarDayRangeInclusive(from, to)
    const [plans, completedCount] = await Promise.all([
      prisma.workoutSession.findMany({
        where: { userId, status: "planned", date },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      }),
      prisma.workoutSession.count({
        where: { userId, status: "completed", date },
      }),
    ])

    return noStore({ plans, completedCount })
  } catch (error) {
    if (error instanceof UserError) {
      return noStore({ error: error.message }, { status: error.status })
    }
    return noStore({ error: "Failed to load workout plans." }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const date = readDate(body.date)
    if (!date) {
      return noStore({ error: "A valid workout date is required." }, { status: 400 })
    }

    const templateId = typeof body.templateId === "string" ? body.templateId.trim() : ""
    const template = templateId
      ? await prisma.workoutTemplate.findFirst({ where: { id: templateId, userId } })
      : null
    if (templateId && !template) {
      return noStore({ error: "Routine not found." }, { status: 404 })
    }

    const customName = typeof body.name === "string" ? body.name.trim().slice(0, 120) : ""
    const name = template?.name ?? customName ?? ""
    if (!name) {
      return noStore({ error: "Choose a routine or enter a workout name." }, { status: 400 })
    }

    const storedDate = parseYyyyMmDdToStoredDate(date)
    const plan = await prisma.workoutSession.create({
      data: {
        name,
        date: storedDate,
        startedAt: storedDate,
        status: "planned",
        exercises: template?.exercises ?? "[]",
        coverImageUrl: template?.coverImageUrl ?? null,
        userId,
      },
    })

    return noStore(plan, { status: 201 })
  } catch (error) {
    if (error instanceof UserError) {
      return noStore({ error: error.message }, { status: error.status })
    }
    console.error("[workout-plans POST]", error)
    return noStore({ error: "Failed to schedule workout." }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const id = new URL(req.url).searchParams.get("id")?.trim()
    if (!id) return noStore({ error: "Plan ID is required." }, { status: 400 })

    const { count } = await prisma.workoutSession.deleteMany({
      where: { id, userId, status: "planned" },
    })
    if (!count) return noStore({ error: "Workout plan not found." }, { status: 404 })
    return noStore({ success: true })
  } catch (error) {
    if (error instanceof UserError) {
      return noStore({ error: error.message }, { status: error.status })
    }
    return noStore({ error: "Failed to remove workout plan." }, { status: 500 })
  }
}
