import "server-only"

import { prisma } from "@/lib/prisma"
import { ActError } from "@/lib/agent/act/parse"
import type { ActUser } from "@/lib/agent/act/types"

async function profiles(): Promise<ActUser[]> {
  return prisma.user.findMany({
    where: { name: { not: "" } },
    select: { id: true, name: true, timeZone: true },
    orderBy: { createdAt: "asc" },
  })
}

export async function listActUsers(): Promise<Record<string, unknown>> {
  const users = await profiles()
  return { users: users.map((user) => ({ id: user.id, name: user.name })) }
}

/**
 * Profile a write batch should touch. A single profile needs no name. Several
 * profiles require `user` unless AGENT_PROFILE_ID / AGENT_PROFILE_NAME picks one.
 */
export async function resolveActUser(ref: string | null): Promise<ActUser> {
  const users = await profiles()
  if (users.length === 0) throw new ActError("No profiles exist.", 404)

  const listed = users.map((user) => ({ id: user.id, name: user.name }))
  const raw = ref?.trim() ?? ""
  if (!raw) {
    if (users.length === 1) return users[0]!
    const envId = process.env.AGENT_PROFILE_ID?.trim()
    if (envId) {
      const hit = users.find((user) => user.id === envId)
      if (hit) return hit
    }
    const envName = process.env.AGENT_PROFILE_NAME?.trim().toLowerCase()
    if (envName) {
      const hits = users.filter((user) => user.name.trim().toLowerCase() === envName)
      if (hits.length === 1) return hits[0]!
    }
    throw new ActError("More than one profile. Pass user as a name or id.", 400, listed)
  }

  const byId = users.find((user) => user.id === raw)
  if (byId) return byId
  const byName = users.filter((user) => user.name.trim().toLowerCase() === raw.toLowerCase())
  if (byName.length === 1) return byName[0]!
  if (byName.length > 1) {
    throw new ActError(`"${raw}" matches more than one profile. Pass the id.`, 400, listed)
  }
  throw new ActError(`No profile matches "${raw}".`, 404, listed)
}
