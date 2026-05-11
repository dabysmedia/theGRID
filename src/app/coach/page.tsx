"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MessagesSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import { PageHeader } from "@/components/PageHeader"
import { apiFetch } from "@/lib/api-fetch"
import { useUser } from "@/context/UserContext"
import { ChatComposer } from "@/components/coach/ChatComposer"
import { ChatMessage } from "@/components/coach/ChatMessage"
import { ConversationList } from "@/components/coach/ConversationList"
import {
  DEFAULT_COACH_TONE_ID,
  isValidCoachToneId,
  type CoachToneId,
} from "@/lib/coach/tones"
import type {
  CoachAttachmentClient,
  CoachConversationDetail,
  CoachConversationListItem,
  CoachMessageClient,
} from "@/lib/coach/types"
import { cn } from "@/lib/utils"
import { CoachAvatar } from "@/components/coach/CoachAvatar"

const TONE_STORAGE_KEY = "theGRID_coachTone"
const ACTIVE_CONVERSATION_STORAGE_PREFIX = "theGRID_coachActiveConversation_"

/** Browser IANA zone so the server aligns "today" with this device, not UTC. */
function readClientTimeZone(): string | undefined {
  try {
    if (typeof Intl === "undefined") return undefined
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return typeof tz === "string" && tz.length > 0 ? tz : undefined
  } catch {
    return undefined
  }
}

interface UIMessage extends CoachMessageClient {
  /** True while the SSE stream is appending to this assistant message. */
  streaming?: boolean
  /** Local-only, optimistically rendered before the server returns the real id. */
  optimistic?: boolean
}

