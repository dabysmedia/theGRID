"use client"

import type { LucideIcon } from "lucide-react"
import { DatePicker } from "@/components/DatePicker"

interface PageHeaderProps {
  title: string
  icon?: LucideIcon
  iconColor?: string
}

export function PageHeader({ title, icon: Icon, iconColor }: PageHeaderProps) {
  return (
    <header className="animate-fade-up">
      <div className="flex items-start gap-2.5 sm:gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:gap-2.5">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            {Icon && (
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-border/40"
                style={{
                  backgroundColor: `${iconColor ?? "oklch(0.82 0.18 110)"}14`,
                }}
              >
                <Icon
                  className="size-[1.125rem]"
                  style={{ color: iconColor ?? "oklch(0.82 0.18 110)" }}
                />
              </div>
            )}
            <h1 className="font-nabla min-w-0 flex-1 truncate text-xl font-semibold leading-tight tracking-[-0.03em] text-foreground sm:text-2xl sm:leading-none">
              {title}
            </h1>
          </div>

          <DatePicker />
        </div>

        <div className="status-dot mt-1.5 shrink-0 sm:mt-1" aria-hidden />
      </div>
    </header>
  )
}
