import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"
import { isValidCoachModelId } from "@/lib/coach/models"
import { DEFAULT_COACH_TONE_ID, isValidCoachToneId } from "@/lib/coach/tones"
import { deleteCoachUploadsByUrls } from "@/lib/coach/uploads"

interface AttachmentRow {
  kind?: string
  path?: string
}

function collectImagePaths(messages: { attachmentsJson: string }[]): string[] {
  const out: string[] = []
  for (const msg of messages) {
    let parsed: unknown
    try {
      parsed = JSON.parse(msg.attachmentsJson || "[]")
    } catch {
      continue
    }
    if (!Array.isArray(parsed)) continue
    for (const a of parsed as AttachmentRow[]) {
      if (a && a.kind === "image" && typeof a.path === "string") out.push(a.path)
    }
  }
  return out
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveUserId(req)
    const { id } = await ctx.params
    const conversation = await prisma.coachConversation.findFirst({
      where: { id, userId },
      select: {
        id: true,
        title: true,
        defaultModelId: true,
        defaultTone: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            content: true,
            attachmentsJson: true,
            modelId: true,
            tokensIn: true,
            tokensOut: true,
            createdAt: true,
          },
        },
      },
    })
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 })
    }

    const messages = conversation.messages.map((m) => {
      let attachments: unknown = []
      try {
        attachments = JSON.parse(m.attachmentsJson || "[]")
      } catch {
        attachments = []
      }
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        attachments: Array.isArray(attachments) ? attachments : [],
        modelId: m.modelId,
        tokensIn: m.tokensIn,
        tokensOut: m.tokensOut,
        createdAt: m.createdAt,
      }
    })

    return NextResponse.json({
      id: conversation.id,
      title: conversation.title,
      defaultModelId: conversation.defaultModelId,
      defaultTone: conversation.defaultTone ?? DEFAULT_COACH_TONE_ID,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages,
    })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[coach conversation GET]", e)
    return NextResponse.json({ error: "Failed to load conversation." }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveUserId(req)
    const { id } = await ctx.params
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
    }

    const existing = await prisma.coachConversation.findFirst({
      where: { id, userId },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 })
    }

    const data: {
      title?: string
      defaultModelId?: string | null
      defaultTone?: string
    } = {}
    if (typeof body.title === "string") {
      const t = body.title.trim().slice(0, 120)
      if (t.length === 0) {
        return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 })
      }
      data.title = t
    }
    if ("defaultModelId" in body) {
      if (body.defaultModelId === null) {
        data.defaultModelId = null
      } else if (isValidCoachModelId(body.defaultModelId)) {
        data.defaultModelId = body.defaultModelId
      } else {
        return NextResponse.json({ error: "Unknown model id." }, { status: 400 })
      }
    }
    if ("defaultTone" in body) {
      if (!isValidCoachToneId(body.defaultTone)) {
        return NextResponse.json({ error: "Unknown tone id." }, { status: 400 })
      }
      data.defaultTone = body.defaultTone
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 })
    }

    const updated = await prisma.coachConversation.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        defaultModelId: true,
        defaultTone: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[coach conversation PATCH]", e)
    return NextResponse.json({ error: "Failed to update conversation." }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveUserId(req)
    const { id } = await ctx.params

    const conversation = await prisma.coachConversation.findFirst({
      where: { id, userId },
      select: {
        id: true,
        messages: { select: { attachmentsJson: true } },
      },
    })
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 })
    }

    const imagePaths = collectImagePaths(conversation.messages)
    deleteCoachUploadsByUrls(imagePaths, userId)

    await prisma.coachConversation.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[coach conversation DELETE]", e)
    return NextResponse.json({ error: "Failed to delete conversation." }, { status: 500 })
  }
}
