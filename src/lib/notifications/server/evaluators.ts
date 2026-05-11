import "server-only"

import { prisma } from "@/lib/prisma"
import {
  NOTIFICATION_BY_KEY,
  parseTimeOfDay,
  type NotificationKey,
} from "../catalog"
import { utcRangeWhereForCalendarDay } from "@/lib/dateStorage"
import { localTimeParts } from "./local-time"
import type { PushPayload } from "./send"

/** Tolerance window so the every-5-min cron can match HH:mm reminders even
 *  if it runs a couple minutes late. Anything ±MATCH_WINDOW_MIN of the target. */
const MATCH_WINDOW_MIN = 10

export interface EvalContext {
  userId: string
  now: Date
  timeZone: string
  /** Cached local time parts to avoid recomputation per evaluator */
  local: ReturnType<typeof localTimeParts>
}

export interface EvalResult {
  /** Whether to send right now */
  shouldSend: boolean
  /** Payload to send (only required if shouldSend=true) */
  payload?: PushPayload
  /** Whether to record a NotificationLog row even on skip (e.g. avoid double-firing) */
  recordOnSkip?: boolean
}

export function buildEvalContext(
  userId: string,
  now: Date,
  timeZone: string
): EvalContext {
  return { userId, now, timeZone, local: localTimeParts(now, timeZone) }
}

/* ─── Time matching helpers ─────────────────────────────────────────────── */

function matchesScheduledTime(timeOfDay: string | null, local: EvalContext["local"]): boolean {
  const target = parseTimeOfDay(timeOfDay)
  if (target == null) return false
  const diff = local.minutesFromMidnight - target
  return diff >= 0 && diff < MATCH_WINDOW_MIN
}

/** A notification "is past" its scheduled time so we shouldn't try later in the day. */
function isPastScheduledTime(timeOfDay: string | null, local: EvalContext["local"]): boolean {
  const target = parseTimeOfDay(timeOfDay)
  if (target == null) return false
  return local.minutesFromMidnight >= target + MATCH_WINDOW_MIN
}

/* ─── Data lookups ──────────────────────────────────────────────────────── */

async function calorieEntriesToday(userId: string, dayKey: string) {
  return prisma.calorieEntry.findMany({
    where: { userId, date: utcRangeWhereForCalendarDay(dayKey) },
    select: { mealType: true },
  })
}

async function hasMealLogged(userId: string, dayKey: string, mealType: "breakfast" | "lunch" | "dinner"): Promise<boolean> {
  const rows = await calorieEntriesToday(userId, dayKey)
  return rows.some((r) => r.mealType.toLowerCase() === mealType)
}

async function hasWeightToday(userId: string, dayKey: string): Promise<boolean> {
  const goal = await prisma.longGoal.findFirst({
    where: { userId, category: "bodyweight" },
    select: { id: true },
  })
  if (!goal) return false
  const entry = await prisma.longGoalEntry.findFirst({
    where: { goalId: goal.id, date: utcRangeWhereForCalendarDay(dayKey) },
    select: { id: true },
  })
  return entry != null
}

async function hasSleepLoggedToday(userId: string, dayKey: string): Promise<boolean> {
  const entry = await prisma.sleepEntry.findFirst({
    where: { userId, date: utcRangeWhereForCalendarDay(dayKey) },
    select: { id: true },
  })
  return entry != null
}

async function hasJournalToday(userId: string, dayKey: string): Promise<boolean> {
  const entry = await prisma.journalEntry.findFirst({
    where: { userId, date: utcRangeWhereForCalendarDay(dayKey) },
    select: { id: true },
  })
  return entry != null
}

async function hasRecoveryToday(userId: string, dayKey: string): Promise<boolean> {
  const entry = await prisma.recoveryDailyEntry.findFirst({
    where: { userId, date: utcRangeWhereForCalendarDay(dayKey) },
    select: { id: true },
  })
  return entry != null
}

async function stepsToday(userId: string, dayKey: string): Promise<number> {
  const rows = await prisma.stepEntry.findMany({
    where: { userId, date: utcRangeWhereForCalendarDay(dayKey) },
    select: { count: true },
  })
  return rows.reduce((sum, r) => sum + (r.count ?? 0), 0)
}

async function dailyStepGoal(userId: string): Promise<number | null> {
  const goal = await prisma.goal.findFirst({
    where: { userId, category: "steps", active: true, goalType: "daily" },
    select: { target: true },
  })
  return goal ? Math.round(goal.target) : null
}

