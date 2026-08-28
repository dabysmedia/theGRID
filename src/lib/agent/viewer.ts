import "server-only"

import type { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { AgentAccessError, resolvePublicAgentProfile } from "@/lib/agent/access"
import { resolveSessionTokenUserId, USER_SESSION_COOKIE } from "@/lib/user-session"

export interface AgentViewer {
  id: string
  name: string
  /** "session" when an authenticated browser is reading, "public" for crawlers. */
  via: "session" | "public"
}

async function profileById(userId: string): Promise<{ id: string; name: string } | null> {
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } })
}

/**
 * Profile an agent read surface should serve. An authenticated browser session
 * always wins (so the signed-in user sees their own data); otherwise the public
 * crawl profile is used, which throws AgentAccessError when disabled.
 */
export async function resolveAgentViewer(
  sessionToken: string | undefined
): Promise<AgentViewer> {
  const sessionUserId = await resolveSessionTokenUserId(sessionToken)
  if (sessionUserId) {
    const user = await profileById(sessionUserId)
    if (!user) throw new AgentAccessError("Session profile not found.", 404)
    return { ...user, via: "session" }
  }
  const publicProfile = await resolvePublicAgentProfile()
  return { ...publicProfile, via: "public" }
}

export async function resolveAgentViewerFromRequest(req: NextRequest): Promise<AgentViewer> {
  return resolveAgentViewer(req.cookies.get(USER_SESSION_COOKIE)?.value)
}
