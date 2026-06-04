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

const DEFAULT_AGENT_PROFILE = "carlos"

/** Resolves the agent export profile (default Carlos; override with AGENT_PROFILE_NAME). */
export async function resolveCarlosUserId(): Promise<{
  id: string
  name: string
}> {
  const target = (
    process.env.AGENT_PROFILE_NAME?.trim() || DEFAULT_AGENT_PROFILE
  ).toLowerCase()

  const users = await prisma.user.findMany({
    where: { name: { not: "" } },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  })
  const match = users.find((u) => u.name.trim().toLowerCase() === target)
  if (!match) {
    throw new AgentAccessError(
      `Profile "${target}" not found. Create that profile in the app or set AGENT_PROFILE_NAME.`,
      404
    )
  }
  return match
}
