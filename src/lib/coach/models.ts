/**
 * AI Coach model registry.
 *
 * Only one model is exposed today (`coach-chat`, Anthropic Haiku). The picker
 * UI was removed in favor of a per-conversation tone selector — see
 * `src/lib/coach/tones.ts`. The registry is kept so we can add tiers back
 * without touching every call site, and so existing assistant rows still
 * resolve their `modelId`.
 *
 * The Anthropic alias can be overridden per-deploy via env so we can roll
 * forward without a code change.
 */

export type CoachModelTier = "fast" | "smart"

export interface CoachModelDef {
  /** Stable picker id stored in the DB. */
  id: string
  /** Short user-facing label. */
  label: string
  /** One-line description (used in tooltips/debug; no UI picker today). */
  description: string
  /** Anthropic model alias passed to the API. */
  anthropic: string
  tier: CoachModelTier
  vision: boolean
  /** Cap on assistant `max_tokens` for this tier. */
  maxOutputTokens: number
}

// Anthropic's documented "Available Models" use mixed naming: dateless for the
// 4.6+ generation, dated for 4.5. We default to the exact IDs from
// https://platform.claude.com/docs/en/claude_api_primer so a fresh checkout
// works without env overrides; deploys can still pin a specific snapshot via
// ANTHROPIC_HAIKU_MODEL.
const HAIKU_ALIAS =
  process.env.ANTHROPIC_HAIKU_MODEL?.trim() || "claude-haiku-4-5-20251001"

export const COACH_MODELS: Record<string, CoachModelDef> = {
  "coach-chat": {
    id: "coach-chat",
    label: "Coach Chat",
    description: "Fast everyday chat. Used for all coaching responses.",
    anthropic: HAIKU_ALIAS,
    tier: "fast",
    vision: true,
    maxOutputTokens: 800,
  },
}

export const COACH_MODEL_IDS = Object.keys(COACH_MODELS)

export const DEFAULT_COACH_MODEL_ID = "coach-chat"

export function getCoachModel(id: string | null | undefined): CoachModelDef {
  if (id && Object.prototype.hasOwnProperty.call(COACH_MODELS, id)) {
    return COACH_MODELS[id]
  }
  return COACH_MODELS[DEFAULT_COACH_MODEL_ID]
}

export function isValidCoachModelId(id: unknown): id is string {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(COACH_MODELS, id)
}
