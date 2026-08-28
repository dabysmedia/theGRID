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

/**
 * Whether the crawlable, unauthenticated agent surface is served.
 *
 * On by default: /agents and the /api/agent/* read endpoints exist so LLM
 * crawlers can index the profile without an API key or a browser session.
 * Set AGENT_PUBLIC_EXPORT=0 to take the whole surface private again — the
 * session- and token-authenticated paths keep working either way.
 */
export function isPublicAgentExportEnabled(): boolean {
  const raw = process.env.AGENT_PUBLIC_EXPORT?.trim().toLowerCase()
  return !(raw === "0" || raw === "false" || raw === "off")
}

/**
 * Profile served to unauthenticated crawlers. Prefers the explicitly configured
 * profile, then falls back to the only profile on the instance so a fresh
 * Railway deploy is crawlable with no extra env vars. Never guesses between
 * multiple profiles — that would leak the wrong person's data.
 */
export async function resolvePublicAgentProfile(): Promise<{ id: string; name: string }> {
  if (!isPublicAgentExportEnabled()) {
    throw new AgentAccessError("Public agent export is disabled.", 404)
  }

  const envId = process.env.AGENT_PROFILE_ID?.trim()
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

  const envName = process.env.AGENT_PROFILE_NAME?.trim().toLowerCase()
  if (envName) {
    const matches = users.filter((u) => u.name.trim().toLowerCase() === envName)
    if (matches.length === 1) return matches[0]!
    if (matches.length > 1) {
      throw new AgentAccessError("AGENT_PROFILE_NAME is ambiguous; use AGENT_PROFILE_ID.", 503)
    }
  }

  if (users.length === 1) return users[0]!
  if (users.length === 0) {
    throw new AgentAccessError("No profile exists on this instance.", 404)
  }
  throw new AgentAccessError(
    "Multiple profiles exist; set AGENT_PROFILE_ID to choose which one is public.",
    503
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
