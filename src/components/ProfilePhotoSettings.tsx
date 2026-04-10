"use client"

import { useCallback, useRef, useState } from "react"
import { Camera, Trash2 } from "lucide-react"
import { useUser } from "@/context/UserContext"
import { apiFetch } from "@/lib/api-fetch"
import { UserProfileAvatar } from "@/components/ProfileSwitcher"
import { cn } from "@/lib/utils"

export function ProfilePhotoSettings() {
  const { user, switchUser, refreshUsers } = useUser()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  const onPick = useCallback(() => {
    setMessage("")
    inputRef.current?.click()
  }, [])

  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file || !user) return
      setBusy(true)
      setMessage("")
      try {
        const fd = new FormData()
        fd.set("file", file)
        const res = await apiFetch("/api/users/avatar", { method: "POST", body: fd })
        const data = await res.json()
        if (!res.ok) {
          setMessage(data.error || "Upload failed")
          return
        }
        if (data.user) {
          switchUser(data.user)
          await refreshUsers()
        }
      } catch {
        setMessage("Network error")
      } finally {
        setBusy(false)
      }
    },
    [user, switchUser, refreshUsers]
  )

  const onRemove = useCallback(async () => {
    if (!user?.avatarUrl) return
    setBusy(true)
    setMessage("")
    try {
      const res = await apiFetch("/api/users/avatar", { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error || "Remove failed")
        return
      }
      if (data.user) {
        switchUser(data.user)
        await refreshUsers()
      }
    } catch {
      setMessage("Network error")
    } finally {
      setBusy(false)
    }
  }, [user?.avatarUrl, switchUser, refreshUsers])

  if (!user) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-1">
        <Camera className="h-4 w-4 text-muted-foreground/60" />
        <h2 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">
          Profile photo
        </h2>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <UserProfileAvatar user={user} size="lg" />
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onFile}
          />
          <button
            type="button"
            onClick={onPick}
            disabled={busy}
            className={cn(
              "glass rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              busy ? "opacity-50" : "hover:bg-glass-highlight/40"
            )}
          >
            {busy ? "…" : "Change photo"}
          </button>
          {user.avatarUrl && (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="glass-subtle flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          )}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground/70 tracking-wide">
        JPEG, PNG, or WebP. Up to 5 MB.
      </p>
      {message && <p className="text-xs text-red-400">{message}</p>}
    </div>
  )
}
