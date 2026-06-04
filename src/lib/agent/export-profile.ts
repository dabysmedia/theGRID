import "server-only"

import { prisma } from "@/lib/prisma"
import { buildUserContext } from "@/lib/coach/context"
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
    createdAt: string
    updatedAt: string
  }
  /** Recent-state narrative (same snapshot the in-app AI coach uses). */
  contextSummary: string
  counts: Record<string, number>
  data: Record<string, unknown>
}

export async function exportProfileForAgent(userId: string): Promise<AgentProfileExport> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      avatarColor: true,
      avatarUrl: true,
      vacationResumeDate: true,
      timeZone: true,
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
    prisma.peptideEntry.findMany({
      where: { userId },
      orderBy: { injectedAt: "desc" },
    }),
    prisma.peptideDailyEntry.findMany({
      where: { userId },
      orderBy: { date: "desc" },
    }),
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
  ])

  const { text: contextSummary } = await buildUserContext({
    userId,
    clientTimeZone: user.timeZone,
  })

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

  return {
    exportedAt: new Date().toISOString(),
    profile: toAgentJson(user),
    contextSummary,
    counts,
    data: toAgentJson(data),
  }
}
