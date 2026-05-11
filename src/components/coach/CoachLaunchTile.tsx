"use client"

import Link from "next/link"
import { ArrowRight, Camera } from "lucide-react"
import { cn } from "@/lib/utils"
import { CoachAvatar } from "@/components/coach/CoachAvatar"

interface CoachLaunchTileProps {
  className?: string
}

/**
 * Compact entry point for the AI Coach. Designed to live in the home dashboard
 * between primary widgets — uses the same `glass` look as `Card` but lays out
 * inline so it doesn't occupy a full square in the SYSTEMS grid.
 */
export function CoachLaunchTile({ className }: CoachLaunchTileProps) {
  return (
    <Link
      href="/coach"
      className={cn(
        "glass group/coach relative flex items-center gap-3 overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-transparent to-transparent px-4 py-3 transition-all hover:border-primary/45 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        className
      )}
      aria-label="Open AI Coach"
    >
      <span className="flex size-10 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-muted/20">
        <CoachAvatar className="size-10" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-heading text-sm font-medium text-foreground">
            AI Coach
          </span>
          <span className="text-[10px] uppercase tracking-wider text-primary/80">
            New
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          Ask anything · snap a meal photo for a calorie estimate
        </p>
      </div>
      <span className="hidden items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground sm:flex">
        <Camera className="size-3" aria-hidden />
        Photo
      </span>
      <ArrowRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/coach:translate-x-0.5 group-hover/coach:text-primary"
        aria-hidden
      />
    </Link>
  )
}
