import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"
import { DEFAULT_COACH_MODEL_ID } from "@/lib/coach/models"
import { DEFAULT_COACH_TONE_ID, isValidCoachToneId } from "@/lib/coach/tones"

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const conversations = await prisma.coachConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        defaultModelId: true,
        defaultTone: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          select: { content: true, role: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      take: 100,
    })

    const result = conversations.map((c) => ({
      id: c.id,
      title: c.title,
      defaultModelId: c.defaultModelId,
      defaultTone: c.defaultTone ?? DEFAULT_COACH_TONE_ID,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      lastMessagePreview: c.messages[0]?.content?.slice(0, 140) ?? "",
      lastMessageRole: c.messages[0]?.role ?? null,
      lastMessageAt: c.messages[0]?.createdAt ?? null,
    }))
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[coach conversations GET]", e)
    return NextResponse.json({ error: "Failed to load conversations." }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json().catch(() => ({}))
    const rawTitle = typeof body?.title === "string" ? body.title.trim() : ""
    const title = rawTitle.length > 0 ? rawTitle.slice(0, 120) : "New chat"
    const defaultTone = isValidCoachToneId(body?.defaultTone)
      ? body.defaultTone
      : DEFAULT_COACH_TONE_ID

    const conversation = await prisma.coachConversation.create({
      data: {
        title,
        // Model picker is gone — every conversation uses the default chat model.
        defaultModelId: DEFAULT_COACH_MODEL_ID,
        defaultTone,
        userId,
      },
      select: {
        id: true,
        title: true,
        defaultModelId: true,
        defaultTone: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    return NextResponse.json(conversation, { status: 201 })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[coach conversations POST]", e)
    return NextResponse.json({ error: "Failed to create conversation." }, { status: 500 })
  }
}
