import "server-only"

import { UserError } from "@/lib/current-user"
import { agentTodayKey } from "@/lib/agent/timezone"
import { agentActCatalog } from "@/lib/agent/act/catalog"
import { dailyHandlers } from "@/lib/agent/act/daily"
import { nutritionHandlers } from "@/lib/agent/act/nutrition"
import { ActError, opsNeedUser, parseActRequest, type ActOp } from "@/lib/agent/act/parse"
import type { ActContext, ActFn } from "@/lib/agent/act/types"
import { listActUsers, resolveActUser } from "@/lib/agent/act/users"
import { workoutHandlers } from "@/lib/agent/act/workouts"

const HANDLERS: Record<string, ActFn> = {
  ...nutritionHandlers,
  ...dailyHandlers,
  ...workoutHandlers,
  help: async () => ({ doc: agentActCatalog() }),
  users: async () => listActUsers(),
}

async function runOp(index: number, op: ActOp, ctx: ActContext | null) {
  const handler = HANDLERS[op.op]
  if (!handler) {
    return {
      i: index,
      op: op.op,
      ok: false,
      error: `Unknown op "${op.op}". GET /api/agent/act for the command list.`,
    }
  }
  try {
    const data = await handler(op.args, ctx)
    return { i: index, op: op.op, ok: true as const, ...data }
  } catch (error) {
    if (error instanceof ActError || error instanceof UserError) {
      return { i: index, op: op.op, ok: false as const, error: error.message }
    }
    console.error("[agent/act]", op.op, error)
    return { i: index, op: op.op, ok: false as const, error: "That op failed." }
  }
}

export async function runAgentAct(body: unknown) {
  const parsed = parseActRequest(body)
  const named = Boolean(parsed.user)
  const profile = parsed.user || opsNeedUser(parsed.ops) ? await resolveActUser(parsed.user) : null
  const now = new Date()
  const ctx: ActContext | null = profile
    ? { user: profile, today: agentTodayKey(now, profile.timeZone), now }
    : null

  const results = []
  for (let index = 0; index < parsed.ops.length; index++) {
    results.push(await runOp(index, parsed.ops[index]!, ctx))
  }

  return {
    ...(profile ? { user: { id: profile.id, name: profile.name } } : {}),
    ...(profile && !named ? { userDefaulted: true } : {}),
    ok: results.every((result) => result.ok),
    results,
  }
}
