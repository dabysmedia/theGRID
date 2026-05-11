"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { COACH_MODELS } from "@/lib/coach/models"
import type { CoachAttachmentClient } from "@/lib/coach/types"
import { MessageImage } from "./MessageImage"
import { CoachAvatar } from "./CoachAvatar"

interface ChatMessageProps {
  role: "user" | "assistant" | "system"
  content: string
  attachments?: CoachAttachmentClient[]
  modelId?: string | null
  streaming?: boolean
}

export function ChatMessage({
  role,
  content,
  attachments,
  modelId,
  streaming = false,
}: ChatMessageProps) {
  const isUser = role === "user"
  const modelLabel = useMemo(() => {
    if (!modelId) return null
    return COACH_MODELS[modelId]?.label ?? null
  }, [modelId])

  if (role === "system") {
    return (
      <div className="mx-auto max-w-prose rounded-xl border border-glass-border bg-glass-highlight/20 px-3 py-2 text-center text-xs text-muted-foreground">
        {content}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex w-full gap-2.5",
        isUser ? "justify-end" : "justify-start items-end"
      )}
    >
      {!isUser && (
        <CoachAvatar className="size-8 shrink-0 rounded-full" />
      )}
      <div
        className={cn(
          "flex max-w-[85%] flex-col gap-2 rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm sm:max-w-[75%]",
          isUser
            ? "bg-primary/15 text-foreground border border-primary/20"
            : "glass border border-glass-border text-foreground"
        )}
      >
        {attachments && attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments
              .filter((a) => a.kind === "image")
              .map((a) => (
                <MessageImage key={a.path} src={a.path} alt={a.name} />
              ))}
          </div>
        )}

        {content.length > 0 && (
          <div className="whitespace-pre-wrap break-words">
            {content}
            {streaming && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
          </div>
        )}

        {!isUser && !streaming && modelLabel && (
          <div className="-mb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {modelLabel}
          </div>
        )}
      </div>
    </div>
  )
}
