"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function GlassChip({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <Button
      type="button"
      variant={selected ? "glass" : "outline"}
      size="sm"
      onClick={onClick}
      className={cn(
        "type-hud-chip font-sans normal-case tracking-normal",
        !selected && "border-border/50 bg-background/30 text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {children}
    </Button>
  )
}
