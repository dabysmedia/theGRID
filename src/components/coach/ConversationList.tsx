"use client"

import { Plus, MessageSquare, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CoachConversationListItem } from "@/lib/coach/types"
import { formatDistanceToNowStrict } from "date-fns"

interface ConversationListProps {
  conversations: CoachConversationListItem[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  loading?: boolean
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  loading = false,
}: ConversationListProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="type-hud-rail text-muted-foreground">CHATS</span>
        <Button size="xs" variant="glass" onClick={onCreate} aria-label="Start new conversation">
          <Plus className="size-3.5" aria-hidden />
          <span>New</span>
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
        {loading && conversations.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            Loading conversations…
          </div>
        )}
        {!loading && conversations.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            No conversations yet. Start a new chat to talk to your coach.
          </div>
        )}
        {conversations.map((c) => {
          const isActive = c.id === activeId
          const ts = c.lastMessageAt ?? c.updatedAt
          const ago = ts
            ? formatDistanceToNowStrict(new Date(ts), { addSuffix: true })
            : ""
          return (
            <div
              key={c.id}
              className={cn(
                "group/chat relative rounded-xl border border-transparent transition-all",
                isActive
                  ? "border-primary/30 bg-primary/10"
                  : "hover:border-glass-border hover:bg-glass-highlight/20"
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <MessageSquare
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "truncate text-sm font-medium",
                      isActive ? "text-foreground" : "text-foreground/90"
                    )}
                  >
                    {c.title}
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <p className="line-clamp-1 flex-1 text-xs text-muted-foreground">
                      {c.lastMessagePreview || "No messages yet"}
                    </p>
                    {ago && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                        {ago}
                      </span>
                    )}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (
                    typeof window !== "undefined" &&
                    !window.confirm("Delete this conversation? This cannot be undone.")
                  ) {
                    return
                  }
                  onDelete(c.id)
                }}
                className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-lg text-muted-foreground/70 opacity-0 transition-all hover:bg-destructive/15 hover:text-destructive group-hover/chat:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-destructive/30"
                aria-label="Delete conversation"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
