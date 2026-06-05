"use client"

import type { ReactNode } from "react"
import { cn, glassPanelClass } from "@/lib/utils"

interface PageStatTileProps {
  className?: string
  children: ReactNode
}

/** Top-of-page summary tiles — default glass panel styling. */
export function PageStatTile({ className, children }: PageStatTileProps) {
  return (
    <div className={cn(glassPanelClass, "relative min-w-0 p-3 lg:p-4", className)}>
      {children}
    </div>
  )
}
