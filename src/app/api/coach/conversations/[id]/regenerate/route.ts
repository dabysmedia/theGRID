import { NextRequest, NextResponse } from "next/server"
import type Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"
import {
  COACH_MODELS,
  DEFAULT_COACH_MODEL_ID,
} from "@/lib/coach/models"
import {
  CoachConfigError,
  getAnthropic,
} from "@/lib/coach/anthropic"
import { buildUserContext } from "@/lib/coach/context"
import { coachChatSystemPrompt } from "@/lib/coach/prompts"
import { DEFAULT_COACH_TONE_ID, isValidCoachToneId } from "@/lib/coach/tones"
import {
  COACH_STREAM_HEADERS,
  createCoachStream,
} from "@/lib/coach/stream"
import {
  MAX_HISTORY_MESSAGES,
  historyToAnthropicMessages,
} from "@/lib/coach/messageHelpers"

export const dynamic = "force-dynamic"

/**
 * Re-runs the most recent user prompt for an existing conversation.
 *
 * - Deletes the trailing assistant turn (and any orphan non-user rows) so the
 *   thread ends with a user message.
 * - Re-streams a fresh assistant reply using the current site context and the
 *   tone supplied in the body (or the conversation's stored default).
 * - The user's message and its attachments are NOT modified — only the AI
 *   reply is replaced.
 */
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

  let body: { tone?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const conversation = await prisma.coachConversation.findFirst({
    where: { id: conversationId, userId },
    select: {
      id: true,
      title: true,
      defaultModelId: true,
      defaultTone: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          attachmentsJson: true,
          createdAt: true,
        },
      },
    },
  })
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 })
  }

  // Find the trailing block of non-user messages and delete them so the
  // thread ends with a user turn. In normal use this is at most a single
  // assistant row, but be defensive against any future edge cases.
  const trailingNonUser: { id: string }[] = []
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const m = conversation.messages[i]
    if (m.role === "user") break
    trailingNonUser.push({ id: m.id })
  }

  // Refuse if there's nothing to regenerate from (i.e. no prior user prompt).
  const remaining = conversation.messages.slice(
    0,
    conversation.messages.length - trailingNonUser.length
  )
  if (remaining.length === 0 || remaining[remaining.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "Nothing to regenerate — send a message first." },
      { status: 400 }
    )
  }

  // Tone resolution: explicit body wins, then the conversation's stored tone,
  // then the global default.
  const toneKey = isValidCoachToneId(body.tone)
    ? body.tone
    : isValidCoachToneId(conversation.defaultTone)
      ? conversation.defaultTone
      : DEFAULT_COACH_TONE_ID

  const modelKey = DEFAULT_COACH_MODEL_ID
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

  // Drop the trailing assistant from the DB before we stream the replacement
  // so a partial failure can't leave the user staring at two assistant turns.
  if (trailingNonUser.length > 0) {
    await prisma.coachMessage.deleteMany({
      where: {
        conversationId,
        id: { in: trailingNonUser.map((m) => m.id) },
      },
    })
  }

  // Persist tone choice & bump updatedAt for sidebar ordering.
  await prisma.coachConversation.update({
    where: { id: conversationId },
    data: {
      defaultTone: toneKey,
      defaultModelId: modelKey,
      updatedAt: new Date(),
    },
  })

  const { userName, text: contextBlock } = await buildUserContext({ userId })
  const trimmedHistory = remaining.slice(-MAX_HISTORY_MESSAGES)
  const messages = historyToAnthropicMessages(trimmedHistory, userId)

  const upstream = anthropic.messages.stream({
    model: model.anthropic,
    max_tokens: model.maxOutputTokens,
    system: coachChatSystemPrompt({ userName, contextBlock, toneId: toneKey }),
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
      "X-Coach-Regenerated": "1",
    },
  })
}
