import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"

const NO_STORE = { "Cache-Control": "no-store, must-revalidate" }

/**
 * POST — append a recommendation audit event.
 * Body: { sessionId?, targetExerciseKey, sourceExerciseKey?, sourceSessionIds?,
 *         recommendationType, suggestedLoadLb?, suggestedRepMin?, suggestedRepMax?,
 *         targetRir?, optionalSetCount?, confidence, reasonCodes?, explanation?, status }
 * `status` is "shown" | "applied" | "dismissed".
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const targetExerciseKey =
      typeof body.targetExerciseKey === "string" ? body.targetExerciseKey.trim() : ""
    if (!targetExerciseKey) {
      return NextResponse.json(
        { error: "targetExerciseKey required" },
        { status: 400, headers: NO_STORE },
      )
    }
    const sessionId = typeof body.sessionId === "string" && body.sessionId.trim()
      ? body.sessionId.trim()
      : null
    const sourceSessionIds = Array.isArray(body.sourceSessionIds)
      ? [...new Set(body.sourceSessionIds.filter((id: unknown): id is string => typeof id === "string" && id.trim() !== ""))]
      : []
    const referencedIds = [...new Set([...(sessionId ? [sessionId] : []), ...sourceSessionIds])]
    if (referencedIds.length > 0) {
      const ownedCount = await prisma.workoutSession.count({
        where: { id: { in: referencedIds }, userId },
      })
      if (ownedCount !== referencedIds.length) {
        return NextResponse.json(
          { error: "One or more workout sessions do not belong to this profile." },
          { status: 404, headers: NO_STORE },
        )
      }
    }
    const status = ["shown", "applied", "dismissed"].includes(body.status)
      ? (body.status as string)
      : "shown"
    const now = new Date()
    const num = (v: unknown): number | null => {
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    const row = await prisma.progressionRecommendation.create({
      data: {
        userId,
        sessionId,
        targetExerciseKey,
        sourceExerciseKey:
          typeof body.sourceExerciseKey === "string" && body.sourceExerciseKey
            ? body.sourceExerciseKey
            : null,
        sourceSessionIds: JSON.stringify(sourceSessionIds),
        recommendationType:
          typeof body.recommendationType === "string" ? body.recommendationType : "initial",
        suggestedLoadLb: num(body.suggestedLoadLb),
        suggestedRepMin: num(body.suggestedRepMin),
        suggestedRepMax: num(body.suggestedRepMax),
        targetRir: num(body.targetRir),
        optionalSetCount: num(body.optionalSetCount) ?? 0,
        confidence: ["high", "medium", "low"].includes(body.confidence)
          ? (body.confidence as string)
          : "low",
        reasonCodes: JSON.stringify(Array.isArray(body.reasonCodes) ? body.reasonCodes : []),
        explanation: typeof body.explanation === "string" ? body.explanation.slice(0, 2000) : "",
        status,
        acceptedAt: status === "applied" ? now : null,
        dismissedAt: status === "dismissed" ? now : null,
      },
    })
    return NextResponse.json(row, { status: 201, headers: NO_STORE })
  } catch (e) {
    if (e instanceof UserError)
      return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to save" }, { status: 500, headers: NO_STORE })
  }
}
