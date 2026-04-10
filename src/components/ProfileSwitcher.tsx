"use client"

import { useState, useCallback } from "react"
import { useUser, type UserProfile } from "@/context/UserContext"
import { Plus, Lock, Check, UserCircle } from "lucide-react"
import { cn } from "@/lib/utils"

function Avatar({ user, size = "md" }: { user: UserProfile; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "lg" ? "w-14 h-14 text-xl" : size === "md" ? "w-10 h-10 text-base" : "w-8 h-8 text-sm"
  return (
    <div
      className={cn("rounded-full flex items-center justify-center font-bold text-white shrink-0", sizeClass)}
      style={{ backgroundColor: user.avatarColor }}
    >
      {user.name.charAt(0).toUpperCase()}
    </div>
  )
}

export function ProfileSwitcher() {
  const { user, users, switchUser, refreshUsers } = useUser()
  const [pinPrompt, setPinPrompt] = useState<UserProfile | null>(null)
  const [pin, setPin] = useState("")
  const [pinError, setPinError] = useState("")
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPin, setNewPin] = useState("")
  const [createError, setCreateError] = useState("")

  const handleSelect = useCallback(
    async (u: UserProfile) => {
      if (u.id === user?.id) return
      setPinError("")
      setPin("")
      setPinPrompt(u)
    },
    [user]
  )

  const handleUnlock = useCallback(async () => {
    if (!pinPrompt) return
    try {
      const res = await fetch("/api/users/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: pinPrompt.id, pin }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        switchUser(data.user)
        setPinPrompt(null)
        setPin("")
      } else {
        setPinError(data.error || "Wrong PIN")
      }
    } catch {
      setPinError("Network error")
    }
  }, [pinPrompt, pin, switchUser])

  const handleCreate = useCallback(async () => {
    setCreateError("")
    const name = newName.trim()
    if (!name) { setCreateError("Name is required"); return }
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pin: newPin || undefined }),
      })
      const data = await res.json()
      if (res.ok) {
        await refreshUsers()
        switchUser(data)
        setCreating(false)
        setNewName("")
        setNewPin("")
      } else {
        setCreateError(data.error || "Failed")
      }
    } catch {
      setCreateError("Network error")
    }
  }, [newName, newPin, refreshUsers, switchUser])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <UserCircle className="h-4 w-4 text-muted-foreground/60" />
        <h2 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">
          Profiles
        </h2>
      </div>

      <div className="space-y-2">
        {users.map((u) => {
          const isActive = u.id === user?.id
          return (
            <button
              key={u.id}
              onClick={() => handleSelect(u)}
              className={cn(
                "glass w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-150",
                isActive
                  ? "ring-1 ring-primary/40 bg-primary/5"
                  : "hover:bg-glass-highlight/30 press-scale"
              )}
            >
              <Avatar user={u} />
              <span className="flex-1 font-medium text-sm tracking-wide">{u.name}</span>
              {isActive && <Check className="h-4 w-4 text-primary" />}
            </button>
          )
        })}
      </div>

      {pinPrompt && (
        <div className="glass rounded-xl p-4 space-y-3 animate-fade-up">
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Enter PIN for <strong>{pinPrompt.name}</strong>
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pin}
              onChange={(e) => { setPin(e.target.value); setPinError("") }}
              onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
              placeholder="PIN"
              autoFocus
              className="flex-1 glass-subtle rounded-lg px-3 py-2 text-sm bg-transparent outline-none focus:ring-1 focus:ring-primary/40"
            />
            <button
              onClick={handleUnlock}
              className="glass rounded-lg px-4 py-2 text-sm font-medium hover:bg-glass-highlight/40 transition-colors"
            >
              Unlock
            </button>
            <button
              onClick={() => { setPinPrompt(null); setPin(""); setPinError("") }}
              className="glass-subtle rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
          {pinError && <p className="text-xs text-red-400">{pinError}</p>}
        </div>
      )}

      {creating ? (
        <div className="glass rounded-xl p-4 space-y-3 animate-fade-up">
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
            New Profile
          </p>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            autoFocus
            className="w-full glass-subtle rounded-lg px-3 py-2 text-sm bg-transparent outline-none focus:ring-1 focus:ring-primary/40"
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            placeholder="PIN (optional, 4-8 digits)"
            className="w-full glass-subtle rounded-lg px-3 py-2 text-sm bg-transparent outline-none focus:ring-1 focus:ring-primary/40"
          />
          {createError && <p className="text-xs text-red-400">{createError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="glass rounded-lg px-4 py-2 text-sm font-medium hover:bg-glass-highlight/40 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => { setCreating(false); setNewName(""); setNewPin(""); setCreateError("") }}
              className="glass-subtle rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="glass-subtle w-full flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground/80 hover:text-foreground hover:bg-glass-highlight/25 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Profile
        </button>
      )}
    </div>
  )
}