function rememberTone(id: CoachToneId) {
  try {
    if (typeof window !== "undefined") localStorage.setItem(TONE_STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

function recallTone(): CoachToneId {
  try {
    if (typeof window !== "undefined") {
      const v = localStorage.getItem(TONE_STORAGE_KEY)
      if (v && isValidCoachToneId(v)) return v
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_COACH_TONE_ID
}

/** Per-user storage key — switching profile must not leak conversation ids. */
function activeConversationStorageKey(userId: string | undefined | null): string | null {
  if (!userId) return null
  return `${ACTIVE_CONVERSATION_STORAGE_PREFIX}${userId}`
}

function rememberActiveConversation(userId: string | undefined | null, id: string | null) {
  const key = activeConversationStorageKey(userId)
  if (!key || typeof window === "undefined") return
  try {
    if (id) localStorage.setItem(key, id)
    else localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

function recallActiveConversation(userId: string | undefined | null): string | null {
  const key = activeConversationStorageKey(userId)
  if (!key || typeof window === "undefined") return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export default function CoachPage() {
  const { user } = useUser()
  const [conversations, setConversations] = useState<CoachConversationListItem[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tone, setTone] = useState<CoachToneId>(DEFAULT_COACH_TONE_ID)
  const [conversationsOpen, setConversationsOpen] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Persist/restore tone selection (used as the default for new chats and
  // re-applied when no per-conversation tone is set yet).
  useEffect(() => {
    setTone(recallTone())
  }, [])
  useEffect(() => {
    rememberTone(tone)
  }, [tone])

  // Load conversations list (re-runs when user switches profile).
  const loadList = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await apiFetch("/api/coach/conversations", { cache: "no-store" })
      if (!res.ok) throw new Error("Failed to load conversations")
      const data: CoachConversationListItem[] = await res.json()
      setConversations(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load conversations")
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    if (!user?.id) return
    // Switching profile — drop the previous user's selection so the auto-resume
    // effect below picks the right thread for the new user once the list lands.
    setActiveId(null)
    void loadList()
  }, [user?.id, loadList])

  /**
   * Auto-resume the most recent (or last-opened) conversation once the list
   * loads, so the coach always picks up where the user left off. Creating a
   * new chat stays an explicit action via the "+ New" button.
   */
  useEffect(() => {
    if (loadingList) return
    if (activeId) {
      // If the currently-active id was deleted server-side, fall through to pick.
      if (conversations.some((c) => c.id === activeId)) return
    }
    if (conversations.length === 0) return
    const remembered = recallActiveConversation(user?.id)
    const resumeId =
      (remembered && conversations.find((c) => c.id === remembered)?.id) ||
      conversations[0].id
    setActiveId(resumeId)
  }, [loadingList, conversations, activeId, user?.id])

  // Persist whichever conversation the user is on so reopening the page resumes it.
  useEffect(() => {
    if (!user?.id) return
    rememberActiveConversation(user.id, activeId)
  }, [activeId, user?.id])

  // Load thread when active id changes.
  useEffect(() => {
    if (!activeId) {
      setMessages([])
      return
    }
    let cancelled = false
    setLoadingThread(true)
    void (async () => {
      try {
        const res = await apiFetch(`/api/coach/conversations/${activeId}`, {
          cache: "no-store",
        })
        if (!res.ok) throw new Error("Failed to load conversation")
        const data: CoachConversationDetail = await res.json()
        if (cancelled) return
        setMessages(data.messages.map((m) => ({ ...m })))
        if (data.defaultTone && isValidCoachToneId(data.defaultTone)) {
          setTone(data.defaultTone)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load conversation")
        }
      } finally {
        if (!cancelled) setLoadingThread(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeId])

  // Auto-scroll when new content arrives or the streaming reply grows.
  const lastMessageContent = messages[messages.length - 1]?.content ?? ""
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" })
    }
  }, [messages.length, lastMessageContent])

  const handleCreateConversation = useCallback(async (): Promise<string | null> => {
    try {
      const res = await apiFetch("/api/coach/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultTone: tone }),
      })
      if (!res.ok) throw new Error("Failed to create conversation")
      const conv = await res.json()
      await loadList()
      setActiveId(conv.id)
      setMessages([])
      setConversationsOpen(false)
      return conv.id as string
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create conversation")
      return null
    }
  }, [tone, loadList])

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        const res = await apiFetch(`/api/coach/conversations/${id}`, {
          method: "DELETE",
        })
        if (!res.ok) throw new Error("Failed to delete")
        if (activeId === id) {
          // Hop to the next available chat (auto-resume effect picks it up
          // once the list refresh completes); only land on the empty state
          // when there's truly nothing left.
          setActiveId(null)
          setMessages([])
        }
        await loadList()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete conversation")
      }
    },
    [activeId, loadList]
  )

  const handleSelectConversation = useCallback((id: string) => {
    setActiveId(id)
    setConversationsOpen(false)
  }, [])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setSending(false)
    // Mark any streaming message as no-longer-streaming so the cursor disappears.
    setMessages((cur) =>
      cur.map((m) => (m.streaming ? { ...m, streaming: false } : m))
    )
  }, [])

  /**
   * Apply a single SSE event from a coach stream to the optimistic assistant
   * placeholder identified by `tempAssistantId`. Shared between the regular
   * send flow and the regenerate flow so they stay in sync.
   */
  const applyStreamEvent = useCallback(
    (ev: unknown, tempAssistantId: string) => {
      if (!ev || typeof ev !== "object") return
      const event = ev as { type: string; [k: string]: unknown }
      if (event.type === "text" && typeof event.delta === "string") {
        const delta = event.delta
        setMessages((cur) =>
          cur.map((m) =>
            m.id === tempAssistantId ? { ...m, content: m.content + delta } : m
          )
        )
      } else if (event.type === "done") {
        const realId = String(event.messageId ?? "")
        setMessages((cur) =>
          cur.map((m) => {
            if (m.id === tempAssistantId) {
              return {
                ...m,
                id: realId || m.id,
                streaming: false,
                optimistic: false,
                tokensIn: typeof event.tokensIn === "number" ? event.tokensIn : 0,
                tokensOut: typeof event.tokensOut === "number" ? event.tokensOut : 0,
                modelId:
                  typeof event.modelId === "string" ? event.modelId : m.modelId,
              }
            }
            return m
          })
        )
      } else if (event.type === "error" && typeof event.message === "string") {
        // Surface the error both as a top-of-chat banner *and* inline in the
        // empty assistant bubble — otherwise the user sees only a frozen
        // typing cursor with no feedback about what went wrong.
        setError(event.message)
        setMessages((cur) =>
          cur.map((m) =>
            m.id === tempAssistantId
              ? {
                  ...m,
                  streaming: false,
                  role: "system",
                  content:
                    m.content && m.content.trim().length > 0
                      ? `${m.content}\n\n⚠️ ${event.message}`
                      : `⚠️ ${event.message}`,
                }
              : m
          )
        )
      }
    },
    []
  )

  /**
   * Drive a single coach SSE request end-to-end: opens the stream, parses
   * `data: {…}` blocks, and updates the optimistic assistant placeholder via
   * `applyStreamEvent`. Both /messages and /regenerate go through this so the
   * client only has to know about *one* protocol.
   */
  const runCoachStream = useCallback(
    async (opts: {
      url: string
      body: Record<string, unknown>
      tempAssistantId: string
    }) => {
      setSending(true)
      setError(null)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const tz = readClientTimeZone()
        const payload = {
          ...opts.body,
          ...(tz ? { clientTimeZone: tz } : {}),
        }
        const res = await apiFetch(opts.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
        if (!res.ok || !res.body) {
          const errBody = await res
            .json()
            .catch(() => ({ error: `Request failed (${res.status})` }))
          throw new Error(errBody?.error || `Request failed (${res.status})`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let idx = buffer.indexOf("\n\n")
          while (idx !== -1) {
            const block = buffer.slice(0, idx).trim()
            buffer = buffer.slice(idx + 2)
            if (block.startsWith("data:")) {
              const json = block.slice(5).trim()
              try {
                applyStreamEvent(JSON.parse(json), opts.tempAssistantId)
              } catch {
                /* ignore unparseable line */
              }
            }
            idx = buffer.indexOf("\n\n")
          }
        }
      } catch (e) {
        if ((e as Error)?.name === "AbortError") {
          // handleStop already cleared streaming state.
        } else {
          const msg = e instanceof Error ? e.message : "Request failed."
          setError(msg)
          setMessages((cur) =>
            cur.map((m) =>
              m.id === opts.tempAssistantId
                ? { ...m, streaming: false, content: m.content || "(no response)" }
                : m
            )
          )
        }
      } finally {
        abortRef.current = null
        setSending(false)
        void loadList()
      }
    },
    [applyStreamEvent, loadList]
  )

  const handleSubmit = useCallback(
    async ({
      text,
      attachments,
    }: {
      text: string
      attachments: CoachAttachmentClient[]
    }) => {
      let conversationId = activeId
      if (!conversationId) {
        conversationId = await handleCreateConversation()
        if (!conversationId) return
      }

      const tempUserId = `local-user-${Date.now()}`
      const tempAssistantId = `local-asst-${Date.now()}`
      const userMsg: UIMessage = {
        id: tempUserId,
        role: "user",
        content: text,
        attachments,
        modelId: null,
        tokensIn: 0,
        tokensOut: 0,
        createdAt: new Date().toISOString(),
        optimistic: true,
      }
      const assistantMsg: UIMessage = {
        id: tempAssistantId,
        role: "assistant",
        content: "",
        attachments: [],
        modelId: null,
        tokensIn: 0,
        tokensOut: 0,
        createdAt: new Date().toISOString(),
        streaming: true,
        optimistic: true,
      }
      setMessages((cur) => [...cur, userMsg, assistantMsg])

      await runCoachStream({
        url: `/api/coach/conversations/${conversationId}/messages`,
        body: { text, tone, attachments },
        tempAssistantId,
      })
    },
    [activeId, tone, handleCreateConversation, runCoachStream]
  )

  /**
   * Re-run the most recent user prompt: drop the trailing assistant/system
   * bubble locally, replace it with a streaming placeholder, and ask the
   * server to delete + regenerate. The user message itself is untouched.
   */
  const handleRegenerate = useCallback(async () => {
    if (!activeId || sending) return

    // Trim trailing non-user rows (the previous assistant reply, plus any
    // inline error bubble appended on a prior failure). We compute this off
    // the captured state snapshot instead of inside a setMessages updater so
    // the validity check can happen synchronously — React queues updater
    // bodies, which previously caused us to bail before firing the request.
    const trimmed = [...messages]
    while (trimmed.length > 0 && trimmed[trimmed.length - 1].role !== "user") {
      trimmed.pop()
    }
    if (trimmed.length === 0 || trimmed[trimmed.length - 1].role !== "user") {
      setError("Nothing to regenerate — send a message first.")
      return
    }

    const tempAssistantId = `local-asst-regen-${Date.now()}`
    const placeholder: UIMessage = {
      id: tempAssistantId,
      role: "assistant",
      content: "",
      attachments: [],
      modelId: null,
      tokensIn: 0,
      tokensOut: 0,
      createdAt: new Date().toISOString(),
      streaming: true,
      optimistic: true,
    }
    setMessages([...trimmed, placeholder])

    await runCoachStream({
      url: `/api/coach/conversations/${activeId}/regenerate`,
      body: { tone },
      tempAssistantId,
    })
  }, [activeId, sending, messages, tone, runCoachStream])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <PageHeader title="Coach" />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden md:flex-row md:items-stretch">
        {/* Sidebar — always visible on md+, sheet on mobile */}
        <aside className="hidden min-h-0 overflow-hidden md:flex md:w-72 md:shrink-0 md:flex-col">
          <div className="glass flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-2xl p-3">
            <ConversationList
              conversations={conversations}
              activeId={activeId}
              onSelect={handleSelectConversation}
              onCreate={() => void handleCreateConversation()}
              onDelete={handleDeleteConversation}
              loading={loadingList}
            />
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex shrink-0 justify-end md:hidden">
            <Sheet open={conversationsOpen} onOpenChange={setConversationsOpen}>
              <SheetTrigger
                render={
                  <Button variant="outline" size="sm" aria-label="Open conversations">
                    <MessagesSquare className="size-4" aria-hidden />
                    Chats
                  </Button>
                }
              />
              <SheetContent side="left" className="w-80 max-w-[85vw] p-3">
                <ConversationList
                  conversations={conversations}
                  activeId={activeId}
                  onSelect={handleSelectConversation}
                  onCreate={() => void handleCreateConversation()}
                  onDelete={handleDeleteConversation}
                  loading={loadingList}
                />
              </SheetContent>
            </Sheet>
          </div>

          {/* Messages — grows to fill space above the composer */}
          <div
            className={cn(
              "glass relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl p-3"
            )}
          >
            {error && (
              <div className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                {error}
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-y-contain pr-1">
              {/*
                Empty state only appears when the user truly has zero
                conversations. Returning users auto-resume their last chat,
                so this never flickers between page loads.
              */}
              {!loadingList && !activeId && conversations.length === 0 && (
                <EmptyState onStart={() => void handleCreateConversation()} />
              )}
              {(loadingThread || (loadingList && !activeId && conversations.length === 0)) && (
                <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                  {loadingList ? "Loading conversations…" : "Loading thread…"}
                </div>
              )}
              {activeId && !loadingThread && messages.length === 0 && (
                <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                  Send your first message to get started.
                </div>
              )}
              {messages.map((m, i) => {
                // Only the *last* assistant/system bubble shows a regenerate
                // affordance, and only when nothing is currently streaming.
                const isLast = i === messages.length - 1
                const canRegenerate =
                  isLast &&
                  !sending &&
                  !m.streaming &&
                  (m.role === "assistant" || m.role === "system") &&
                  messages.some((x) => x.role === "user")
                return (
                  <ChatMessage
                    key={m.id}
                    role={m.role}
                    content={m.content}
                    attachments={m.attachments}
                    streaming={m.streaming}
                    onRegenerate={canRegenerate ? handleRegenerate : undefined}
                    regenerateDisabled={sending}
                  />
                )
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div
            className={cn(
              "shrink-0 -mx-0.5 px-0.5 pt-1",
              "bg-gradient-to-t from-background from-85% via-background/95 to-transparent pb-0.5",
              "supports-[backdrop-filter]:backdrop-blur-[2px]"
            )}
          >
            <ChatComposer
              tone={tone}
              onToneChange={setTone}
              onSubmit={handleSubmit}
              busy={sending}
              onStop={handleStop}
              placeholder={
                activeId
                  ? "Ask your coach anything…"
                  : "Type a message — a new chat will start."
              }
            />
          </div>
        </section>
      </div>
    </div>
  )
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="glass flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl">
        <CoachAvatar className="size-14" />
      </div>
      <div className="space-y-1">
        <h3 className="font-heading text-lg">Coach</h3>
        <p className="max-w-md text-sm text-muted-foreground">
          Ask about training, nutrition, recovery, sleep, or motivation. The
          coach can see your recent stats from theGRID. For meal-photo calorie
          estimates, use the camera button inside the Log food dialog on the
          Calories page.
        </p>
      </div>
      <Button variant="glass" onClick={onStart}>
        Start a chat
      </Button>
    </div>
  )
}
