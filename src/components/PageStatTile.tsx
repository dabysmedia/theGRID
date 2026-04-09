"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PageStatTileProps {
  className?: string
  children: ReactNode
}

/** Top-of-page summary tiles — frosted glass, no category tint or HUD brackets. */
export function PageStatTile({ className, children }: PageStatTileProps) {
  return (
    <div className={cn("glass relative min-w-0 overflow-hidden rounded-2xl p-3 lg:p-4", className)}>
      {children}
    </div>
  )
}
