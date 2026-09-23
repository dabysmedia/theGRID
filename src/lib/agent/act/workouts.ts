import "server-only"

import { prisma } from "@/lib/prisma"
import { parseYyyyMmDdToStoredDate, utcCalendarDayKeyFromIso, utcRangeWhereForCalendarDay } from "@/lib/dateStorage"
import { ActError, num, pick, requireIds, resolveDayKey, str } from "@/lib/agent/act/parse"
import type { ActContext, ActFn } from "@/lib/agent/act/types"
import { compactExercises, parseAgentExercises } from "@/lib/agent/act/workout-shape"

const STATUSES = new Set(["active", "completed", "planned", "superseded"])

function userOf(ctx: ActContext | null): ActContext {
  if (!ctx) throw new ActError("This op needs a user.")
  return ctx
}

function sessionRow(session: {
  id: string
  name: string
  date: Date
  status: string
  notes: string | null
  duration: number | null
  bodyWeightLb: number | null
  exercises: string
}): Record<string, unknown> {
  return pick({
    id: session.id,
    date: utcCalendarDayKeyFromIso(session.date),
    name: session.name,
    status: session.status,
    minutes: session.duration,
    bw: session.bodyWeightLb,
    notes: session.notes,
    exercises: compactExercises(session.exercises),
  })
}

async function workoutList(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const date = args.date != null && str(args.date) !== "" ? resolveDayKey(args.date, context.today) : null
  const n = date ? 20 : Math.max(1, Math.min(10, Math.round(num(args.n ?? args.limit) ?? 5)))
  const sessions = await prisma.workoutSession.findMany({
    where: {
      userId: context.user.id,
      ...(date ? { date: utcRangeWhereForCalendarDay(date) } : {}),
    },
    orderBy: { date: "desc" },
    take: n,
  })
  return { n: sessions.length, items: sessions.map(sessionRow) }
}

async function workoutAdd(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const date = resolveDayKey(args.date, context.today)
  const status = str(args.status).toLowerCase() || "completed"
  if (!STATUSES.has(status)) throw new ActError("status must be completed, active, planned, or superseded.")
  const exercises = parseAgentExercises(args.exercises)
  const minutes = num(args.minutes ?? args.duration)
  const bw = num(args.bw ?? args.bodyWeightLb)
  const data = {
    name: (str(args.name) || "Workout").slice(0, 120),
    date: parseYyyyMmDdToStoredDate(date),
    exercises: JSON.stringify(exercises),
    notes: str(args.notes).slice(0, 500) || null,
    status,
    duration: minutes != null && minutes > 0 ? Math.round(minutes) : null,
    bodyWeightLb: bw != null && bw > 0 ? bw : null,
    finishedAt: status === "completed" ? context.now : null,
    userId: context.user.id,
  }
  const session = status === "active"
    ? await prisma.$transaction(async (tx) => {
        await tx.workoutSession.updateMany({
          where: { userId: context.user.id, status: "active" },
          data: { status: "superseded" },
        })
        return tx.workoutSession.create({ data })
      })
    : await prisma.workoutSession.create({ data })
  return sessionRow(session)
}

async function workoutUpdate(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const id = str(args.id)
  if (!id) throw new ActError("id is required.")
  const existing = await prisma.workoutSession.findFirst({ where: { id, userId: context.user.id } })
  if (!existing) throw new ActError("Workout not found.", 404)
  const status = args.status != null ? str(args.status).toLowerCase() : null
  if (status && !STATUSES.has(status)) {
    throw new ActError("status must be completed, active, planned, or superseded.")
  }
  const data: Record<string, unknown> = {}
  if (args.name != null) data.name = str(args.name).slice(0, 120) || existing.name
  if (args.notes != null) data.notes = str(args.notes).slice(0, 500) || null
  if (args.date != null) data.date = parseYyyyMmDdToStoredDate(resolveDayKey(args.date, context.today))
  if (args.exercises != null) data.exercises = JSON.stringify(parseAgentExercises(args.exercises))
  if (args.minutes != null || args.duration != null) {
    const minutes = num(args.minutes ?? args.duration)
    data.duration = minutes != null && minutes > 0 ? Math.round(minutes) : null
  }
  if (args.bw != null || args.bodyWeightLb != null) {
    const bw = num(args.bw ?? args.bodyWeightLb)
    data.bodyWeightLb = bw != null && bw > 0 ? bw : null
  }
  if (status) {
    data.status = status
    if (status === "completed" && !existing.finishedAt) data.finishedAt = context.now
    if (status !== "completed") data.finishedAt = null
  }
  const startsActive = status === "active"
  const session = startsActive
    ? await prisma.$transaction(async (tx) => {
        await tx.workoutSession.updateMany({
          where: { userId: context.user.id, status: "active", id: { not: id } },
          data: { status: "superseded" },
        })
        return tx.workoutSession.update({ where: { id }, data })
      })
    : await prisma.workoutSession.update({ where: { id }, data })
  return sessionRow(session)
}

async function workoutMove(args: Record<string, unknown>, ctx: ActContext | null) {
  if (args.date == null) throw new ActError("workout.move needs a date.")
  return workoutUpdate({ id: args.id, date: args.date }, ctx)
}

async function workoutDel(args: Record<string, unknown>, ctx: ActContext | null) {
  const { user } = userOf(ctx)
  const ids = requireIds(args)
  const result = await prisma.workoutSession.deleteMany({ where: { id: { in: ids }, userId: user.id } })
  if (result.count === 0) throw new ActError("Workout not found.", 404)
  return { deleted: result.count }
}

export const workoutHandlers: Record<string, ActFn> = {
  "workout.list": workoutList,
  "workout.add": workoutAdd,
  "workout.update": workoutUpdate,
  "workout.move": workoutMove,
  "workout.del": workoutDel,
}
