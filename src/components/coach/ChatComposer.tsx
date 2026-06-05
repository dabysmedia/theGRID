"use client"

import { useCallback, useRef, useState } from "react"
import { Paperclip, Send, X, StopCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import type { CoachAttachmentClient } from "@/lib/coach/types"
import type { CoachToneId } from "@/lib/coach/tones"
import { TonePicker } from "./TonePicker"

interface ChatComposerProps {
  tone: CoachToneId
  onToneChange: (id: CoachToneId) => void
  onSubmit: (payload: {
    text: string
    attachments: CoachAttachmentClient[]
  }) => Promise<void> | void
  /** When true, submit is disabled (request in flight). */
  busy?: boolean
  /** When provided, an inline "Stop" button calls this to abort the running stream. */
  onStop?: () => void
  /** Hint shown above the textarea on first load. */
  placeholder?: string
}

export function ChatComposer({
  tone,
  onToneChange,
  onSubmit,
  busy = false,
  onStop,
  placeholder = "Ask your coach anything…",
}: ChatComposerProps) {
  const [text, setText] = useState("")
  const [attachments, setAttachments] = useState<CoachAttachmentClient[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const canSubmit = !busy && (text.trim().length > 0 || attachments.length > 0)

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      setUploading(true)
      try {
        const fd = new FormData()
        fd.append("file", file)
        const res = await apiFetch("/api/coach/uploads", {
          method: "POST",
          body: fd,
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || "Upload failed.")
        setAttachments((cur) => [
          ...cur,
          {
            kind: "image",
            path: data.url,
            mime: data.mime ?? file.type,
            name: data.name ?? file.name,
          },
        ])
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.")
      } finally {
        setUploading(false)
      }
    },
    []
  )

  const handleRemoveAttachment = useCallback(
    async (path: string) => {
      setAttachments((cur) => cur.filter((a) => a.path !== path))
      try {
        await apiFetch(`/api/coach/uploads?url=${encodeURIComponent(path)}`, {
          method: "DELETE",
        })
      } catch {
        /* best-effort */
      }
    },
    []
  )

  const submit = useCallback(async () => {
    if (!canSubmit) return
    const t = text.trim()
    const att = attachments
    setText("")
    setAttachments([])
    setError(null)
    try {
      await onSubmit({ text: t, attachments: att })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send.")
      // Restore the message so the user doesn't lose it on error.
      setText(t)
      setAttachments(att)
    }
  }, [canSubmit, text, attachments, onSubmit])

  return (
    <div className="glass-panel relative flex flex-col gap-2 border border-glass-border p-3 shadow-lg shadow-black/30">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div
              key={a.path}
              className="group/att relative overflow-hidden rounded-lg border border-glass-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.path}
                alt={a.name ?? "Attachment"}
                className="block h-16 w-16 object-cover"
              />
              <button
                type="button"
                onClick={() => handleRemoveAttachment(a.path)}
                className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-all group-hover/att:opacity-100 focus-visible:opacity-100"
                aria-label="Remove attachment"
              >
                <X className="size-3" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void submit()
          }
        }}
        placeholder={placeholder}
        rows={2}
        className={cn(
          "min-h-[3.25rem] w-full resize-none rounded-xl border border-glass-border bg-glass-highlight/30 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60",
          "focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
        )}
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ""
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach a photo"
          title="Attach a photo (e.g. of your meal)"
        >
          <Paperclip className="size-4" aria-hidden />
        </Button>

        <TonePicker value={tone} onChange={onToneChange} disabled={busy} />

        <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground/60 sm:inline">
          Cmd/Ctrl + Enter
        </span>

        <div className="ml-auto flex items-center gap-2">
          {busy && onStop && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onStop}
              aria-label="Stop generating"
            >
              <StopCircle className="size-4" aria-hidden />
              Stop
            </Button>
          )}
          <Button
            type="button"
            variant="glass"
            size="sm"
            disabled={!canSubmit}
            onClick={() => void submit()}
            aria-label="Send message"
          >
            <Send className="size-4" aria-hidden />
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}
