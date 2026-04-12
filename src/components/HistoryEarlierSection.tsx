"use client"

import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

type HistoryEarlierSectionProps = {
  /** Number of distinct earlier days inside the disclosure */
  dayCount: number
  children: React.ReactNode
  className?: string
}

/** Collapsible wrapper for non-today history days (native details element). */
export function HistoryEarlierSection({
  dayCount,
  children,
  className,
}: HistoryEarlierSectionProps) {
  if (dayCount === 0) return null
  return (
    <details
      className={cn(
        "group/hist-earlier rounded-2xl border border-glass-border/30 bg-glass-highlight/[0.04] overflow-hidden",
        "[&[open]_summary_.hist-earlier-chevron]:rotate-180",
        className
      )}
    >
      <summary className="cursor-pointer list-none px-3 py-2.5 flex items-center justify-between gap-2 transition-colors hover:bg-glass-highlight/15 [&::-webkit-details-marker]:hidden">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Earlier days
          <span className="ml-1.5 font-medium tabular-nums text-muted-foreground/60">
            ({dayCount})
          </span>
        </span>
        <ChevronDown className="hist-earlier-chevron h-4 w-4 shrink-0 text-muted-foreground/45 transition-transform duration-200" />
      </summary>
      <div className="border-t border-glass-border/25 px-1 pb-2 pt-2 space-y-3">{children}</div>
    </details>
  )
}

export function HistoryArchivedNote({
  archivedDayCount,
  className,
}: {
  archivedDayCount: number
  className?: string
}) {
  if (archivedDayCount <= 0) return null
  return (
    <p
      className={cn(
        "text-[10px] leading-relaxed text-muted-foreground/70 px-1",
        className
      )}
    >
      {archivedDayCount} older day{archivedDayCount === 1 ? "" : "s"} are not listed here. They still
      count toward Stats and trends.
    </p>
  )
}