async function activeHabitsRemaining(userId: string, dayKey: string): Promise<number> {
  const habits = await prisma.habit.findMany({
    where: { userId, archived: false },
    select: { id: true },
  })
  if (habits.length === 0) return 0
  const completions = await prisma.habitCompletion.findMany({
    where: {
      habitId: { in: habits.map((h) => h.id) },
      date: utcRangeWhereForCalendarDay(dayKey),
    },
    select: { habitId: true },
  })
  const done = new Set(completions.map((c) => c.habitId))
  return habits.filter((h) => !done.has(h.id)).length
}

async function lastWorkoutDate(userId: string): Promise<Date | null> {
  const session = await prisma.workoutSession.findFirst({
    where: { userId, status: "completed" },
    orderBy: { date: "desc" },
    select: { date: true },
  })
  if (session) return session.date
  const legacy = await prisma.workoutEntry.findFirst({
    where: { userId },
    orderBy: { date: "desc" },
    select: { date: true },
  })
  return legacy?.date ?? null
}

/* ─── Evaluators ────────────────────────────────────────────────────────── */

export interface EvaluatorInput {
  ctx: EvalContext
  timeOfDay: string | null
}

type Evaluator = (input: EvaluatorInput) => Promise<EvalResult>

const evaluators: Record<NotificationKey, Evaluator> = {
  log_breakfast: async ({ ctx, timeOfDay }) => {
    if (!matchesScheduledTime(timeOfDay, ctx.local)) return { shouldSend: false }
    if (await hasMealLogged(ctx.userId, ctx.local.dayKey, "breakfast")) {
      return { shouldSend: false, recordOnSkip: true }
    }
    return {
      shouldSend: true,
      payload: {
        title: "Log breakfast",
        body: "Track your first meal of the day to stay on target.",
        url: "/calories?log=1",
        type: "log_breakfast",
        tag: "log_breakfast",
      },
    }
  },

  log_lunch: async ({ ctx, timeOfDay }) => {
    if (!matchesScheduledTime(timeOfDay, ctx.local)) return { shouldSend: false }
    if (await hasMealLogged(ctx.userId, ctx.local.dayKey, "lunch")) {
      return { shouldSend: false, recordOnSkip: true }
    }
    return {
      shouldSend: true,
      payload: {
        title: "Time to log lunch",
        body: "Tap to log what you ate while it's fresh.",
        url: "/calories?log=1",
        type: "log_lunch",
        tag: "log_lunch",
      },
    }
  },

  log_dinner: async ({ ctx, timeOfDay }) => {
    if (!matchesScheduledTime(timeOfDay, ctx.local)) return { shouldSend: false }
    if (await hasMealLogged(ctx.userId, ctx.local.dayKey, "dinner")) {
      return { shouldSend: false, recordOnSkip: true }
    }
    return {
      shouldSend: true,
      payload: {
        title: "Log dinner",
        body: "Close out today's calorie log.",
        url: "/calories?log=1",
        type: "log_dinner",
        tag: "log_dinner",
      },
    }
  },

  log_weight: async ({ ctx, timeOfDay }) => {
    if (!matchesScheduledTime(timeOfDay, ctx.local)) return { shouldSend: false }
    if (await hasWeightToday(ctx.userId, ctx.local.dayKey)) {
      return { shouldSend: false, recordOnSkip: true }
    }
    return {
      shouldSend: true,
      payload: {
        title: "Morning weigh-in",
        body: "Step on the scale and log today's weight.",
        url: "/weight",
        type: "log_weight",
        tag: "log_weight",
      },
    }
  },

  log_sleep: async ({ ctx, timeOfDay }) => {
    if (!matchesScheduledTime(timeOfDay, ctx.local)) return { shouldSend: false }
    if (await hasSleepLoggedToday(ctx.userId, ctx.local.dayKey)) {
      return { shouldSend: false, recordOnSkip: true }
    }
    return {
      shouldSend: true,
      payload: {
        title: "How did you sleep?",
        body: "Log last night's bedtime, wake time, and quality.",
        url: "/sleep",
        type: "log_sleep",
        tag: "log_sleep",
      },
    }
  },

  bedtime: async ({ ctx, timeOfDay }) => {
    if (!matchesScheduledTime(timeOfDay, ctx.local)) return { shouldSend: false }
    return {
      shouldSend: true,
      payload: {
        title: "Bedtime",
        body: "Wind down — screens off, lights low.",
        url: "/sleep",
        type: "bedtime",
        tag: "bedtime",
      },
    }
  },

  journal: async ({ ctx, timeOfDay }) => {
    if (!matchesScheduledTime(timeOfDay, ctx.local)) return { shouldSend: false }
    if (await hasJournalToday(ctx.userId, ctx.local.dayKey)) {
      return { shouldSend: false, recordOnSkip: true }
    }
    return {
      shouldSend: true,
      payload: {
        title: "Daily journal",
        body: "Capture today's win, mood, or note in 30 seconds.",
        url: "/journal",
        type: "journal",
        tag: "journal",
      },
    }
  },

  steps_check_in: async ({ ctx, timeOfDay }) => {
    if (!matchesScheduledTime(timeOfDay, ctx.local)) return { shouldSend: false }
    const goal = await dailyStepGoal(ctx.userId)
    const count = await stepsToday(ctx.userId, ctx.local.dayKey)
    if (!goal || count >= goal) {
      return { shouldSend: false, recordOnSkip: true }
    }
    const remaining = Math.max(0, goal - count)
    return {
      shouldSend: true,
      payload: {
        title: "Step check-in",
        body: `${count.toLocaleString()} / ${goal.toLocaleString()} — ${remaining.toLocaleString()} to go.`,
        url: "/steps",
        type: "steps_check_in",
        tag: "steps_check_in",
      },
    }
  },

  recovery_check_in: async ({ ctx, timeOfDay }) => {
    if (!matchesScheduledTime(timeOfDay, ctx.local)) return { shouldSend: false }
    if (await hasRecoveryToday(ctx.userId, ctx.local.dayKey)) {
      return { shouldSend: false, recordOnSkip: true }
    }
    return {
      shouldSend: true,
      payload: {
        title: "Recovery check-in",
        body: "Rate pain, energy, sleep, and soreness for today.",
        url: "/recovery",
        type: "recovery_check_in",
        tag: "recovery_check_in",
      },
    }
  },

  habits_remaining: async ({ ctx, timeOfDay }) => {
    if (!matchesScheduledTime(timeOfDay, ctx.local)) return { shouldSend: false }
    const remaining = await activeHabitsRemaining(ctx.userId, ctx.local.dayKey)
    if (remaining === 0) return { shouldSend: false, recordOnSkip: true }
    return {
      shouldSend: true,
      payload: {
        title: `${remaining} habit${remaining === 1 ? "" : "s"} left today`,
        body: "Open habits to tick them off before bed.",
        url: "/habits",
        type: "habits_remaining",
        tag: "habits_remaining",
      },
    }
  },

  weekly_summary: async ({ ctx, timeOfDay }) => {
    if (ctx.local.weekday !== 0) return { shouldSend: false }
    if (!matchesScheduledTime(timeOfDay, ctx.local)) return { shouldSend: false }
    return {
      shouldSend: true,
      payload: {
        title: "Weekly recap is ready",
        body: "See your week of calories, workouts, sleep, and more.",
        url: "/stats",
        type: "weekly_summary",
        tag: "weekly_summary",
      },
    }
  },

  fasting_window_complete: async ({ ctx }) => {
    const profile = await prisma.fastingProfile.findUnique({
      where: { userId: ctx.userId },
    })
    if (!profile) return { shouldSend: false }
    const transition = nextFastingTransitionMs(profile, ctx.now)
    if (!transition || transition.kind !== "fasting_complete") {
      return { shouldSend: false }
    }
    const ageMin = (ctx.now.getTime() - transition.ms) / 60000
    if (ageMin < 0 || ageMin > MATCH_WINDOW_MIN) {
      return { shouldSend: false }
    }
    return {
      shouldSend: true,
      payload: {
        title: "Fasting window complete",
        body: "Your fast is done — you can eat now.",
        url: "/fasting",
        type: "fasting_window_complete",
        tag: "fasting_window_complete",
      },
    }
  },

  eating_window_closing: async ({ ctx }) => {
    const profile = await prisma.fastingProfile.findUnique({
      where: { userId: ctx.userId },
    })
    if (!profile) return { shouldSend: false }
    const transition = nextFastingTransitionMs(profile, ctx.now)
    if (!transition || transition.kind !== "fast_begins") {
      return { shouldSend: false }
    }
    const minsUntil = (transition.ms - ctx.now.getTime()) / 60000
    // Fire when we're between 25 and 35 minutes before the eating window closes
    if (minsUntil < 25 || minsUntil > 35) {
      return { shouldSend: false }
    }
    return {
      shouldSend: true,
      payload: {
        title: "Eating window closing soon",
        body: "Roughly 30 minutes until your fast resumes.",
        url: "/fasting",
        type: "eating_window_closing",
        tag: "eating_window_closing",
      },
    }
  },

  workout_streak_at_risk: async ({ ctx }) => {
    // Evening ping only, regardless of preference time
    if (ctx.local.hour !== 19) return { shouldSend: false }
    if (ctx.local.minute >= MATCH_WINDOW_MIN) return { shouldSend: false }
    const last = await lastWorkoutDate(ctx.userId)
    if (!last) return { shouldSend: false }
    const days = Math.floor((ctx.now.getTime() - last.getTime()) / (24 * 3600_000))
    if (days < 2) return { shouldSend: false }
    return {
      shouldSend: true,
      payload: {
        title: "Workout streak at risk",
        body: `It's been ${days} days since your last workout. 20 minutes is enough.`,
        url: "/workouts",
        type: "workout_streak_at_risk",
        tag: "workout_streak_at_risk",
      },
    }
  },
}

