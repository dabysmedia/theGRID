import "server-only"

import Anthropic from "@anthropic-ai/sdk"

let cached: Anthropic | null = null

/**
 * Lazy singleton. We avoid throwing at module import so a missing key does not
 * crash unrelated routes (e.g. /api/dashboard) — the throw happens only when a
 * coach handler actually tries to call Anthropic.
 */
export function getAnthropic(): Anthropic {
  if (cached) return cached
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new CoachConfigError(
      "AI Coach is not configured on the server (set ANTHROPIC_API_KEY)."
    )
  }
  cached = new Anthropic({ apiKey })
  return cached
}

export class CoachConfigError extends Error {
  status = 503
  constructor(message: string) {
    super(message)
    this.name = "CoachConfigError"
  }
}

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
}
