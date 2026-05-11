import { NextRequest, NextResponse } from "next/server"
import type Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/prisma"
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
import { buildUserContext } from "@/lib/coach/context"
import { coachChatSystemPrompt } from "@/lib/coach/prompts"
import {
  COACH_STREAM_HEADERS,
  createCoachStream,
} from "@/lib/coach/stream"
import {
  readCoachUploadBase64,
  resolveCoachUploadPath,
} from "@/lib/coach/uploads"

export const dynamic = "force-dynamic"

/** Hard caps to keep per-turn cost predictable. */
const MAX_HISTORY_MESSAGES = 24
const MAX_IMAGES_PER_TURN = 4
const MAX_USER_TEXT_CHARS = 6000

interface IncomingAttachment {
  kind: "image"
  path: string
  mime: string
  name?: string
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

function makeUserContent(
  text: string,
  attachments: IncomingAttachment[],
  userId: string
): Anthropic.Messages.ContentBlockParam[] {
  const blocks: Anthropic.Messages.ContentBlockParam[] = []
  const trimmed = text.trim()
  if (trimmed.length > 0) {
    blocks.push({ type: "text", text: trimmed })
  }
  let imagesUsed = 0
  for (const att of attachments) {
    if (imagesUsed >= MAX_IMAGES_PER_TURN) break
    if (!att || att.kind !== "image" || typeof att.path !== "string") continue
    const resolved = resolveCoachUploadPath({ url: att.path, userId })
    if (!resolved) continue
    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: asAnthropicMedia(resolved.mime),
        data: readCoachUploadBase64(resolved.absPath),
      },
    })
    imagesUsed++
  }
  // Anthropic requires non-empty content. If user sent only invalid attachments
  // and no text, fall back to a placeholder so the API call doesn't fail.
  if (blocks.length === 0) {
    blocks.push({ type: "text", text: "(empty message)" })
  }
  return blocks
}

function deriveTitleFromText(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim()
  if (cleaned.length === 0) return "New chat"
  return cleaned.length > 60 ? `${cleaned.slice(0, 57).trim()}…` : cleaned
}

interface HistoryMessage {
  role: string
  content: string
  attachmentsJson: string
}

