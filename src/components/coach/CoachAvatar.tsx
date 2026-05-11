"use client"

import { cn } from "@/lib/utils"
import { COACH_AVATAR_SRC } from "@/lib/coach/branding"

export function CoachAvatar({ className }: { className?: string }) {
  return (
    <img
      src={COACH_AVATAR_SRC}
      alt=""
      className={cn("object-cover", className)}
      width={256}
      height={256}
      decoding="async"
    />
  )
}
