"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { DatePicker } from "@/components/DatePicker"

interface PageHeaderProps {
  title: string
  icon?: LucideIcon
  iconColor?: string
}

export function PageHeader({ title, icon: Icon, iconColor }: PageHeaderProps) {
  const router = useRouter()

  return (
    <header className="animate-fade-up">
      <div className="flex items-center gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-2xl border border-border/30 bg-background/30 glass press-scale transition-colors hover:bg-glass-highlight/35 sm:size-10"
          aria-label="Back"
        >
          <ArrowLeft className="size-5 text-muted-foreground sm:size-[1.125rem]" />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
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
          <h1 className="min-w-0 truncate text-xl font-semibold leading-none tracking-tight text-foreground sm:text-2xl sm:leading-tight">
            {title}
          </h1>
        </div>

        <div className="status-dot shrink-0 translate-y-px" aria-hidden />
      </div>

      <div className="mt-4 border-t border-border/30 pt-4 sm:mt-5 sm:pt-4">
        <DatePicker />
      </div>
    </header>
  )
}
