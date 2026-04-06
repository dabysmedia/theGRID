"use client"

import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { MiniChart } from "./MiniChart"
import { cn } from "@/lib/utils"
import { ChevronRight } from "lucide-react"

interface DailySummaryCardProps {
  title: string
  value: string | number
  goal?: string | number
  unit?: string
  icon: LucideIcon
  href: string
  chartData: { value: number }[]
  color?: string
}

export function DailySummaryCard({
  title,
  value,
  goal,
  unit,
  icon: Icon,
  href,
  chartData,
  color = "oklch(0.82 0.18 110)",
}: DailySummaryCardProps) {
  const numericValue = typeof value === "string" ? parseFloat(value) || 0 : value
  const numericGoal = goal
    ? typeof goal === "string"
      ? parseFloat(goal) || 0
      : goal
    : null

  const progress =
    numericGoal && numericGoal > 0
      ? Math.min((numericValue / numericGoal) * 100, 100)
      : null

  return (
    <Link href={href} className="group flex h-full min-h-0">
      <div
        className="glass hud-corners flex h-full min-h-0 w-full flex-col p-3 sm:p-4 press-scale hover:bg-glass-highlight/40 hover:shadow-lg hover:shadow-black/10 cursor-pointer relative overflow-hidden transition-[background-color,box-shadow] duration-200"
        style={{ borderRadius: "4px" }}
      >
        <div
          className="absolute top-0 right-0 w-24 h-24 opacity-[0.03] -translate-y-8 translate-x-8"
          style={{ backgroundColor: color }}
        />

        <div className="flex shrink-0 items-center justify-between gap-1 mb-2">
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="flex shrink-0 items-center justify-center w-7 h-7"
              style={{ backgroundColor: `${color}18`, borderRadius: "3px" }}
            >
              <Icon className="h-3.5 w-3.5" style={{ color }} />
            </div>
            <span className="truncate text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
              {title}
            </span>
          </div>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
        </div>

        <div className="flex shrink-0 items-baseline gap-1.5">
          <span className="truncate text-xl font-bold tabular-nums tracking-tight sm:text-2xl">
            {typeof value === "number" ? value.toLocaleString() : value}
          </span>
          {unit && (
            <span className="shrink-0 text-[10px] text-muted-foreground font-medium tracking-wider uppercase">
              {unit}
            </span>
          )}
        </div>

        <div className="flex min-h-[2.25rem] flex-1 flex-col justify-end gap-1.5">
          {numericGoal != null && (
            <p className="text-[10px] text-muted-foreground/65 tracking-wider">
              / {typeof goal === "number" ? goal.toLocaleString() : goal} TARGET
            </p>
          )}
          {progress != null && (
            <div className="h-0.5 w-full shrink-0 bg-muted/30 overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-700 ease-out",
                  progress >= 100 ? "bg-primary" : ""
                )}
                style={{
                  width: `${progress}%`,
                  backgroundColor: progress < 100 ? color : undefined,
                  boxShadow: `0 0 6px ${color}40`,
                }}
              />
            </div>
          )}
        </div>

        <div className="shrink-0 pt-1">
          <MiniChart data={chartData} color={color} />
        </div>
      </div>
    </Link>
  )
}
