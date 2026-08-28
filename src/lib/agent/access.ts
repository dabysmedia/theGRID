import "server-only"

import { timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"

export class AgentAccessError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "AgentAccessError"
    this.status = status
  }
}

/** Resolves the explicitly configured profile for unattended agent exports. */
export async function resolveCarlosUserId(): Promise<{
  id: string
  name: string
}> {
  const envId = process.env.AGENT_PROFILE_ID?.trim()
  const envName = process.env.AGENT_PROFILE_NAME?.trim().toLowerCase()
  if (!envId && !envName) {
    throw new AgentAccessError(
      "Agent export is not configured. Set AGENT_PROFILE_ID or AGENT_PROFILE_NAME.",
      503,
    )
  }

  if (envId) {
    const user = await prisma.user.findUnique({
      where: { id: envId },
      select: { id: true, name: true },
    })
    if (user) return user
  }

  const users = await prisma.user.findMany({
    where: { name: { not: "" } },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  })

  if (envName) {
    const matches = users.filter((user) => user.name.trim().toLowerCase() === envName)
    if (matches.length === 1) return matches[0]!
    if (matches.length > 1) {
      throw new AgentAccessError("AGENT_PROFILE_NAME is ambiguous; use AGENT_PROFILE_ID.", 503)
    }
  }

  throw new AgentAccessError(
    "The configured agent profile was not found.",
    404
  )
}

export function authorizeAgentRequest(req: Request): void {
  const expected = process.env.AGENT_API_TOKEN?.trim()
  if (!expected || expected.length < 32) {
    throw new AgentAccessError("Agent API access is not configured.", 503)
  }
  const auth = req.headers.get("authorization") ?? ""
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  const left = Buffer.from(supplied)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new AgentAccessError("Unauthorized.", 401)
  }
}
