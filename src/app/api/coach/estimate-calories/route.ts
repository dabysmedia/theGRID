import { NextRequest, NextResponse } from "next/server"
import type Anthropic from "@anthropic-ai/sdk"
import { resolveUserId, UserError } from "@/lib/current-user"
import {
  COACH_MODELS,
  DEFAULT_COACH_MODEL_ID,
  isValidCoachModelId,
} from "@/lib/coach/models"
import {
  CoachConfigError,
  getAnthropic,
} from "@/lib/coach/anthropic"
import {
  PHOTO_CALORIE_SYSTEM_PROMPT,
  PHOTO_CALORIE_USER_INSTRUCTION,
} from "@/lib/coach/prompts"
import {
  readCoachUploadBase64,
  resolveCoachUploadPath,
} from "@/lib/coach/uploads"

export const dynamic = "force-dynamic"

interface EstimateItem {
  name: string
  qty: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

interface EstimateResponse {
  items: EstimateItem[]
  totals: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }
  confidence: "low" | "med" | "high"
  caveats: string
  modelId: string
}

type AnthropicMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp"

function asAnthropicMedia(mime: string): AnthropicMediaType {
  switch (mime) {
    case "image/png":
      return "image/png"
    case "image/gif":
      return "image/gif"
    case "image/webp":
      return "image/webp"
    default:
      return "image/jpeg"
  }
}

function parseEstimateJson(raw: string): Omit<EstimateResponse, "modelId"> | null {
  let text = raw.trim()
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim()
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object") return null
  const obj = parsed as Record<string, unknown>

  if (!Array.isArray(obj.items)) return null
  const items: EstimateItem[] = []
  for (const it of obj.items) {
    if (!it || typeof it !== "object") continue
    const o = it as Record<string, unknown>
    const name = String(o.name ?? "").trim()
    const qty = String(o.qty ?? "").trim()
    const kcal = Number(o.kcal)
    const protein_g = Number(o.protein_g)
    const carbs_g = Number(o.carbs_g)
    const fat_g = Number(o.fat_g)
    if (
      !name ||
      !Number.isFinite(kcal) ||
      !Number.isFinite(protein_g) ||
      !Number.isFinite(carbs_g) ||
      !Number.isFinite(fat_g)
    ) {
      continue
    }
    items.push({
      name,
      qty,
      kcal: Math.max(0, Math.round(kcal)),
      protein_g: Math.max(0, roundHalf(protein_g)),
      carbs_g: Math.max(0, roundHalf(carbs_g)),
      fat_g: Math.max(0, roundHalf(fat_g)),
    })
  }
  if (items.length === 0) return null

  const totals =
    obj.totals && typeof obj.totals === "object"
      ? sumOrFallback(obj.totals as Record<string, unknown>, items)
      : sumItems(items)

  const confidenceRaw = String(obj.confidence ?? "low").toLowerCase()
  const confidence: "low" | "med" | "high" =
    confidenceRaw === "high" ? "high" : confidenceRaw === "med" ? "med" : "low"
  const caveats = String(obj.caveats ?? "").trim().slice(0, 400)

  return { items, totals, confidence, caveats }
}

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2
}

function sumItems(items: EstimateItem[]): EstimateResponse["totals"] {
  return items.reduce(
    (acc, it) => ({
      kcal: acc.kcal + it.kcal,
      protein_g: roundHalf(acc.protein_g + it.protein_g),
      carbs_g: roundHalf(acc.carbs_g + it.carbs_g),
      fat_g: roundHalf(acc.fat_g + it.fat_g),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )
}

function sumOrFallback(
  raw: Record<string, unknown>,
  items: EstimateItem[]
): EstimateResponse["totals"] {
  const fallback = sumItems(items)
  const kcal = Number(raw.kcal)
  const p = Number(raw.protein_g)
  const c = Number(raw.carbs_g)
  const f = Number(raw.fat_g)
  return {
    kcal: Number.isFinite(kcal) ? Math.max(0, Math.round(kcal)) : fallback.kcal,
    protein_g: Number.isFinite(p) ? Math.max(0, roundHalf(p)) : fallback.protein_g,
    carbs_g: Number.isFinite(c) ? Math.max(0, roundHalf(c)) : fallback.carbs_g,
    fat_g: Number.isFinite(f) ? Math.max(0, roundHalf(f)) : fallback.fat_g,
  }
}

export async function POST(req: NextRequest) {
  let userId: string
  try {
    userId = await resolveUserId(req)
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: "Auth failed." }, { status: 401 })
  }

  let body: { imagePath?: unknown; modelId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const imagePath = typeof body.imagePath === "string" ? body.imagePath : ""
  if (!imagePath) {
    return NextResponse.json({ error: "imagePath is required." }, { status: 400 })
  }
  const resolved = resolveCoachUploadPath({ url: imagePath, userId })
  if (!resolved) {
    return NextResponse.json({ error: "Image not found or not yours." }, { status: 404 })
  }

  const modelKey = isValidCoachModelId(body.modelId) ? body.modelId : DEFAULT_COACH_MODEL_ID
  const model = COACH_MODELS[modelKey]

  let anthropic: Anthropic
  try {
    anthropic = getAnthropic()
  } catch (e) {
    if (e instanceof CoachConfigError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }

  const base64 = readCoachUploadBase64(resolved.absPath)

  let response: Anthropic.Messages.Message
  try {
    response = await anthropic.messages.create({
      model: model.anthropic,
      max_tokens: 700,
      system: PHOTO_CALORIE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PHOTO_CALORIE_USER_INSTRUCTION },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: asAnthropicMedia(resolved.mime),
                data: base64,
              },
            },
          ],
        },
      ],
    })
  } catch (e) {
    console.error("[coach estimate-calories Anthropic error]", e)
    const message = e instanceof Error ? e.message : "Coach estimate failed."
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const textBlock = response.content.find(
    (b): b is Anthropic.Messages.TextBlock => b.type === "text"
  )
  const rawText = textBlock?.text ?? ""
  const parsed = parseEstimateJson(rawText)
  if (!parsed) {
    return NextResponse.json(
      {
        error: "Coach returned an unparseable estimate.",
        raw: process.env.NODE_ENV === "development" ? rawText : undefined,
      },
      { status: 502 }
    )
  }

  const result: EstimateResponse = { ...parsed, modelId: modelKey }
  return NextResponse.json(result)
}
