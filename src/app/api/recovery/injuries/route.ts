import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { parseYyyyMmDdToStoredDate } from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"
import { getConditionById, isKnownTreatmentKey } from "@/lib/recovery-catalog"
import { normalizeBodySegmentKeysJson } from "@/lib/anatomy-health/derive-from-recovery"

const SEVERITY = new Set(["mild", "moderate", "severe"])
const STATUS = new Set(["active", "improving", "recovered"])
const KIND = new Set(["injury", "illness"])

/** Map Prisma error codes; works with plain objects too (some runtimes omit `instanceof`). */
function prismaCodeHint(e: unknown): string | undefined {
  if (!e || typeof e !== "object") return undefined
  const code = (e as { code?: string }).code
  switch (code) {
    case "P2002":
      return "Duplicate record (unique constraint)."
    case "P2003":
      return "Invalid user or related record (foreign key)."
    case "P2022":
      return "Database is missing a column — run `npx prisma db push` (or migrate)."
    case "P2028":
      return "Transaction timed out."
    case "P2034":
      return "Transaction conflict — retry."
    default:
      return undefined
  }
}

/**
 * Always produce something human-readable for the client (Prisma messages are often multi-line and >400 chars).
 */
function formatCreateFailureReason(e: unknown): string {
  const hint = prismaCodeHint(e)
  let technical = ""
  if (e instanceof Error && typeof e.message === "string" && e.message.trim().length > 0) {
    // Prisma puts the real problem on lines after the noisy "Invalid … create()" header (incl. Turbopack paths).
    const lines = e.message
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    const skipTurbopackNoise = lines.filter((l) => !l.includes("__TURBOPACK__"))
    const body = (skipTurbopackNoise.length > 1 ? skipTurbopackNoise : lines).slice(0, 14).join(" ")
    technical = body.length > 1800 ? `${body.slice(0, 1797)}…` : body
  } else if (typeof e === "string" && e.trim()) {
    technical = e.trim().slice(0, 900)
  } else if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message: unknown }).message
    if (typeof m === "string" && m.trim()) {
      const first = m.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? m.trim()
      technical = first.length > 900 ? `${first.slice(0, 897)}…` : first
    }
  }

  if (hint && technical) return `${hint} ${technical}`
  if (technical) return technical
  if (hint) return hint
  try {
    const s = JSON.stringify(e)
    if (s && s !== "{}") return s.slice(0, 900)
  } catch {
    /* ignore */
  }
  return "Unknown error — check the terminal where `next dev` is running."
}

function parseBodyRegion(body: Record<string, unknown>): string | null {
  if (body.bodyRegion == null || body.bodyRegion === "") return null
  const s = String(body.bodyRegion).trim()
  return s.length > 0 ? s.slice(0, 120) : null
}

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const status = req.nextUrl.searchParams.get("status")
    const where: Record<string, unknown> = { userId }
    if (status && STATUS.has(status)) where.status = status

    const injuries = await prisma.injuryRecord.findMany({
      where,
      orderBy: { onsetDate: "desc" },
      include: {
        treatments: { orderBy: { date: "desc" }, take: 50 },
      },
    })
    return NextResponse.json(injuries)
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const rawBody = await req.json()
    if (rawBody == null || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const body = rawBody as Record<string, unknown>
    const rawKey = String(body.conditionKey || "custom").slice(0, 120)
    const def = getConditionById(rawKey)
    const conditionKey = def ? def.id : "custom"
    const customLabel =
      conditionKey === "custom"
        ? String(body.customLabel || "").slice(0, 200) || "Custom"
        : null
    const kindRaw = def
      ? def.kind
      : KIND.has(String(body.kind))
        ? String(body.kind)
        : "injury"
    const kind: "injury" | "illness" = kindRaw === "illness" ? "illness" : "injury"
    const onset = String(body.onsetDate || "")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(onset)) {
      return NextResponse.json({ error: "Invalid onsetDate" }, { status: 400 })
    }
    const severity = SEVERITY.has(String(body.severity)) ? String(body.severity) : "mild"
    const status = STATUS.has(String(body.status)) ? String(body.status) : "active"
    const bodyRegion = parseBodyRegion(body)
    const bodySegmentKeysJson = normalizeBodySegmentKeysJson(body.bodySegmentKeys)
    const notes = body.notes != null ? String(body.notes).slice(0, 4000) : null

    const suggested = def?.suggestedTreatments ?? []
    const treatmentKeys: string[] = Array.isArray(body.seedTreatments)
      ? body.seedTreatments.filter((k: unknown) => typeof k === "string")
      : suggested

    const logged = parseYyyyMmDdToStoredDate(onset)

    // Single create with `bodySegmentKeysJson` has triggered PrismaClientValidationError under Turbopack
    // (error highlights that field even though the schema is `String`). Rely on DB default `[]` for insert,
    // then set segments in the same transaction so the row never stays empty incorrectly.
    const base: Prisma.InjuryRecordUncheckedCreateInput = {
      conditionKey,
      kind,
      onsetDate: logged,
      severity,
      status,
      userId,
    }
    if (customLabel != null) base.customLabel = customLabel
    if (bodyRegion != null) base.bodyRegion = bodyRegion
    if (notes != null) base.notes = notes

    const injury = await prisma.$transaction(async (tx) => {
      const row = await tx.injuryRecord.create({ data: base })
      if (bodySegmentKeysJson !== "[]") {
        // Raw UPDATE avoids PrismaClientValidationError that targets `bodySegmentKeysJson` under Turbopack
        // (schema is `String`; validation still misfires on create/update for some builds).
        await tx.$executeRawUnsafe(
          `UPDATE "InjuryRecord" SET "bodySegmentKeysJson" = ?, "updatedAt" = datetime('now') WHERE "id" = ? AND "userId" = ?`,
          bodySegmentKeysJson,
          row.id,
          userId,
        )
      }
      return row
    })

    for (const key of treatmentKeys) {
      if (!isKnownTreatmentKey(key)) continue
      await prisma.treatmentLog.create({
        data: {
          injuryId: injury.id,
          date: logged,
          treatmentKey: key,
          completed: false,
          userId,
        },
      })
    }

    const full = await prisma.injuryRecord.findUnique({
      where: { id: injury.id },
      include: { treatments: { orderBy: { date: "desc" } } },
    })
    if (!full) {
      return NextResponse.json({ error: "Failed to create", details: "Row missing after insert." }, { status: 500 })
    }

    return NextResponse.json(full, { status: 201 })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error("[POST /api/recovery/injuries]", e)
    const details = formatCreateFailureReason(e)
    return NextResponse.json({ error: "Failed to create", details }, { status: 500 })
  }
}
