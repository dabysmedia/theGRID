/**
 * AI Coach tone registry.
 *
 * Tones change *how* the coach replies, not which model answers. They are
 * persisted per-conversation as `CoachConversation.defaultTone` and applied
 * by `coachChatSystemPrompt` (see prompts.ts).
 */

export type CoachToneId = "standard" | "blunt"

export interface CoachToneDef {
  id: CoachToneId
  /** Short user-facing label for the picker. */
  label: string
  /** One-line description used as the picker tooltip. */
  description: string
  /**
   * Style instructions appended to the coach system prompt. Should be
   * action-oriented and stay within the existing safety constraints.
   */
  systemFragment: string
}

export const COACH_TONES: Record<CoachToneId, CoachToneDef> = {
  standard: {
    id: "standard",
    label: "Standard",
    description: "Supportive, conversational coach.",
    systemFragment: `Tone: Standard.
- Conversational, encouraging, and warm — never preachy.
- Acknowledge effort before offering critique.
- Match the user's energy. Keep things grounded and pragmatic.`,
  },
  blunt: {
    id: "blunt",
    label: "Blunt",
    description: "Direct, no-fluff coach. Calls out excuses.",
    systemFragment: `Tone: Blunt.
- Direct. No filler, no validation, no "great question" / "I love that".
- Lead with the verdict in one sentence, then 1–2 sentences of reasoning.
- Call out excuses, missed sessions, lazy patterns, and contradictions
  between the user's stated goals and their recent data — clearly, but
  without insults or contempt.
- When the data is genuinely good, say so in one line and move on.
- Keep replies roughly 30% shorter than usual. Use bullets only when they
  speed comprehension. Never sugar-coat.`,
  },
}

export const COACH_TONE_IDS: CoachToneId[] = Object.keys(COACH_TONES) as CoachToneId[]

export const DEFAULT_COACH_TONE_ID: CoachToneId = "standard"

export function isValidCoachToneId(id: unknown): id is CoachToneId {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(COACH_TONES, id)
}

export function getCoachTone(id: string | null | undefined): CoachToneDef {
  if (id && isValidCoachToneId(id)) return COACH_TONES[id]
  return COACH_TONES[DEFAULT_COACH_TONE_ID]
}
