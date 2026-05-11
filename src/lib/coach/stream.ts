import "server-only"

import { APIError } from "@anthropic-ai/sdk"
import type { MessageStream } from "@anthropic-ai/sdk/lib/MessageStream"

/**
 * Wire format for the coach chat SSE stream. Each event is a single JSON
 * object preceded by `data:` and terminated by a blank line, per the SSE
 * spec. Browsers parse this with the `EventSource` API or by reading the
 * fetch body line-by-line.
 */
export type CoachStreamEvent =
  | { type: "text"; delta: string }
  | {
      type: "done"
      messageId: string
      conversationId: string
      tokensIn: number
      tokensOut: number
      modelId: string
    }
  | { type: "error"; message: string; status?: number; code?: string }

const ENCODER = new TextEncoder()

function sse(line: CoachStreamEvent): Uint8Array {
  return ENCODER.encode(`data: ${JSON.stringify(line)}\n\n`)
}

/**
 * Pull the most useful human-readable message out of a thrown Anthropic error.
 * `APIError.message` is often a generic wrapper — the real reason (e.g.
 * "model not found" or "invalid x-api-key") lives in `.error.error.message`.
 */
function describeAnthropicError(err: unknown): {
  message: string
  status?: number
  code?: string
} {
  if (err instanceof APIError) {
    const body = err.error as
      | { error?: { message?: unknown; type?: unknown } }
      | undefined
    const inner =
      typeof body?.error?.message === "string" ? body.error.message : null
    const codeRaw = body?.error?.type
    const code = typeof codeRaw === "string" ? codeRaw : undefined
    const status = typeof err.status === "number" ? err.status : undefined
    return {
      message: inner || err.message || "Anthropic API error.",
      status,
      code,
    }
  }
  if (err instanceof Error) return { message: err.message }
  return { message: "Coach stream failed unexpectedly." }
}

interface BridgeOptions {
  /** Anthropic stream returned by `client.messages.stream(...)`. */
  upstream: MessageStream
  /**
   * Called once the upstream stream is finished. Receives the full assistant
   * text and the (input, output) token counts so the route can persist a
   * `CoachMessage` row for the assistant turn.
   */
  onComplete: (result: {
    fullText: string
    tokensIn: number
    tokensOut: number
  }) => Promise<{ messageId: string; conversationId: string; modelId: string }>
}

/**
 * Bridges Anthropic's streaming Messages API to a Web `ReadableStream` that we
 * return from a Next.js Route Handler. Always emits a final `done` or `error`
 * event so the client knows when to stop reading.
 */
export function createCoachStream(opts: BridgeOptions): ReadableStream<Uint8Array> {
  const { upstream, onComplete } = opts

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullText = ""
      let upstreamFailed = false
      try {
        for await (const event of upstream) {
          // Stream may emit text deltas (the only kind we surface), thinking
          // deltas (skipped — internal reasoning), tool-use deltas (n/a here),
          // and lifecycle events (message_start, content_block_start, …).
          if (event.type === "content_block_delta") {
            const delta = event.delta as { type?: string; text?: string }
            if (delta.type === "text_delta" && typeof delta.text === "string") {
              if (delta.text.length > 0) {
                fullText += delta.text
                controller.enqueue(sse({ type: "text", delta: delta.text }))
              }
            }
          }
        }

        const final = await upstream.finalMessage()
        const tokensIn = final.usage?.input_tokens ?? 0
        const tokensOut = final.usage?.output_tokens ?? 0

        // If the model returned a stop_reason we should surface (e.g. refusal),
        // tag the assistant text so the user understands why it cut off.
        if (fullText.length === 0) {
          const reason = final.stop_reason ?? "no_text"
          fullText = `(The coach didn't return any text — stop reason: ${reason}.)`
          controller.enqueue(sse({ type: "text", delta: fullText }))
        }

        const persisted = await onComplete({ fullText, tokensIn, tokensOut })

        controller.enqueue(
          sse({
            type: "done",
            messageId: persisted.messageId,
            conversationId: persisted.conversationId,
            modelId: persisted.modelId,
            tokensIn,
            tokensOut,
          })
        )
      } catch (err) {
        upstreamFailed = true
        const detail = describeAnthropicError(err)
        const userMessage =
          detail.status === 401
            ? "Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env.local."
            : detail.status === 404 || detail.code === "not_found_error"
              ? `Model not found by Anthropic. Try a different model (or set ANTHROPIC_HAIKU_MODEL / ANTHROPIC_SONNET_MODEL). Detail: ${detail.message}`
              : detail.status === 429
                ? "Anthropic rate-limited the request. Try again in a moment."
                : detail.message
        try {
          controller.enqueue(
            sse({
              type: "error",
              message: userMessage,
              status: detail.status,
              code: detail.code,
            })
          )
        } catch {
          /* controller may already be closed */
        }
        console.error("[coach stream]", {
          status: detail.status,
          code: detail.code,
          message: detail.message,
          stack: err instanceof Error ? err.stack : undefined,
        })
      } finally {
        try {
          controller.close()
        } catch {
          /* already closed */
        }
        if (upstreamFailed) {
          // Leave nothing buffered upstream — abort defensively.
          try {
            upstream.abort()
          } catch {
            /* ignore */
          }
        }
      }
    },
    cancel() {
      try {
        upstream.abort()
      } catch {
        /* ignore */
      }
    },
  })
}

export const COACH_STREAM_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Disables Nginx response buffering so chunks reach the browser promptly
  // (matches the streaming guidance in node_modules/next/dist/docs/01-app/02-guides/streaming.md).
  "X-Accel-Buffering": "no",
}
