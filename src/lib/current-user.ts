import "server-only"

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

const HEADER_KEY = "x-user-id"

export async function resolveUserId(req: NextRequest): Promise<string> {
  const userId = req.headers.get(HEADER_KEY)
  if (!userId) {
    throw new UserError("No active user. Please select a profile.", 401)
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) {
    throw new UserError("User not found.", 404)
  }
  return user.id
}

export class UserError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "UserError"
    this.status = status
  }
}
