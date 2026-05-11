/**
 * Shared types between coach API routes and the client UI.
 * No "server-only" — safe to import in client components.
 */

export interface CoachAttachmentClient {
  kind: "image"
  path: string
  mime: string
  name?: string
}

export interface CoachMessageClient {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  attachments: CoachAttachmentClient[]
  modelId: string | null
  tokensIn: number
  tokensOut: number
  createdAt: string
}

export interface CoachConversationListItem {
  id: string
  title: string
  defaultModelId: string | null
  createdAt: string
  updatedAt: string
  lastMessagePreview: string
  lastMessageRole: string | null
  lastMessageAt: string | null
}

export interface CoachConversationDetail {
  id: string
  title: string
  defaultModelId: string | null
  createdAt: string
  updatedAt: string
  messages: CoachMessageClient[]
}

export interface CoachCalorieEstimateItem {
  name: string
  qty: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface CoachCalorieEstimateResponse {
  items: CoachCalorieEstimateItem[]
  totals: {
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }
  confidence: "low" | "med" | "high"
  caveats: string
  modelId: string
}
