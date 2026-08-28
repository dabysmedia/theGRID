import "server-only"

import { prisma } from "@/lib/prisma"
import { buildUserContext } from "@/lib/coach/context"
import {
  buildAgentPeriodRollups,
  buildAgentRangeRollup,
  type AgentPeriodRollups,
  type AgentRangeRollup,
  type AgentRawData,
} from "@/lib/agent/period-rollups"
import { shouldIncludeHeartRateSamples, type AgentRange } from "@/lib/agent/ranges"
import { resolveAgentTimezone } from "@/lib/agent/timezone"
import { toAgentJson } from "@/lib/agent/serialize"

export interface AgentProfileExport {
  exportedAt: string
  profile: {
    id: string
    name: string
    avatarColor: string
    avatarUrl: string | null
    vacationResumeDate: string | null
    timeZone: string | null
    protocolEnabled: boolean
    createdAt: string
    updatedAt: string
  }
  /** Recent-state narrative (same snapshot the in-app AI coach uses). */
  contextSummary: string
  /** TODAY / THIS WEEK / THIS MONTH totals, entries, and narrative. */
  periods: AgentPeriodRollups
  counts: Record<string, number>
  data: Record<string, unknown>
}

/** Window of raw heart-rate buckets carried by the full profile export. */
const DEFAULT_HR_SAMPLE_DAYS = 8

/** Day-key bounds for the raw heart-rate query, or null to skip it entirely. */
type HrSampleWindow = { fromDay: string; toDay: string } | null

/** Day keys are stored UTC-noon (see dateStorage.ts), so bound on that instant. */
function dayKeyToStoredDate(dayKey: string): Date {
  return new Date(`${dayKey}T12:00:00.000Z`)
}

function lastNDaysWindow(days: number): HrSampleWindow {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  const from = new Date(now.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10)
  return { fromDay: from, toDay: to }
}

