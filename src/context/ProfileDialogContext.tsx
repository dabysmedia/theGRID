"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useUser } from "@/context/UserContext"
import { isAgentPublicPath } from "@/lib/agent/public-routes"
import { ProfileSwitcher, UserProfileAvatar } from "@/components/ProfileSwitcher"
import { usePathname } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { UserCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProfileDialogContextValue {
  openProfile: () => void
}

const ProfileDialogContext = createContext<ProfileDialogContextValue | null>(null)

export function useProfileDialog(): ProfileDialogContextValue {
  const ctx = useContext(ProfileDialogContext)
  if (!ctx) throw new Error("useProfileDialog must be used within ProfileDialogProvider")
  return ctx
}

export function ProfileDialogProvider({ children }: { children: ReactNode }) {
  const { user, users, loading } = useUser()
  const pathname = usePathname()
  const agentPublic = isAgentPublicPath(pathname)
  const [open, setOpen] = useState(false)

  const openProfile = useCallback(() => setOpen(true), [])

  useEffect(() => {
    if (user) setOpen(false)
  }, [user])

  useEffect(() => {
    if (agentPublic) {
      setOpen(false)
      return
    }
    if (loading || user) return
    if (users.length === 0 || users.length > 1) setOpen(true)
  }, [loading, user, users, agentPublic])

  const value = useMemo(() => ({ openProfile }), [openProfile])

  return (
    <ProfileDialogContext value={value}>
      {children}
      <Dialog open={!agentPublic && open} onOpenChange={setOpen}>
        <DialogContent className="glass-frost max-h-[min(32rem,85dvh)] max-w-md w-[calc(100vw-2rem)] flex flex-col overflow-hidden sm:w-full">
          <DialogHeader>
            <DialogTitle className="text-lg tracking-tight">
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
    </ProfileDialogContext>
  )
}

export function ProfileHeaderTrigger({ className }: { className?: string }) {
  const { openProfile } = useProfileDialog()
  const { user } = useUser()

  return (
    <button
      type="button"
      onClick={openProfile}
      aria-haspopup="dialog"
      className={cn(
        "mt-1.5 flex shrink-0 items-center justify-center rounded-full ring-1 transition-all duration-150 sm:mt-1",
        "min-h-10 min-w-10",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        user
          ? "p-1 ring-border/50 hover:ring-primary/35 press-scale"
          : "ring-primary/40 bg-glass-highlight/25 hover:bg-glass-highlight/40",
        className
      )}
      aria-label={user ? `${user.name}, switch profile` : "Choose a profile"}
      title={user ? `${user.name} — switch profile` : "Choose a profile"}
    >
      {user ? (
        <UserProfileAvatar user={user} size="sm" />
      ) : (
        <UserCircle className="size-6 text-muted-foreground" aria-hidden />
      )}
    </button>
  )
}
