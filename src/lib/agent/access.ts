import "server-only"

import { prisma } from "@/lib/prisma"

export class AgentAccessError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "AgentAccessError"
    this.status = status
  }
}

const PROFILE_FALLBACKS = ["los", "carlos"] as const

/** Resolves the agent export profile (AGENT_PROFILE_NAME, then los, then carlos). */
export async function resolveCarlosUserId(): Promise<{
  id: string
  name: string
}> {
  const envName = process.env.AGENT_PROFILE_NAME?.trim().toLowerCase()
  const targets = [
    ...(envName ? [envName] : []),
    ...PROFILE_FALLBACKS,
  ].filter((name, i, arr) => arr.indexOf(name) === i)

  const users = await prisma.user.findMany({
    where: { name: { not: "" } },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  })

  for (const target of targets) {
    const match = users.find((u) => u.name.trim().toLowerCase() === target)
    if (match) return match
  }

  if (users.length === 1) {
    return users[0]!
  }

  throw new AgentAccessError(
    `No agent profile found (tried: ${targets.join(", ")}). Set AGENT_PROFILE_NAME or create a profile.`,
    404
  )
}
