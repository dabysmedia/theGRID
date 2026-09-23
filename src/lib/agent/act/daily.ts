import "server-only"

import { prisma } from "@/lib/prisma"
import { requireProtocolEnabled } from "@/lib/current-user"
import { parseYyyyMmDdToStoredDate, utcRangeWhereForCalendarDay } from "@/lib/dateStorage"
import { addDaysToYmd, localTimeToUtc, resolveStepsTimezone, stepsRefDayKey } from "@/lib/steps-day"
import { considerBodyweightRecordLow } from "@/lib/weight-record-low"
import { assertNotVacationBlocked } from "@/lib/vacation-block-server"
import { WATER_LOG_MAX_OZ } from "@/lib/water"
import { isCardioActivity } from "@/lib/cardio"
import { qualityToScore, scoreToLegacyQuality } from "@/lib/sleep-score"
import { sleepDurationHours } from "@/lib/sleepDuration"
import { INJECTION_SITE_IDS, normalizeSideEffects } from "@/lib/peptides"
import { JOURNAL_CONTENT_MAX } from "@/lib/journal"
import {
  ActError,
  num,
  pick,
  requireIds,
  resolveDayKey,
  str,
} from "@/lib/agent/act/parse"
import type { ActContext, ActFn } from "@/lib/agent/act/types"

function userOf(ctx: ActContext | null): ActContext {
  if (!ctx) throw new ActError("This op needs a user.")
  return ctx
}

function dayOf(args: Record<string, unknown>, ctx: ActContext): string {
  return resolveDayKey(args.date, ctx.today)
}

function notesOf(value: unknown): string | null {
  const notes = str(value)
  return notes ? notes.slice(0, 500) : null
}

function clockOn(value: unknown, day: string, timeZone: string): Date {
  const raw = str(value)
  if (!raw) throw new ActError("A time is required. Use HH:MM or an ISO timestamp.")
  if (raw.includes("T") || raw.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(raw)) {
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) throw new ActError("Invalid time. Use HH:MM or an ISO timestamp.")
    return date
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw)
  if (!match) throw new ActError("Invalid time. Use HH:MM in the profile timezone, or an ISO timestamp.")
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) throw new ActError("Invalid time.")
  return localTimeToUtc(day, hour * 60 + minute, resolveStepsTimezone(timeZone))
}

async function dropOwned(
  userId: string,
  ids: string[],
  remove: (ids: string[]) => Promise<{ count: number }>,
  label: string,
) {
  const result = await remove(ids)
  if (result.count === 0) throw new ActError(`${label} not found.`, 404)
  return { deleted: result.count }
}

