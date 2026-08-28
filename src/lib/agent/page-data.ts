import "server-only"

import { cookies, headers } from "next/headers"
import { AgentAccessError } from "@/lib/agent/access"
import { exportRangeForAgent, type AgentRangeExport } from "@/lib/agent/export-profile"
import { resolveAgentRange, type AgentRange } from "@/lib/agent/ranges"
import { agentTodayKey, resolveAgentTimezone } from "@/lib/agent/timezone"
import { resolveAgentViewer } from "@/lib/agent/viewer"
import { USER_SESSION_COOKIE } from "@/lib/user-session"
import { prisma } from "@/lib/prisma"

export async function agentRequestBase(): Promise<string> {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

export type AgentPageResult =
  | {
      kind: "ok"
      base: string
      profileName: string
      range: AgentRange
      snapshot: AgentRangeExport
    }
  /** Slug isn't a window we understand — the page redirects to the index. */
  | { kind: "unknown-range" }
  /** No public profile, or AGENT_PUBLIC_EXPORT is off — the page 404s. */
  | { kind: "unavailable" }

/** Loads a snapshot for a server-rendered /agents page. */
export async function loadAgentPageData(slug: string): Promise<AgentPageResult> {
  const cookieStore = await cookies()
  let viewer
  try {
    viewer = await resolveAgentViewer(cookieStore.get(USER_SESSION_COOKIE)?.value)
  } catch (e) {
    if (e instanceof AgentAccessError) return { kind: "unavailable" }
    throw e
  }

  const profile = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: { timeZone: true },
  })
  const tz = resolveAgentTimezone(profile?.timeZone)
  const todayKey = agentTodayKey(new Date(), profile?.timeZone)
  const range = resolveAgentRange(slug, todayKey, tz)
  if (!range) return { kind: "unknown-range" }

  return {
    kind: "ok",
    base: await agentRequestBase(),
    profileName: viewer.name,
    range,
    snapshot: await exportRangeForAgent(viewer.id, range),
  }
}
