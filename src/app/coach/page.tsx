"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  COACH_MODELS,
  DEFAULT_COACH_MODEL_ID,
  isValidCoachModelId,
} from "@/lib/coach/models"
import type {
  CoachAttachmentClient,
  CoachConversationDetail,
  CoachConversationListItem,
  CoachMessageClient,
} from "@/lib/coach/types"
import { cn } from "@/lib/utils"
import { CoachAvatar } from "@/components/coach/CoachAvatar"

const MODEL_STORAGE_KEY = "theGRID_coachModel"
const ACTIVE_CONVERSATION_STORAGE_PREFIX = "theGRID_coachActiveConversation_"

interface UIMessage extends CoachMessageClient {
  /** True while the SSE stream is appending to this assistant message. */
  streaming?: boolean
  /** Local-only, optimistically rendered before the server returns the real id. */
  optimistic?: boolean
}

function rememberModel(id: string) {
  try {
    if (typeof window !== "undefined") localStorage.setItem(MODEL_STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

function recallModel(): string {
  try {
    if (typeof window !== "undefined") {
      const v = localStorage.getItem(MODEL_STORAGE_KEY)
      if (v && isValidCoachModelId(v)) return v
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_COACH_MODEL_ID
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
  const [activeTitle, setActiveTitle] = useState<string>("AI Coach")
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modelId, setModelId] = useState<string>(DEFAULT_COACH_MODEL_ID)
  const [conversationsOpen, setConversationsOpen] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Persist/restore model picker.
  useEffect(() => {
    setModelId(recallModel())
  }, [])
  useEffect(() => {
    rememberModel(modelId)
  }, [modelId])

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
      setActiveTitle("AI Coach")
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
        setActiveTitle(data.title)
        if (data.defaultModelId && isValidCoachModelId(data.defaultModelId)) {
          setModelId(data.defaultModelId)
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
        body: JSON.stringify({ defaultModelId: modelId }),
      })
      if (!res.ok) throw new Error("Failed to create conversation")
      const conv = await res.json()
      await loadList()
      setActiveId(conv.id)
      setActiveTitle(conv.title)
      setMessages([])
      setConversationsOpen(false)
      return conv.id as string
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create conversation")
      return null
    }
  }, [modelId, loadList])

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
        modelId,
        tokensIn: 0,
        tokensOut: 0,
        createdAt: new Date().toISOString(),
        streaming: true,
        optimistic: true,
      }
      setMessages((cur) => [...cur, userMsg, assistantMsg])
      setSending(true)
      setError(null)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await apiFetch(
          `/api/coach/conversations/${conversationId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, modelId, attachments }),
            signal: controller.signal,
          }
        )
        if (!res.ok || !res.body) {
          const errBody = await res
            .json()
            .catch(() => ({ error: `Request failed (${res.status})` }))
          throw new Error(errBody?.error || `Request failed (${res.status})`)
        }

        // Pull any new title sent in headers.
        const titleHeader = res.headers.get("X-Coach-Title")
        if (titleHeader) {
          try {
            const decoded = decodeURIComponent(titleHeader)
            if (decoded) setActiveTitle(decoded)
          } catch {
            /* ignore malformed header */
          }
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
                const ev = JSON.parse(json)
                handleStreamEvent(ev)
              } catch {
                /* ignore unparseable line */
              }
            }
            idx = buffer.indexOf("\n\n")
          }
        }
      } catch (e) {
        if ((e as Error)?.name === "AbortError") {
          // Already handled in handleStop.
        } else {
          const msg = e instanceof Error ? e.message : "Send failed."
          setError(msg)
          // Remove the empty assistant placeholder on error.
          setMessages((cur) =>
            cur.map((m) =>
              m.id === tempAssistantId
                ? { ...m, streaming: false, content: m.content || "(no response)" }
                : m
            )
          )
        }
      } finally {
        abortRef.current = null
        setSending(false)
        // Refresh sidebar list (updates updatedAt + preview).
        void loadList()
      }

      function handleStreamEvent(ev: unknown) {
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
          setError(event.message)
        }
      }
    },
    [activeId, modelId, handleCreateConversation, loadList]
  )

  const headerSubtitle = useMemo(() => {
    if (!activeId) return "Pick a conversation or start a new chat."
    return COACH_MODELS[modelId]?.label
  }, [activeId, modelId])

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <PageHeader title="AI COACH" />

      <div className="flex flex-1 min-h-0 flex-col gap-4 md:flex-row">
        {/* Sidebar — always visible on md+, sheet on mobile */}
        <aside className="hidden md:flex md:w-72 md:shrink-0 md:flex-col">
          <div className="glass flex h-[calc(100dvh-16rem)] flex-col gap-3 rounded-2xl p-3">
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

        <section className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate font-heading text-lg font-medium">
                {activeTitle}
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {headerSubtitle}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 md:hidden">
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
          </div>

          <div
            className={cn(
              "glass relative flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-2xl p-3",
              "min-h-[calc(100dvh-22rem)]"
            )}
          >
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                {error}
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
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
              {messages.map((m) => (
                <ChatMessage
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  attachments={m.attachments}
                  modelId={m.modelId ?? undefined}
                  streaming={m.streaming}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>

            <ChatComposer
              modelId={modelId}
              onModelChange={setModelId}
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
        <h3 className="font-heading text-lg">Your AI Coach</h3>
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
