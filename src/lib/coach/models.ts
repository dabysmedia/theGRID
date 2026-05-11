/**
 * AI Coach model picker registry.
 *
 * Keys are stable picker ids stored in `CoachConversation.defaultModelId` and
 * `CoachMessage.modelId`. The Anthropic model alias can be overridden per-deploy
 * via env so we can roll forward without a code change.
 *
 * Both tiers must support vision since the photo→calorie estimate flow is part
 * of v1. Coach Chat is the cheap default; Deep Coach handles nuanced/longer
 * planning questions.
 */

export type CoachModelTier = "fast" | "smart"

export interface CoachModelDef {
  /** Stable picker id stored in the DB. */
  id: string
  /** Short user-facing label. */
  label: string
  /** One-line description for the picker UI. */
  description: string
  /** Anthropic model alias passed to the API. */
  anthropic: string
  tier: CoachModelTier
  vision: boolean
  /** Cap on assistant `max_tokens` for this tier. */
  maxOutputTokens: number
}

const HAIKU_ALIAS = process.env.ANTHROPIC_HAIKU_MODEL?.trim() || "claude-haiku-4-5"
const SONNET_ALIAS = process.env.ANTHROPIC_SONNET_MODEL?.trim() || "claude-sonnet-4-6"

export const COACH_MODELS: Record<string, CoachModelDef> = {
  "coach-chat": {
    id: "coach-chat",
    label: "Coach Chat",
    description: "Fast everyday chat. Best for nudges, quick questions, photo logging.",
    anthropic: HAIKU_ALIAS,
    tier: "fast",
    vision: true,
    maxOutputTokens: 800,
  },
  "deep-coach": {
    id: "deep-coach",
    label: "Deep Coach",
    description: "Slower & smarter. Best for planning, tradeoffs, multi-week reviews.",
    anthropic: SONNET_ALIAS,
    tier: "smart",
    vision: true,
    maxOutputTokens: 1500,
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
