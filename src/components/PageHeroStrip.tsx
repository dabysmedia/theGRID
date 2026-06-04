"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface HeroMetricItem {
  label: string
  value: string
  sub?: string
}

export interface PageHeroStripProps {
  color: string
  icon: LucideIcon
  eyebrow: string
  value: string
  unit?: string
  hint?: string
  valueAdornment?: ReactNode
  footnotes?: ReactNode[]
  metrics: HeroMetricItem[]
  className?: string
}

function metricsGridClass(count: number): string {
  if (count >= 5) return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
  if (count === 4) return "grid-cols-2 lg:grid-cols-4"
  if (count === 2) return "grid-cols-2 lg:min-w-[12rem]"
  return "grid-cols-3 lg:min-w-[18rem]"
}

export function HeroMetric({ label, value, sub }: HeroMetricItem) {
  return (
    <div className="glass-subtle min-w-0 rounded-xl px-3 py-2.5">
      <p className="type-hud-label-soft mb-1 truncate">{label}</p>
      <p className="type-hud-stat text-lg lg:text-xl">{value}</p>
      {sub && <p className="type-hud-caption mt-0.5">{sub}</p>}
    </div>
  )
}

export function PageHeroStrip({
  color,
  icon: Icon,
  eyebrow,
  value,
  unit,
  hint,
  valueAdornment,
  footnotes,
  metrics,
  className,
}: PageHeroStripProps) {
  return (
    <div
      className={cn(
        "glass hud-corners relative overflow-hidden rounded-2xl border border-border/20",
        "bg-gradient-to-br from-glass-highlight/[0.16] via-transparent to-transparent",
        "shadow-[inset_0_1px_0_0_oklch(1_0_0/10%),0_22px_56px_-20px_oklch(0_0_0/42%)]",
        "dark:border-[oklch(1_0_0/9%)] dark:from-glass-highlight/[0.1]",
        "dark:shadow-[inset_0_1px_0_0_oklch(1_0_0/12%),0_28px_72px_-24px_oklch(0_0_0/62%)]",
        "animate-fade-up p-4 lg:p-5",
        className
      )}
      style={{
        backgroundImage: `linear-gradient(to bottom right, oklch(1 0 0 / 0.06), transparent 55%, color-mix(in srgb, ${color} 8%, transparent))`,
      }}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-[0.07]"
        style={{ backgroundColor: color }}
      />
      <div className="relative grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border"
            style={{
              borderColor: `${color}33`,
              backgroundColor: `${color}14`,
            }}
          >
            <Icon className="h-6 w-6" style={{ color }} />
          </div>
          <div className="min-w-0">
            <p className="type-hud-label-soft mb-1">{eyebrow}</p>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="type-hud-value-xl tabular-nums">{value}</span>
              {unit && <span className="type-hud-unit">{unit}</span>}
              {valueAdornment}
              {hint && (
                <span className="type-hud-caption normal-case">{hint}</span>
              )}
            </div>
            {footnotes?.map((note, i) => (
              <div key={i} className="type-hud-caption mt-1.5 normal-case line-clamp-2">
                {note}
              </div>
            ))}
          </div>
        </div>
        {metrics.length > 0 && (
          <div className={cn("grid gap-2 min-w-0", metricsGridClass(metrics.length))}>
            {metrics.map((m) => (
              <HeroMetric key={m.label} {...m} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
