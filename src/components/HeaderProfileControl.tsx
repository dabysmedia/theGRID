"use client"

import { useEffect, useState } from "react"
import { useUser } from "@/context/UserContext"
import { ProfileSwitcher, UserProfileAvatar } from "@/components/ProfileSwitcher"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { UserCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export function HeaderProfileControl() {
  const { user, users, loading } = useUser()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (user) setOpen(false)
  }, [user])

  useEffect(() => {
    if (loading || user) return
    if (users.length === 0 || users.length > 1) setOpen(true)
  }, [loading, user, users])

  return (
    <>
      <div className="pointer-events-auto absolute z-50 top-[max(0.35rem,calc(env(safe-area-inset-top,0px)+0.35rem))] end-0 sm:end-1 md:end-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            "flex items-center justify-center rounded-full ring-1 transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            user
              ? "ring-border/50 hover:ring-primary/35 press-scale"
              : "size-10 ring-primary/40 bg-glass-highlight/25 hover:bg-glass-highlight/40"
          )}
          aria-label={user ? `${user.name}, switch profile` : "Choose a profile"}
          title={user ? `${user.name} — switch profile` : "Choose a profile"}
        >
          {user ? (
            <span className="p-1">
              <UserProfileAvatar user={user} size="sm" />
            </span>
          ) : (
            <UserCircle className="size-6 text-muted-foreground" aria-hidden />
          )}
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-frost max-h-[min(32rem,85dvh)] max-w-md w-[calc(100vw-2rem)] flex flex-col overflow-hidden sm:w-full">
          <DialogHeader>
            <DialogTitle className="font-iceberg text-lg tracking-tight">
              {user ? "Profiles" : "Pick your profile"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {user
                ? "Switch who is signed in on this device, or add someone new."
                : "Select a profile to load your data, or create one to get started."}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto pe-1">
            <ProfileSwitcher />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
