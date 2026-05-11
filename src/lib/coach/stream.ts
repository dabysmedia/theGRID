import "server-only"

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
  | { type: "error"; message: string }

const ENCODER = new TextEncoder()

function sse(line: CoachStreamEvent): Uint8Array {
  return ENCODER.encode(`data: ${JSON.stringify(line)}\n\n`)
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
      try {
        for await (const event of upstream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const delta = event.delta.text
            if (delta.length > 0) {
              fullText += delta
              controller.enqueue(sse({ type: "text", delta }))
            }
          }
        }

        const final = await upstream.finalMessage()
        const tokensIn = final.usage?.input_tokens ?? 0
        const tokensOut = final.usage?.output_tokens ?? 0

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
        const message =
          err instanceof Error ? err.message : "Coach stream failed unexpectedly."
        try {
          controller.enqueue(sse({ type: "error", message }))
        } catch {
          /* controller may already be closed */
        }
        console.error("[coach stream]", err)
      } finally {
        try {
          controller.close()
        } catch {
          /* already closed */
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