function historyToAnthropicMessages(
  history: HistoryMessage[],
  userId: string
): Anthropic.Messages.MessageParam[] {
  const out: Anthropic.Messages.MessageParam[] = []
  for (const m of history) {
    if (m.role !== "user" && m.role !== "assistant") continue

    let attachments: IncomingAttachment[] = []
    try {
      const parsed = JSON.parse(m.attachmentsJson || "[]")
      if (Array.isArray(parsed)) attachments = parsed as IncomingAttachment[]
    } catch {
      attachments = []
    }

    if (m.role === "assistant") {
      // Assistant turns don't carry images we'd resend; just text.
      out.push({ role: "assistant", content: m.content })
      continue
    }

    if (attachments.length === 0) {
      out.push({ role: "user", content: m.content })
    } else {
      out.push({
        role: "user",
        content: makeUserContent(m.content, attachments, userId),
      })
    }
  }
  return out
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  let userId: string
  try {
    userId = await resolveUserId(req)
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: "Auth failed." }, { status: 401 })
  }

  const { id: conversationId } = await ctx.params

  let body: {
    text?: unknown
    modelId?: unknown
    imagePaths?: unknown
    attachments?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const text = typeof body.text === "string" ? body.text.slice(0, MAX_USER_TEXT_CHARS) : ""
  const modelKey = isValidCoachModelId(body.modelId) ? body.modelId : DEFAULT_COACH_MODEL_ID
  const model = COACH_MODELS[modelKey]

  // Accept either { attachments: [{kind,path,mime,name}] } or { imagePaths: ["/uploads/coach/..."] }
  let attachments: IncomingAttachment[] = []
  if (Array.isArray(body.attachments)) {
    attachments = (body.attachments as unknown[])
      .filter((a): a is IncomingAttachment => {
        return (
          a !== null &&
          typeof a === "object" &&
          (a as { kind?: unknown }).kind === "image" &&
          typeof (a as { path?: unknown }).path === "string" &&
          typeof (a as { mime?: unknown }).mime === "string"
        )
      })
      .slice(0, MAX_IMAGES_PER_TURN)
  } else if (Array.isArray(body.imagePaths)) {
    attachments = (body.imagePaths as unknown[])
      .filter((p): p is string => typeof p === "string")
      .slice(0, MAX_IMAGES_PER_TURN)
      .map((p) => ({ kind: "image" as const, path: p, mime: "image/jpeg" }))
  }

  if (text.trim().length === 0 && attachments.length === 0) {
    return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 })
  }

  const conversation = await prisma.coachConversation.findFirst({
    where: { id: conversationId, userId },
    select: {
      id: true,
      title: true,
      defaultModelId: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true, attachmentsJson: true, createdAt: true },
      },
    },
  })
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 })
  }

  let anthropic: Anthropic
  try {
    anthropic = getAnthropic()
  } catch (e) {
    if (e instanceof CoachConfigError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }

  // Persist the user's turn first so we never lose it if the stream errors mid-flight.
  const validatedAttachments: IncomingAttachment[] = []
  for (const a of attachments) {
    const resolved = resolveCoachUploadPath({ url: a.path, userId })
    if (resolved) {
      validatedAttachments.push({
        kind: "image",
        path: a.path,
        mime: resolved.mime,
        name: a.name,
      })
    }
  }
  const userMessage = await prisma.coachMessage.create({
    data: {
      conversationId,
      userId,
      role: "user",
      content: text,
      attachmentsJson: JSON.stringify(validatedAttachments),
      modelId: null,
    },
    select: { id: true, createdAt: true },
  })

  // Auto-title on first message.
  const wasFirstMessage = conversation.messages.length === 0
  const newTitle =
    wasFirstMessage && conversation.title === "New chat"
      ? deriveTitleFromText(text || "Photo coaching")
      : conversation.title

  await prisma.coachConversation.update({
    where: { id: conversationId },
    data: {
      title: newTitle,
      updatedAt: new Date(),
      defaultModelId: modelKey,
    },
  })

  // Build context + assemble Anthropic messages for the streamed call.
  const { userName, text: contextBlock } = await buildUserContext({ userId })

  const trimmedHistory = conversation.messages.slice(-MAX_HISTORY_MESSAGES)
  const historyMessages = historyToAnthropicMessages(trimmedHistory, userId)
  const newUserContent = makeUserContent(text, validatedAttachments, userId)

  const messages: Anthropic.Messages.MessageParam[] = [
    ...historyMessages,
    { role: "user", content: newUserContent },
  ]

  const upstream = anthropic.messages.stream({
    model: model.anthropic,
    max_tokens: model.maxOutputTokens,
    system: coachChatSystemPrompt({ userName, contextBlock }),
    messages,
  })

  const stream = createCoachStream({
    upstream,
    async onComplete({ fullText, tokensIn, tokensOut }) {
      const assistant = await prisma.coachMessage.create({
        data: {
          conversationId,
          userId,
          role: "assistant",
          content: fullText,
          attachmentsJson: "[]",
          modelId: modelKey,
          tokensIn,
          tokensOut,
        },
        select: { id: true },
      })
      await prisma.coachConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      })
      return {
        messageId: assistant.id,
        conversationId,
        modelId: modelKey,
      }
    },
  })

  return new Response(stream, {
    headers: {
      ...COACH_STREAM_HEADERS,
      "X-Coach-Conversation-Id": conversationId,
      "X-Coach-User-Message-Id": userMessage.id,
      "X-Coach-Title": encodeURIComponent(newTitle),
    },
  })
}
