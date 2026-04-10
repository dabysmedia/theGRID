"use client"

import { useMemo, useState } from "react"
import { Users, Lock, UserPlus } from "lucide-react"
import { useUserContext } from "@/context/UserContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

const COLOR_OPTIONS = ["#22c55e", "#3b82f6", "#a855f7", "#f59e0b", "#ef4444", "#14b8a6"]

export function UserSwitcher() {
  const { users, activeUserId, activeUser, loading, unlockAndSwitchUser, createUser } = useUserContext()
  const [pinByUser, setPinByUser] = useState<Record<string, string>>({})
  const [createName, setCreateName] = useState("")
  const [createPin, setCreatePin] = useState("")
  const [createColor, setCreateColor] = useState(COLOR_OPTIONS[0])
  const [addUserOpen, setAddUserOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  )

  async function handleUnlock(userId: string) {
    const pin = (pinByUser[userId] ?? "").trim()
    if (!/^\d{4}$/.test(pin)) {
      setError("PIN must be exactly 4 digits.")
      return
    }

    setBusyAction(`unlock:${userId}`)
    setError(null)
    try {
      await unlockAndSwitchUser(userId, pin)
      setPinByUser((prev) => ({ ...prev, [userId]: "" }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to switch user.")
    } finally {
      setBusyAction(null)
    }
  }

  async function handleCreate() {
    const name = createName.trim()
    const pin = createPin.trim()
    if (!name) {
      setError("Name is required.")
      return
    }
    if (!/^\d{4}$/.test(pin)) {
      setError("PIN must be exactly 4 digits.")
      return
    }
    setBusyAction("create")
    setError(null)
    try {
      await createUser({ name, pin, avatarColor: createColor })
      setCreateName("")
      setCreatePin("")
      setAddUserOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user.")
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <section className="glass hud-corners space-y-4 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="font-iceberg text-lg tracking-[0.12em] uppercase text-gradient-glass">
            Users
          </h3>
        </div>
        <Button
          variant="glass"
          size="sm"
          onClick={() => {
            setError(null)
            setAddUserOpen(true)
          }}
        >
          <UserPlus className="size-3.5" />
          Add user
        </Button>
      </div>

      <div className="space-y-3">
        {loading && <p className="text-xs text-muted-foreground">Loading profiles...</p>}
        {!loading &&
          sortedUsers.map((user) => {
            const isActive = user.id === activeUserId
            const unlocking = busyAction === `unlock:${user.id}`
            return (
              <div
                key={user.id}
                className="rounded-xl border border-border/35 bg-muted/20 px-3 py-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: user.avatarColor }}
                      aria-hidden
                    />
                    <span className="truncate text-sm font-medium">{user.name}</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {user.name === "Carlos" ? "ADMIN" : isActive ? "Active" : "Locked"}
                  </span>
                </div>

                {!isActive && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      placeholder="PIN"
                      value={pinByUser[user.id] ?? ""}
                      onChange={(e) =>
                        setPinByUser((prev) => ({ ...prev, [user.id]: e.target.value }))
                      }
                      className="h-9"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnlock(user.id)}
                      disabled={unlocking}
                    >
                      <Lock className="size-3.5" />
                      {unlocking ? "..." : "Unlock"}
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
      </div>

      <div className="rounded-lg border border-border/35 bg-muted/15 px-3 py-2 text-[11px] text-muted-foreground">
        Active: <span className="font-medium text-foreground">{activeUser?.name ?? "None"}</span>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <Dialog open={addUserOpen} onOpenChange={(open: boolean) => setAddUserOpen(open)}>
        <DialogContent className="inset-0 m-auto h-fit max-w-md">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-user-name" className="text-xs">Name</Label>
              <Input
                id="new-user-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Enter name"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-user-pin" className="text-xs">4-digit PIN</Label>
              <Input
                id="new-user-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={createPin}
                onChange={(e) => setCreatePin(e.target.value)}
                placeholder="0000"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Color</Label>
              <div className="flex gap-2">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Select ${color}`}
                    onClick={() => setCreateColor(color)}
                    className={`size-5 rounded-full border ${createColor === color ? "ring-2 ring-primary/60" : "ring-0"}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-row">
            <Button variant="outline" className="flex-1" onClick={() => setAddUserOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="glass"
              className="flex-1"
              onClick={handleCreate}
              disabled={busyAction === "create"}
            >
              {busyAction === "create" ? "Creating..." : "Create user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

