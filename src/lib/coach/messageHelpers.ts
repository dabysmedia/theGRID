import "server-only"

import type Anthropic from "@anthropic-ai/sdk"
import {
  readCoachUploadBase64,
  resolveCoachUploadPath,
} from "@/lib/coach/uploads"

/** Hard caps to keep per-turn cost predictable. Shared between /messages and /regenerate. */
export const MAX_HISTORY_MESSAGES = 24
export const MAX_IMAGES_PER_TURN = 4
export const MAX_USER_TEXT_CHARS = 6000

export interface IncomingAttachment {
  kind: "image"
  path: string
  mime: string
  name?: string
}

type AnthropicMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp"

export function asAnthropicMedia(mime: string): AnthropicMediaType {
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

/**
 * Build a single user-turn `content` array, mixing the text and any image
 * attachments resolved against the per-user uploads dir. Falls back to a
 * placeholder when nothing valid is supplied so Anthropic doesn't reject the
 * request with an empty-content error.
 */
export function makeUserContent(
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
  if (blocks.length === 0) {
    blocks.push({ type: "text", text: "(empty message)" })
  }
  return blocks
}

export interface HistoryMessage {
  role: string
  content: string
  attachmentsJson: string
}

/**
 * Convert persisted CoachMessage rows to Anthropic message-stream params.
 * Only "user" and "assistant" rows are emitted; system rows (used for client
 * error UI) are silently skipped.
 */
export function historyToAnthropicMessages(
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
