"use client"

import type { LucideIcon } from "lucide-react"
import { DatePicker } from "@/components/DatePicker"
import { ProfileHeaderTrigger } from "@/context/ProfileDialogContext"

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
            <h1 className="font-iceberg min-w-0 flex-1 text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-3xl sm:leading-none">
              <span className="text-gradient-glass title-underline-accent block truncate">
                {title}
              </span>
            </h1>
          </div>

          <DatePicker />
        </div>

        <div className="flex shrink-0 items-start gap-2 sm:gap-2.5">
          <div className="status-dot mt-1.5 sm:mt-1" aria-hidden />
          <ProfileHeaderTrigger />
        </div>
      </div>
    </header>
  )
}
