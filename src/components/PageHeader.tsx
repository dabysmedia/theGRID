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
    <header className="space-y-2 mb-8 animate-fade-up">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl glass press-scale hover:bg-glass-highlight/40 transition-[background-color] duration-200 sm:h-9 sm:w-9"
        >
          <ArrowLeft className="h-5 w-5 text-muted-foreground sm:h-4 sm:w-4" />
        </button>
        <div className="flex items-center gap-2.5">
          {Icon && (
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg"
              style={{ backgroundColor: `${iconColor}18` }}
            >
              <Icon className="h-4 w-4" style={{ color: iconColor }} />
            </div>
          )}
          <h1 className="text-lg font-semibold tracking-[0.1em] uppercase">{title}</h1>
        </div>
        <div className="flex-1" />
        <div className="status-dot" />
      </div>
      <div className="pl-0">
        <DatePicker />
      </div>
    </header>
  )
}