/** Returns true if a once-per-day type has already been settled (sent or skipped) today. */
export async function alreadyHandledToday(
  userId: string,
  type: NotificationKey,
  dayKey: string
): Promise<boolean> {
  const def = NOTIFICATION_BY_KEY[type]
  // Event-based notifications may legitimately re-fire across days but never twice in a day.
  if (def.kind === "schedule" || def.kind === "event") {
    const row = await prisma.notificationLog.findUnique({
      where: { userId_type_fireDay: { userId, type, fireDay: dayKey } },
      select: { id: true },
    })
    return row != null
  }
  return false
}

export async function recordNotificationLog(
  userId: string,
  type: NotificationKey,
  dayKey: string,
  successCount: number,
  failureCount: number
): Promise<void> {
  await prisma.notificationLog.upsert({
    where: { userId_type_fireDay: { userId, type, fireDay: dayKey } },
    create: { userId, type, fireDay: dayKey, successCount, failureCount },
    update: { successCount, failureCount },
  })
}

export async function evaluate(
  type: NotificationKey,
  input: EvaluatorInput
): Promise<EvalResult> {
  const evalFn = evaluators[type]
  if (!evalFn) return { shouldSend: false }
  // Schedule-kind notifications shouldn't fire later in the day if their window has passed,
  // unless they've already been logged today (handled by caller).
  const def = NOTIFICATION_BY_KEY[type]
  if (
    def.kind === "schedule" &&
    input.timeOfDay &&
    isPastScheduledTime(input.timeOfDay, input.ctx.local) &&
    !matchesScheduledTime(input.timeOfDay, input.ctx.local)
  ) {
    return { shouldSend: false }
  }
  try {
    return await evalFn(input)
  } catch (err) {
    console.error(`[notifications] evaluator '${type}' failed`, err)
    return { shouldSend: false }
  }
}