export async function readDay(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const date = dayOf(args, context)
  const range = utcRangeWhereForCalendarDay(date)
  const userId = context.user.id
  const [
    foods,
    water,
    weight,
    steps,
    sleep,
    runs,
    cardio,
    alcohol,
    bowel,
    journal,
    recovery,
    workouts,
    habits,
    habitDone,
    peptides,
  ] = await Promise.all([
    prisma.calorieEntry.findMany({
      where: { userId, date: range },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, mealSlot: true, description: true, calories: true,
        protein: true, carbs: true, fat: true, portionAmount: true, portionUnit: true,
      },
    }),
    prisma.waterEntry.findMany({
      where: { userId, date: range },
      select: { id: true, amountOz: true },
    }),
    prisma.longGoalEntry.findFirst({
      where: { date: range, goal: { userId, category: "bodyweight" } },
      select: { id: true, value: true },
    }),
    prisma.stepEntry.findMany({
      where: { userId, date: range },
      select: { id: true, count: true, source: true },
    }),
    prisma.sleepEntry.findFirst({
      where: { userId, date: range },
      orderBy: { createdAt: "desc" },
      select: { id: true, bedtime: true, wakeTime: true, score: true },
    }),
    prisma.runEntry.findMany({
      where: { userId, date: range },
      select: { id: true, distance: true, duration: true, environment: true },
    }),
    prisma.cardioEntry.findMany({
      where: { userId, date: range, deletedAt: null },
      select: { id: true, activityType: true, minutes: true },
    }),
    prisma.alcoholEntry.findMany({
      where: { userId, date: range },
      select: { id: true, drinkType: true, quantity: true, units: true },
    }),
    prisma.bowelEntry.findMany({
      where: { userId, date: range },
      select: { id: true, bristolScale: true, time: true },
    }),
    prisma.journalEntry.findMany({
      where: { userId, date: range },
      orderBy: { createdAt: "asc" },
      select: { id: true, content: true, mood: true },
    }),
    prisma.recoveryDailyEntry.findFirst({
      where: { userId, date: range },
      select: {
        pain: true, energy: true, mood: true, soreness: true, stress: true, mobility: true, sleepFeel: true,
      },
    }),
    prisma.workoutSession.findMany({
      where: { userId, date: range },
      select: { id: true, name: true, status: true },
    }),
    prisma.habit.findMany({
      where: { userId, archived: false },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.habitCompletion.findMany({
      where: { date: range, habit: { userId, archived: false } },
      select: { habitId: true },
    }),
    prisma.peptideEntry.findMany({
      where: { userId, date: range },
      select: { id: true, compound: true, doseMg: true, injectionSite: true },
    }),
  ])

  const done = new Set(habitDone.map((row) => row.habitId))
  const manualSteps = steps.filter((row) => row.source == null).reduce((sum, row) => sum + row.count, 0)
  const syncedSteps = steps.filter((row) => row.source != null).reduce((sum, row) => sum + row.count, 0)
  return {
    date,
    kcal: foods.reduce((sum, row) => sum + row.calories, 0),
    p: Math.round(foods.reduce((sum, row) => sum + (row.protein ?? 0), 0) * 10) / 10,
    c: Math.round(foods.reduce((sum, row) => sum + (row.carbs ?? 0), 0) * 10) / 10,
    f: Math.round(foods.reduce((sum, row) => sum + (row.fat ?? 0), 0) * 10) / 10,
    foods: foods.map((row) =>
      pick({
        id: row.id,
        slot: row.mealSlot,
        name: row.description,
        kcal: row.calories,
        p: row.protein,
        c: row.carbs,
        f: row.fat,
        amt: row.portionAmount,
        unit: row.portionUnit,
      }),
    ),
    waterOz: Math.round(water.reduce((sum, row) => sum + row.amountOz, 0) * 10) / 10,
    water: water.map((row) => ({ id: row.id, oz: row.amountOz })),
    weight: weight ? { id: weight.id, lbs: weight.value } : null,
    steps: {
      total: manualSteps + syncedSteps,
      manual: manualSteps,
      synced: syncedSteps,
      ids: steps.map((row) => row.id),
    },
    sleep: sleep
      ? {
          id: sleep.id,
          bedtime: sleep.bedtime.toISOString(),
          wake: sleep.wakeTime.toISOString(),
          hours: sleepDurationHours(sleep.bedtime, sleep.wakeTime),
          score: sleep.score,
        }
      : null,
    runs: runs.map((row) => ({ id: row.id, miles: row.distance, minutes: row.duration, where: row.environment })),
    cardio: cardio.map((row) => ({ id: row.id, activity: row.activityType, minutes: row.minutes })),
    workouts: workouts.map((row) => ({ id: row.id, name: row.name, status: row.status })),
    habits: habits.map((row) => ({ id: row.id, name: row.name, done: done.has(row.id) })),
    alcohol: alcohol.map((row) => ({ id: row.id, drink: row.drinkType, qty: row.quantity, units: row.units })),
    bowel: bowel.map((row) => ({ id: row.id, bristol: row.bristolScale, time: row.time.toISOString() })),
    journal: journal.map((row) => pick({ id: row.id, mood: row.mood, text: row.content })),
    recovery: recovery
      ? {
          pain: recovery.pain,
          energy: recovery.energy,
          mood: recovery.mood,
          soreness: recovery.soreness,
          stress: recovery.stress,
          mobility: recovery.mobility,
          sleep: recovery.sleepFeel,
        }
      : null,
    peptides: peptides.map((row) => ({
      id: row.id,
      compound: row.compound,
      mg: row.doseMg,
      site: row.injectionSite,
    })),
  }
}

async function waterAdd(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const date = dayOf(args, context)
  const oz = num(args.oz ?? args.amountOz ?? args.amount)
  if (oz == null || oz <= 0 || oz > WATER_LOG_MAX_OZ) {
    throw new ActError(`oz must be between 0 and ${WATER_LOG_MAX_OZ}.`)
  }
  const entry = await prisma.waterEntry.create({
    data: { date: parseYyyyMmDdToStoredDate(date), amountOz: Math.round(oz * 10) / 10, userId: context.user.id },
    select: { id: true, amountOz: true },
  })
  return { id: entry.id, date, oz: entry.amountOz }
}

async function weightSet(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const date = dayOf(args, context)
  const lbs = num(args.lbs ?? args.value ?? args.weight)
  if (lbs == null || lbs < 40 || lbs > 800) throw new ActError("lbs must be between 40 and 800.")
  await assertNotVacationBlocked(context.user.id, date)
  let goal = await prisma.longGoal.findFirst({ where: { category: "bodyweight", userId: context.user.id } })
  if (!goal) {
    goal = await prisma.longGoal.create({
      data: {
        name: "Bodyweight",
        category: "bodyweight",
        target: 0,
        unit: "lbs",
        direction: "down",
        active: true,
        userId: context.user.id,
      },
    })
  }
  const stored = parseYyyyMmDdToStoredDate(date)
  const existing = await prisma.longGoalEntry.findFirst({ where: { goalId: goal.id, date: stored } })
  const entry = existing
    ? await prisma.longGoalEntry.update({
        where: { id: existing.id },
        data: { value: lbs, notes: args.notes != null ? notesOf(args.notes) : existing.notes },
      })
    : await prisma.longGoalEntry.create({
        data: { goalId: goal.id, date: stored, value: lbs, notes: notesOf(args.notes) },
      })
  await considerBodyweightRecordLow(goal.id, lbs, stored)
  return { id: entry.id, date, lbs }
}

async function weightDel(args: Record<string, unknown>, ctx: ActContext | null) {
  const { user } = userOf(ctx)
  const ids = requireIds(args)
  const owned = await prisma.longGoalEntry.findMany({
    where: { id: { in: ids }, goal: { userId: user.id } },
    select: { id: true },
  })
  if (owned.length === 0) throw new ActError("Weigh-in not found.", 404)
  await prisma.longGoalEntry.deleteMany({ where: { id: { in: owned.map((row) => row.id) } } })
  return { deleted: owned.length }
}

async function stepsSet(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const requested = dayOf(args, context)
  const count = num(args.count ?? args.steps)
  if (count == null || !Number.isInteger(count) || count <= 0 || count > 200000) {
    throw new ActError("steps.set needs a positive whole-number count.")
  }
  const date = stepsRefDayKey(requested, context.now, resolveStepsTimezone(context.user.timeZone))
  const range = utcRangeWhereForCalendarDay(date)
  const existing = await prisma.stepEntry.findMany({
    where: { userId: context.user.id, date: range, source: null },
  })
  const kept = existing[0]
  const row = kept
    ? await prisma.stepEntry.update({ where: { id: kept.id }, data: { count } })
    : await prisma.stepEntry.create({
        data: { date: parseYyyyMmDdToStoredDate(date), count, userId: context.user.id },
      })
  if (existing.length > 1) {
    await prisma.stepEntry.deleteMany({
      where: { id: { in: existing.slice(1).map((item) => item.id) }, userId: context.user.id },
    })
  }
  const synced = await prisma.stepEntry.aggregate({
    where: { userId: context.user.id, date: range, source: { not: null } },
    _sum: { count: true },
  })
  return { id: row.id, date, count, synced: synced._sum.count ?? 0 }
}

async function sleepSet(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const date = dayOf(args, context)
  const zone = context.user.timeZone ?? "America/New_York"
  const wake = clockOn(args.wake ?? args.wakeTime, date, zone)
  let bedDay = date
  const bedRaw = str(args.bedtime ?? args.bed)
  const bedClock = /^(\d{1,2}):(\d{2})$/.exec(bedRaw)
  const wakeClock = /^(\d{1,2}):(\d{2})$/.exec(str(args.wake ?? args.wakeTime))
  if (bedClock && wakeClock && Number(bedClock[1]) * 60 + Number(bedClock[2]) >= Number(wakeClock[1]) * 60 + Number(wakeClock[2])) {
    bedDay = addDaysToYmd(date, -1)
  }
  const bedtime = clockOn(args.bedtime ?? args.bed, bedDay, zone)
  const scoreRaw = num(args.score)
  const score = scoreRaw == null ? null : Math.max(0, Math.min(100, Math.round(scoreRaw)))
  const quality = score == null ? 3 : scoreToLegacyQuality(score)
  const storedScore = score ?? qualityToScore(quality)
  const range = utcRangeWhereForCalendarDay(date)
  const existing = await prisma.sleepEntry.findFirst({
    where: { userId: context.user.id, date: range, source: null },
    orderBy: { createdAt: "desc" },
  })
  const data = {
    date: parseYyyyMmDdToStoredDate(date),
    bedtime,
    wakeTime: wake,
    quality,
    score: storedScore,
    notes: args.notes != null ? notesOf(args.notes) : existing?.notes ?? null,
    userId: context.user.id,
  }
  const entry = existing
    ? await prisma.sleepEntry.update({ where: { id: existing.id }, data })
    : await prisma.sleepEntry.create({ data })
  return {
    id: entry.id,
    date,
    hours: sleepDurationHours(entry.bedtime, entry.wakeTime),
    score: entry.score,
  }
}

async function runAdd(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const date = dayOf(args, context)
  const miles = num(args.miles ?? args.distance)
  const minutes = num(args.minutes ?? args.duration)
  if (miles == null || miles <= 0 || miles > 200) throw new ActError("miles must be between 0 and 200.")
  if (minutes == null || minutes <= 0 || minutes > 2000) throw new ActError("minutes must be between 0 and 2000.")
  const where = str(args.where ?? args.environment).toLowerCase()
  const environment = where === "indoor" || where === "outdoor" ? where : where ? null : "outdoor"
  if (!environment) throw new ActError("where must be outdoor or indoor.")
  const entry = await prisma.runEntry.create({
    data: {
      date: parseYyyyMmDdToStoredDate(date),
      distance: miles,
      duration: Math.round(minutes),
      environment,
      notes: notesOf(args.notes),
      userId: context.user.id,
    },
  })
  return { id: entry.id, date, miles, minutes: entry.duration, where: environment }
}

async function runMove(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const id = str(args.id)
  if (!id) throw new ActError("id is required.")
  const date = dayOf(args, context)
  const existing = await prisma.runEntry.findFirst({ where: { id, userId: context.user.id } })
  if (!existing) throw new ActError("Run not found.", 404)
  await prisma.runEntry.update({ where: { id }, data: { date: parseYyyyMmDdToStoredDate(date) } })
  return { id, date }
}

async function cardioAdd(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const requested = dayOf(args, context)
  const minutes = num(args.minutes)
  const activity = str(args.activity ?? args.activityType).toLowerCase()
  if (!isCardioActivity(activity) || minutes == null || minutes <= 0 || minutes > 600) {
    throw new ActError("cardio.add needs activity (cycling, running, stair_stepper, elliptical, rowing, swimming, hiit, cardio) and minutes between 0 and 600.")
  }
  const date = stepsRefDayKey(requested, context.now, resolveStepsTimezone(context.user.timeZone))
  const rounded = Math.round(minutes * 10) / 10
  const endTime = context.now
  const startTime = new Date(endTime.getTime() - rounded * 60_000)
  const entry = await prisma.cardioEntry.create({
    data: {
      date: parseYyyyMmDdToStoredDate(date),
      startTime,
      endTime,
      activityType: activity,
      minutes: rounded,
      notes: notesOf(args.notes),
      userId: context.user.id,
    },
    select: { id: true },
  })
  return { id: entry.id, date, activity, minutes: rounded }
}

async function cardioDel(args: Record<string, unknown>, ctx: ActContext | null) {
  const { user } = userOf(ctx)
  const ids = requireIds(args)
  const rows = await prisma.cardioEntry.findMany({
    where: { id: { in: ids }, userId: user.id, deletedAt: null },
    select: { id: true, externalId: true },
  })
  if (rows.length === 0) throw new ActError("Cardio session not found.", 404)
  const synced = rows.filter((row) => row.externalId).map((row) => row.id)
  const manual = rows.filter((row) => !row.externalId).map((row) => row.id)
  if (synced.length > 0) {
    await prisma.cardioEntry.updateMany({ where: { id: { in: synced } }, data: { deletedAt: new Date() } })
  }
  if (manual.length > 0) {
    await prisma.cardioEntry.deleteMany({ where: { id: { in: manual }, userId: user.id } })
  }
  return { deleted: rows.length }
}

async function alcoholAdd(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const date = dayOf(args, context)
  const drink = str(args.drink ?? args.drinkType)
  const qty = num(args.qty ?? args.quantity)
  const units = num(args.units) ?? qty
  if (!drink || qty == null || qty <= 0 || units == null || units < 0) {
    throw new ActError("alcohol.add needs drink and qty.")
  }
  const entry = await prisma.alcoholEntry.create({
    data: {
      date: parseYyyyMmDdToStoredDate(date),
      drinkType: drink.slice(0, 80),
      quantity: qty,
      units,
      userId: context.user.id,
    },
  })
  return { id: entry.id, date, drink, qty, units }
}

async function bowelAdd(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const date = dayOf(args, context)
  const bristol = num(args.bristol ?? args.bristolScale)
  if (bristol == null || !Number.isInteger(bristol) || bristol < 0 || bristol > 7) {
    throw new ActError("bristol must be an integer 0–7 (0 = no movement).")
  }
  const time = args.time != null
    ? clockOn(args.time, date, context.user.timeZone ?? "America/New_York")
    : context.now
  const entry = await prisma.bowelEntry.create({
    data: {
      date: parseYyyyMmDdToStoredDate(date),
      time,
      bristolScale: bristol,
      notes: notesOf(args.notes),
      userId: context.user.id,
    },
  })
  return { id: entry.id, date, bristol }
}

async function journalAdd(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const date = dayOf(args, context)
  const text = str(args.text ?? args.content ?? args.body)
  const mood = args.mood == null || args.mood === "" ? null : num(args.mood)
  if (!text) throw new ActError("journal.add needs text.")
  if (text.length > JOURNAL_CONTENT_MAX) {
    throw new ActError(`text must be ${JOURNAL_CONTENT_MAX} characters or fewer.`)
  }
  if (mood != null && (!Number.isInteger(mood) || mood < 1 || mood > 5)) {
    throw new ActError("mood must be an integer 1–5.")
  }
  const entry = await prisma.journalEntry.create({
    data: {
      date: parseYyyyMmDdToStoredDate(date),
      content: text,
      mood,
      userId: context.user.id,
    },
    select: { id: true },
  })
  return { id: entry.id, date }
}

async function journalUpdate(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const id = str(args.id)
  if (!id) throw new ActError("id is required.")
  const existing = await prisma.journalEntry.findFirst({ where: { id, userId: context.user.id } })
  if (!existing) throw new ActError("Journal entry not found.", 404)
  const text = args.text != null || args.content != null ? str(args.text ?? args.content) : null
  let mood: number | undefined
  if (args.mood != null && args.mood !== "") {
    const parsed = num(args.mood)
    if (parsed == null || !Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
      throw new ActError("mood must be an integer 1–5.")
    }
    mood = parsed
  }
  if (text != null && (text.length === 0 || text.length > JOURNAL_CONTENT_MAX)) {
    throw new ActError(`text must be 1–${JOURNAL_CONTENT_MAX} characters.`)
  }
  const entry = await prisma.journalEntry.update({
    where: { id },
    data: {
      ...(text != null ? { content: text } : {}),
      ...(mood !== undefined ? { mood } : {}),
      ...(args.date != null ? { date: parseYyyyMmDdToStoredDate(dayOf(args, context)) } : {}),
    },
    select: { id: true, content: true, mood: true },
  })
  return { id: entry.id, mood: entry.mood, text: entry.content }
}

async function findHabit(userId: string, args: Record<string, unknown>) {
  const id = str(args.id)
  if (id) {
    const habit = await prisma.habit.findFirst({ where: { id, userId } })
    if (!habit) throw new ActError("Habit not found.", 404)
    return habit
  }
  const name = str(args.name).toLowerCase()
  if (!name) throw new ActError("Pass id or name.")
  const habits = await prisma.habit.findMany({ where: { userId, archived: false } })
  const matches = habits.filter((habit) => habit.name.trim().toLowerCase() === name)
  if (matches.length === 1) return matches[0]!
  if (matches.length === 0) throw new ActError(`No habit named "${str(args.name)}".`, 404)
  throw new ActError(`More than one habit named "${str(args.name)}". Pass id.`)
}

async function habitsList(_args: Record<string, unknown>, ctx: ActContext | null) {
  const { user } = userOf(ctx)
  const habits = await prisma.habit.findMany({
    where: { userId: user.id, archived: false },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  })
  return { items: habits }
}

async function habitsAdd(args: Record<string, unknown>, ctx: ActContext | null) {
  const { user } = userOf(ctx)
  const name = str(args.name)
  if (!name || name.length > 80) throw new ActError("habits.add needs a name.")
  const existing = await prisma.habit.findMany({ where: { userId: user.id } })
  const match = existing.find((habit) => habit.name.trim().toLowerCase() === name.toLowerCase())
  if (match && !match.archived) return { id: match.id, name: match.name, existed: true }
  if (match?.archived) {
    const habit = await prisma.habit.update({ where: { id: match.id }, data: { archived: false, name } })
    return { id: habit.id, name: habit.name }
  }
  const habit = await prisma.habit.create({ data: { name, userId: user.id } })
  return { id: habit.id, name: habit.name }
}

async function habitsDone(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const habit = await findHabit(context.user.id, args)
  const date = parseYyyyMmDdToStoredDate(dayOf(args, context))
  const off = args.on === false || args.off === true || args.done === false
  const existing = await prisma.habitCompletion.findUnique({
    where: { habitId_date: { habitId: habit.id, date } },
  })
  if (off) {
    if (existing) await prisma.habitCompletion.delete({ where: { id: existing.id } })
    return { id: habit.id, name: habit.name, done: false }
  }
  if (!existing) {
    await prisma.habitCompletion.create({ data: { habitId: habit.id, date } })
  }
  return { id: habit.id, name: habit.name, done: true }
}

async function recoverySet(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  const date = dayOf(args, context)
  const keys = [
    ["pain", "pain"],
    ["energy", "energy"],
    ["mood", "mood"],
    ["soreness", "soreness"],
    ["stress", "stress"],
    ["mobility", "mobility"],
    ["sleep", "sleepFeel"],
  ] as const
  const patch: Record<string, number | string | null> = {}
  for (const [input, column] of keys) {
    if (args[input] == null) continue
    const value = num(args[input])
    if (value == null || !Number.isInteger(value) || value < 1 || value > 10) {
      throw new ActError(`${input} must be an integer 1–10.`)
    }
    patch[column] = value
  }
  if (args.notes != null) patch.notes = notesOf(args.notes)
  if (Object.keys(patch).length === 0) throw new ActError("recovery.set needs at least one score.")
  const stored = parseYyyyMmDdToStoredDate(date)
  const existing = await prisma.recoveryDailyEntry.findFirst({
    where: { userId: context.user.id, date: stored },
  })
  const entry = existing
    ? await prisma.recoveryDailyEntry.update({ where: { id: existing.id }, data: patch })
    : await prisma.recoveryDailyEntry.create({
        data: {
          date: stored,
          userId: context.user.id,
          pain: 5, energy: 5, mood: 5, soreness: 5, stress: 5, mobility: 5, sleepFeel: 5,
          ...patch,
        },
      })
  return {
    date,
    pain: entry.pain,
    energy: entry.energy,
    mood: entry.mood,
    soreness: entry.soreness,
    stress: entry.stress,
    mobility: entry.mobility,
    sleep: entry.sleepFeel,
  }
}

async function peptideAdd(args: Record<string, unknown>, ctx: ActContext | null) {
  const context = userOf(ctx)
  await requireProtocolEnabled(context.user.id)
  const date = dayOf(args, context)
  const doseMg = num(args.doseMg ?? args.mg ?? args.dose)
  const site = str(args.site ?? args.injectionSite).toLowerCase()
  if (doseMg == null || doseMg <= 0 || doseMg > 100) throw new ActError("doseMg must be a positive number.")
  if (!INJECTION_SITE_IDS.has(site)) throw new ActError("site must be abd, leg, or glute.")
  const sideEffects = normalizeSideEffects(args.sideEffects)
  if (Array.isArray(args.sideEffects) && sideEffects.length !== args.sideEffects.length) {
    throw new ActError("sideEffects has an unknown id. Use nausea, vomiting, diarrhea, constipation, fatigue, injection_site_reaction, reduced_appetite, reflux, headache, or dizziness.")
  }
  const injectedAt = args.time != null
    ? clockOn(args.time, date, context.user.timeZone ?? "America/New_York")
    : context.now
  const entry = await prisma.peptideEntry.create({
    data: {
      date: parseYyyyMmDdToStoredDate(date),
      injectedAt,
      compound: str(args.compound) || "retatrutide",
      doseMg,
      injectionSite: site,
      sideEffectsJson: JSON.stringify(sideEffects),
      notes: notesOf(args.notes),
      userId: context.user.id,
    },
    select: { id: true },
  })
  return { id: entry.id, date, mg: doseMg, site }
}

export const dailyHandlers: Record<string, ActFn> = {
  day: readDay,
  "water.add": waterAdd,
  "water.del": async (args, ctx) => {
    const { user } = userOf(ctx)
    const ids = requireIds(args)
    return dropOwned(user.id, ids, (idList) => prisma.waterEntry.deleteMany({ where: { id: { in: idList }, userId: user.id } }), "Water entry")
  },
  "weight.set": weightSet,
  "weight.del": weightDel,
  "steps.set": stepsSet,
  "steps.del": async (args, ctx) => {
    const { user } = userOf(ctx)
    const ids = requireIds(args)
    return dropOwned(user.id, ids, (idList) => prisma.stepEntry.deleteMany({ where: { id: { in: idList }, userId: user.id } }), "Steps entry")
  },
  "sleep.set": sleepSet,
  "sleep.del": async (args, ctx) => {
    const { user } = userOf(ctx)
    const ids = requireIds(args)
    return dropOwned(user.id, ids, (idList) => prisma.sleepEntry.deleteMany({ where: { id: { in: idList }, userId: user.id } }), "Sleep entry")
  },
  "run.add": runAdd,
  "run.move": runMove,
  "run.del": async (args, ctx) => {
    const { user } = userOf(ctx)
    const ids = requireIds(args)
    return dropOwned(user.id, ids, (idList) => prisma.runEntry.deleteMany({ where: { id: { in: idList }, userId: user.id } }), "Run")
  },
  "cardio.add": cardioAdd,
  "cardio.del": cardioDel,
  "alcohol.add": alcoholAdd,
  "alcohol.del": async (args, ctx) => {
    const { user } = userOf(ctx)
    const ids = requireIds(args)
    return dropOwned(user.id, ids, (idList) => prisma.alcoholEntry.deleteMany({ where: { id: { in: idList }, userId: user.id } }), "Drink")
  },
  "bowel.add": bowelAdd,
  "bowel.del": async (args, ctx) => {
    const { user } = userOf(ctx)
    const ids = requireIds(args)
    return dropOwned(user.id, ids, (idList) => prisma.bowelEntry.deleteMany({ where: { id: { in: idList }, userId: user.id } }), "Bowel entry")
  },
  "journal.add": journalAdd,
  "journal.update": journalUpdate,
  "journal.del": async (args, ctx) => {
    const { user } = userOf(ctx)
    const ids = requireIds(args)
    return dropOwned(user.id, ids, (idList) => prisma.journalEntry.deleteMany({ where: { id: { in: idList }, userId: user.id } }), "Journal entry")
  },
  "habits.list": habitsList,
  "habits.add": habitsAdd,
  "habits.done": habitsDone,
  "habits.del": async (args, ctx) => {
    const { user } = userOf(ctx)
    const ids = requireIds(args)
    return dropOwned(user.id, ids, (idList) => prisma.habit.deleteMany({ where: { id: { in: idList }, userId: user.id } }), "Habit")
  },
  "recovery.set": recoverySet,
  "peptide.add": peptideAdd,
  "peptide.del": async (args, ctx) => {
    const { user } = userOf(ctx)
    await requireProtocolEnabled(user.id)
    const ids = requireIds(args)
    return dropOwned(user.id, ids, (idList) => prisma.peptideEntry.deleteMany({ where: { id: { in: idList }, userId: user.id } }), "Injection")
  },
}