/** One DB round-trip for every tracked model, shared by both export shapes. */
async function loadAgentProfileData(userId: string, hrSampleWindow: HrSampleWindow) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      avatarColor: true,
      avatarUrl: true,
      vacationResumeDate: true,
      timeZone: true,
      protocolEnabled: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  if (!user) throw new Error("User not found")

  const [
    calorieEntries,
    stepEntries,
    runEntries,
    workoutEntries,
    workoutTemplates,
    workoutSessions,
    sleepEntries,
    peptideEntries,
    peptideDailyEntries,
    goals,
    longGoals,
    habits,
    savedMeals,
    alcoholEntries,
    bowelEntries,
    journalEntries,
    recoveryDailyEntries,
    injuryRecords,
    treatmentLogs,
    fastingProfile,
    coachConversations,
    cardioEntries,
    vitalEntries,
    heartRateSamples,
    waterEntries,
    recipes,
  ] = await Promise.all([
    prisma.calorieEntry.findMany({
      where: { userId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    prisma.stepEntry.findMany({ where: { userId }, orderBy: { date: "desc" } }),
    prisma.runEntry.findMany({ where: { userId }, orderBy: { date: "desc" } }),
    prisma.workoutEntry.findMany({ where: { userId }, orderBy: { date: "desc" } }),
    prisma.workoutTemplate.findMany({
      where: { userId },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.workoutSession.findMany({
      where: { userId },
      orderBy: { date: "desc" },
    }),
    prisma.sleepEntry.findMany({ where: { userId }, orderBy: { date: "desc" } }),
    user.protocolEnabled
      ? prisma.peptideEntry.findMany({
          where: { userId },
          orderBy: { injectedAt: "desc" },
        })
      : Promise.resolve([]),
    user.protocolEnabled
      ? prisma.peptideDailyEntry.findMany({
          where: { userId },
          orderBy: { date: "desc" },
        })
      : Promise.resolve([]),
    prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.longGoal.findMany({
      where: { userId },
      include: { entries: { orderBy: { date: "desc" } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.habit.findMany({
      where: { userId },
      include: { completions: { orderBy: { date: "desc" } } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.savedMeal.findMany({
      where: { userId },
      orderBy: { useCount: "desc" },
    }),
    prisma.alcoholEntry.findMany({ where: { userId }, orderBy: { date: "desc" } }),
    prisma.bowelEntry.findMany({ where: { userId }, orderBy: { date: "desc" } }),
    prisma.journalEntry.findMany({ where: { userId }, orderBy: { date: "desc" } }),
    prisma.recoveryDailyEntry.findMany({
      where: { userId },
      orderBy: { date: "desc" },
    }),
    prisma.injuryRecord.findMany({
      where: { userId },
      orderBy: { onsetDate: "desc" },
    }),
    prisma.treatmentLog.findMany({
      where: { userId },
      orderBy: { date: "desc" },
    }),
    prisma.fastingProfile.findUnique({ where: { userId } }),
    prisma.coachConversation.findMany({
      where: { userId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.cardioEntry.findMany({
      where: { userId, deletedAt: null },
      orderBy: { date: "desc" },
    }),
    prisma.vitalDailyEntry.findMany({ where: { userId }, orderBy: { date: "desc" } }),
    // ~288 rows/day — bounded so "all time" exports stay a sane size. Daily
    // min/avg/max for older days still comes through VitalDailyEntry.
    hrSampleWindow
      ? prisma.heartRateSample.findMany({
          where: {
            userId,
            date: {
              gte: dayKeyToStoredDate(hrSampleWindow.fromDay),
              lte: dayKeyToStoredDate(hrSampleWindow.toDay),
            },
          },
          orderBy: { time: "asc" },
        })
      : Promise.resolve([]),
    prisma.waterEntry.findMany({ where: { userId }, orderBy: { date: "desc" } }),
    prisma.recipe.findMany({
      where: { userId },
      include: { ingredients: { orderBy: { sortOrder: "asc" } } },
      orderBy: { useCount: "desc" },
    }),
  ])

  const agentTz = resolveAgentTimezone(user.timeZone)

  const raw: AgentRawData = {
    calorieEntries,
    stepEntries,
    runEntries,
    workoutEntries,
    workoutSessions,
    workoutTemplates,
    savedMeals,
    sleepEntries,
    peptideEntries,
    peptideDailyEntries,
    alcoholEntries,
    bowelEntries,
    journalEntries,
    recoveryDailyEntries,
    treatmentLogs,
    habits,
    longGoals,
    goals,
    injuryRecords,
    fastingProfile,
    cardioEntries,
    vitalEntries,
    heartRateSamples,
    waterEntries,
    recipes,
    coachConversations: coachConversations.map((c) => ({
      title: c.title,
      updatedAt: c.updatedAt,
      messages: c.messages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    })),
  }

  const data = {
    calorieEntries,
    stepEntries,
    runEntries,
    workoutEntries,
    workoutTemplates,
    workoutSessions,
    sleepEntries,
    peptideEntries,
    peptideDailyEntries,
    goals,
    longGoals,
    habits,
    savedMeals,
    alcoholEntries,
    bowelEntries,
    journalEntries,
    recoveryDailyEntries,
    injuryRecords,
    treatmentLogs,
    fastingProfile,
    cardioEntries,
    vitalDailyEntries: vitalEntries,
    heartRateSamples,
    waterEntries,
    recipes,
    coachConversations,
  }

  const counts: Record<string, number> = {}
  for (const [key, rows] of Object.entries(data)) {
    if (rows == null) {
      counts[key] = 0
    } else if (Array.isArray(rows)) {
      counts[key] = rows.length
    } else {
      counts[key] = 1
    }
  }

  return { user, agentTz, raw, data, counts }
}

export async function exportProfileForAgent(userId: string): Promise<AgentProfileExport> {
  const { user, agentTz, raw, data, counts } = await loadAgentProfileData(
    userId,
    lastNDaysWindow(DEFAULT_HR_SAMPLE_DAYS)
  )

  const { text: contextSummary } = await buildUserContext({
    userId,
    clientTimeZone: agentTz,
  })

  const periods = buildAgentPeriodRollups(raw, user.timeZone)

  return {
    exportedAt: new Date().toISOString(),
    profile: toAgentJson(user),
    contextSummary,
    periods: toAgentJson(periods),
    counts,
    data: toAgentJson(data),
  }
}

export interface AgentRangeExport {
  exportedAt: string
  profile: AgentProfileExport["profile"]
  /** Recent-state narrative (same snapshot the in-app AI coach uses). */
  contextSummary: string
  rollup: AgentRangeRollup
  /** All-time record counts, so an agent can tell what exists outside this window. */
  counts: Record<string, number>
  /** True when raw heart-rate buckets were omitted because the window is long. */
  heartRateSamplesOmitted: boolean
}

/**
 * Snapshot for one arbitrary crawlable window. Raw heart-rate buckets are only
 * loaded for short windows; everything else is complete for the range.
 */
export async function exportRangeForAgent(
  userId: string,
  range: AgentRange
): Promise<AgentRangeExport> {
  const includeHrSamples = shouldIncludeHeartRateSamples(range)
  const { user, agentTz, raw, counts } = await loadAgentProfileData(
    userId,
    // Bound by the requested window, not "recent days", so an explicit past
    // span still returns its own heart-rate buckets.
    includeHrSamples ? { fromDay: range.from, toDay: range.to } : null
  )

  const { text: contextSummary } = await buildUserContext({
    userId,
    clientTimeZone: agentTz,
  })

  return {
    exportedAt: new Date().toISOString(),
    profile: toAgentJson(user),
    contextSummary,
    rollup: buildAgentRangeRollup(raw, user.timeZone, range),
    counts,
    heartRateSamplesOmitted: !includeHrSamples,
  }
}