/* ─── Fasting transition math ───────────────────────────────────────────── */

interface FastingProfileRow {
  fastHours: number
  eatHours: number
  lastMealAtMs: bigint | null
  mode: string
  eatWindowStartMinutes: number
}

interface FastingTransition {
  /** What just happened (or is about to) */
  kind: "fasting_complete" | "fast_begins"
  /** Wall-clock ms of the transition */
  ms: number
}

/**
 * Returns the most recent transition (within the last cycle) or the next upcoming one,
 * whichever lies inside the cron's match window. Anchored mode uses `lastMealAtMs`.
 */
function nextFastingTransitionMs(
  profile: FastingProfileRow,
  now: Date
): FastingTransition | null {
  const anchorMs = profile.lastMealAtMs ? Number(profile.lastMealAtMs) : null
  const fastMs = profile.fastHours * 3600_000
  const eatMs = profile.eatHours * 3600_000
  const cycle = fastMs + eatMs

  if (profile.mode === "anchored" && anchorMs) {
    if (cycle <= 0) return null
    let t = now.getTime() - anchorMs
    if (t < 0) t = 0
    const cycleIndex = Math.floor(t / cycle)
    const inCycle = t - cycleIndex * cycle
    const cycleBaseMs = anchorMs + cycleIndex * cycle
    if (inCycle < fastMs) {
      // currently fasting → next transition = fasting complete
      return { kind: "fasting_complete", ms: cycleBaseMs + fastMs }
    }
    return { kind: "fast_begins", ms: cycleBaseMs + fastMs + eatMs }
  }

  // clock mode — eating window opens at `eatWindowStartMinutes` each local day.
  // We approximate using UTC math (good enough for ±10 min cron window away from DST).
  const eatStartTodayMs =
    new Date(now).setUTCHours(0, 0, 0, 0) +
    profile.eatWindowStartMinutes * 60_000
  const eatEndTodayMs = eatStartTodayMs + eatMs
  if (now.getTime() < eatStartTodayMs) {
    return { kind: "fasting_complete", ms: eatStartTodayMs }
  }
  if (now.getTime() < eatEndTodayMs) {
    return { kind: "fast_begins", ms: eatEndTodayMs }
  }
  return { kind: "fasting_complete", ms: eatStartTodayMs + 24 * 3600_000 }
}
