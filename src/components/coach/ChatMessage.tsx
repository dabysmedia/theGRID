"use client"

import { cn } from "@/lib/utils"
import type { CoachAttachmentClient } from "@/lib/coach/types"
import { MessageImage } from "./MessageImage"
import { CoachAvatar } from "./CoachAvatar"
import { CoachMarkdown } from "./CoachMarkdown"

interface ChatMessageProps {
  role: "user" | "assistant" | "system"
  content: string
  attachments?: CoachAttachmentClient[]
  streaming?: boolean
}

export function ChatMessage({
  role,
  content,
  attachments,
  streaming = false,
}: ChatMessageProps) {
  const isUser = role === "user"

  if (role === "system") {
    // System messages prefixed with the warning emoji are surfaced from
    // streaming errors (`stream.ts` → client). Render them in destructive
    // colors so the user clearly sees something went wrong, instead of the
    // neutral "system note" style used for benign banners.
    const isError = content.trimStart().startsWith("⚠️")
    return (
      <div
        className={cn(
          "mx-auto max-w-prose rounded-xl border px-3 py-2 text-center text-xs whitespace-pre-wrap break-words",
          isError
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-glass-border bg-glass-highlight/20 text-muted-foreground"
        )}
      >
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

        {content.length > 0 &&
          (isUser ? (
            <div className="whitespace-pre-wrap break-words">
              {content}
              {streaming && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
            </div>
          ) : (
            <div className="min-w-0 break-words">
              <CoachMarkdown content={content} />
              {streaming && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
            </div>
          ))}
      </div>
    </div>
  )
}
