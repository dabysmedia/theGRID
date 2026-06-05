"use client"

import { cn } from "@/lib/utils"

/** Scroll clearance below page content so controls stay above the fixed bottom dock. */
export const PAGE_FOOTER_DOCK_CLEARANCE =
  "min-h-[calc(6.5rem+env(safe-area-inset-bottom,0px))]" as const

interface PageFooterProps {
  className?: string
  /** Show a subtle end-of-page rail (default on hub-style pages). */
  showRail?: boolean
}

export function PageFooter({ className, showRail = true }: PageFooterProps) {
  return (
    <footer
      role="contentinfo"
      className={cn("mt-10 shrink-0", className)}
      aria-label="Page end"
    >
      {showRail && (
        <div className="mb-4 flex items-center gap-2 px-1">
          <div className="hud-divider flex-1" />
          <span className="type-hud-eyebrow shrink-0 text-muted-foreground/35">END</span>
          <div className="hud-divider flex-1" />
        </div>
      )}
      <div className={PAGE_FOOTER_DOCK_CLEARANCE} aria-hidden />
    </footer>
  )
}
