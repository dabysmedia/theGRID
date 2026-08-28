import "server-only"

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveSessionUserId } from "@/lib/user-session"

const HEADER_KEY = "x-user-id"

export async function resolveUserId(req: NextRequest): Promise<string> {
  const sessionUserId = await resolveSessionUserId(req)
  if (!sessionUserId) {
    throw new UserError("Your session has expired. Please unlock your profile again.", 401)
  }

  const requestedUserId = req.headers.get(HEADER_KEY)
  if (requestedUserId && requestedUserId !== sessionUserId) {
    throw new UserError("This session cannot access the selected profile.", 403)
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { id: true },
  })
  if (!user) {
    throw new UserError("User not found.", 404)
  }
  return user.id
}

export async function requireProtocolEnabled(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { protocolEnabled: true },
  })
  if (!user) throw new UserError("User not found.", 404)
  if (!user.protocolEnabled) {
    throw new UserError("Protocol tracking is disabled for this profile.", 403)
  }
}

export class UserError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "UserError"
    this.status = status
  }
}
