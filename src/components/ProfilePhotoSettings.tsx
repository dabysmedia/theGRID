"use client"

import { useRef, useState, useCallback } from "react"
import { Camera, Trash2 } from "lucide-react"
import { UserProfileAvatar } from "@/components/ProfileSwitcher"
import { useUser, type UserProfile } from "@/context/UserContext"
import { apiFetch } from "@/lib/api-fetch"
import { cn } from "@/lib/utils"

export function ProfilePhotoSettings() {
  const { user, switchUser, refreshUsers } = useUser()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const onPickFile = useCallback(() => {
    setError("")
    inputRef.current?.click()
  }, [])

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file || !user) return
      setError("")
      setBusy(true)
      try {
        const fd = new FormData()
        fd.append("file", file)
        const res = await apiFetch("/api/users/avatar", { method: "POST", body: fd })
        const data = (await res.json()) as { error?: string; user?: UserProfile }
        if (res.ok && data.user) {
          switchUser({ ...data.user, mediaRev: Date.now() })
          await refreshUsers()
        } else {
          setError(data.error || "Upload failed")
        }
      } catch {
        setError("Network error")
      } finally {
        setBusy(false)
      }
    },
    [user, switchUser, refreshUsers]
  )

  const onRemove = useCallback(async () => {
    if (!user?.avatarUrl) return
    setError("")
    setBusy(true)
    try {
      const res = await apiFetch("/api/users/avatar", { method: "DELETE" })
      const data = (await res.json()) as { error?: string; user?: UserProfile }
      if (res.ok && data.user) {
        switchUser({ ...data.user })
        await refreshUsers()
      } else {
        setError(data.error || "Failed to remove")
      }
    } catch {
      setError("Network error")
    } finally {
      setBusy(false)
    }
  }, [user, switchUser, refreshUsers])

  if (!user) {
    return (
      <div className="glass hud-corners rounded-2xl p-6 lg:max-w-md">
        <p className="text-xs text-muted-foreground">
          Select a profile above to add a profile photo.
        </p>
      </div>
    )
  }

  return (
    <div className="glass hud-corners space-y-4 rounded-2xl p-6 lg:max-w-md">
      <div className="flex items-center gap-3">
        <Camera className="h-4 w-4 text-muted-foreground/60" />
        <h2 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">
          Profile photo
        </h2>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex shrink-0 justify-center sm:justify-start">
          <UserProfileAvatar user={user} size="lg" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs text-muted-foreground/85 leading-relaxed">
            JPEG, PNG, WebP, or GIF. Up to 5&nbsp;MB. Shown in the header and profile list.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={onFileChange}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onPickFile}
              disabled={busy}
              className={cn(
                "glass rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                "hover:bg-glass-highlight/40 disabled:opacity-50"
              )}
            >
              {busy ? "Working…" : "Choose image"}
            </button>
            {user.avatarUrl ? (
              <button
                type="button"
                onClick={onRemove}
                disabled={busy}
                className={cn(
                  "glass-subtle inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm",
                  "text-muted-foreground hover:text-foreground hover:bg-glass-highlight/25 disabled:opacity-50"
                )}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Remove
              </button>
            ) : null}
          </div>
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
        </div>
      </div>
    </div>
  )
}
