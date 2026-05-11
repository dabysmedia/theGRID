"use client"

import { RefreshCcw } from "lucide-react"
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
  /**
   * When provided, an inline "Regenerate" affordance is rendered. The page
   * passes this only on the most recent assistant/system bubble so the
   * button doesn't clutter the rest of the thread.
   */
  onRegenerate?: () => void
  /** When true, the regenerate button is disabled (e.g. another stream is in flight). */
  regenerateDisabled?: boolean
}

export function ChatMessage({
  role,
  content,
  attachments,
  streaming = false,
  onRegenerate,
  regenerateDisabled = false,
}: ChatMessageProps) {
  const isUser = role === "user"

  if (role === "system") {
    // System messages prefixed with the warning emoji are surfaced from
    // streaming errors (`stream.ts` → client). Render them in destructive
    // colors so the user clearly sees something went wrong, instead of the
    // neutral "system note" style used for benign banners.
    const isError = content.trimStart().startsWith("⚠️")
    return (
      <div className="flex flex-col items-center gap-1.5">
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
        {onRegenerate && (
          <RegenerateButton
            onClick={onRegenerate}
            disabled={regenerateDisabled}
            label="Try again"
          />
        )}
      </div>
    )
  }

  const bubble = (
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
  )

  // Assistant: avatar + bubble row, optional regenerate affordance below the
  // bubble (offset by the avatar gutter so it lines up with the message body).
  if (!isUser) {
    return (
      <div className="flex w-full flex-col gap-1.5">
        <div className="flex w-full items-end gap-2.5">
          <CoachAvatar className="size-8 shrink-0 rounded-full" />
          {bubble}
        </div>
        {onRegenerate && !streaming && (
          <div className="pl-[42px]">
            <RegenerateButton
              onClick={onRegenerate}
              disabled={regenerateDisabled}
              label="Regenerate"
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex w-full justify-end gap-2.5">
      {bubble}
    </div>
  )
}

function RegenerateButton({
  onClick,
  disabled,
  label,
  className,
}: {
  onClick: () => void
  disabled?: boolean
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 self-start rounded-lg border border-glass-border bg-glass-highlight/20 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors",
        "hover:bg-white/5 hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
    >
      <RefreshCcw className="size-3" aria-hidden />
      {label}
    </button>
  )
}
