"use client"

import Link from "next/link"
import { useMemo } from "react"
import { PageHeader } from "@/components/PageHeader"
import { useActiveDate } from "@/context/DateContext"
import { useUser } from "@/context/UserContext"
import {
  CATEGORY_THEME,
  QUICK_LOG_CATEGORIES,
} from "@/lib/category-theme"
import { cn, glassPanelAccentClass, glassPanelAccentStyle, glassPanelClass } from "@/lib/utils"
import { isVacationBlockingCalendarDay } from "@/lib/vacation-mode"

export default function LogPage() {
  const { user } = useUser()
  const { activeDate } = useActiveDate()
  const vacationBlocksBody = useMemo(
    () => isVacationBlockingCalendarDay(user?.vacationResumeDate, activeDate),
    [user?.vacationResumeDate, activeDate],
  )

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <PageHeader title="Quick Log" />
        <p className="type-hud-caption normal-case text-muted-foreground/75">
          Jump into any tracker for today
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4 lg:gap-3">
        {QUICK_LOG_CATEGORIES.map((key, idx) => {
          const cat = CATEGORY_THEME[key]
          const calPaused = cat.key === "calories" && vacationBlocksBody
          const weightPaused = cat.key === "weight" && vacationBlocksBody
          const tilePaused = calPaused || weightPaused
          const Icon = cat.icon
          const tile = (
            <div
              className={cn(
                glassPanelClass,
                glassPanelAccentClass,
                "press-scale flex h-full flex-col items-center gap-3 p-4 text-center transition-all duration-200 hover:bg-glass-highlight/25 active:scale-[0.97] lg:p-5",
                "animate-fade-up",
                tilePaused && "cursor-not-allowed opacity-45 saturate-[0.4] hover:bg-transparent",
              )}
              style={{
                ...glassPanelAccentStyle(cat.color),
                animationDelay: `${idx * 35}ms`,
              }}
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl border lg:h-14 lg:w-14"
                style={{
                  backgroundColor: `${cat.color}14`,
                  borderColor: `${cat.color}33`,
                }}
              >
                <Icon className="h-6 w-6 lg:h-7 lg:w-7" style={{ color: cat.color }} />
              </div>
              <div>
                <p className="type-hud-label text-foreground">{cat.label}</p>
                <p className="type-hud-caption mt-1 normal-case tracking-wide text-muted-foreground/65">
                  {tilePaused ? "Paused (vacation)" : cat.description}
                </p>
              </div>
            </div>
          )

          if (tilePaused) {
            return (
              <div
                key={cat.key}
                className="group"
                title={`${cat.label} paused during vacation mode`}
              >
                {tile}
              </div>
            )
          }

          return (
            <Link key={cat.key} href={cat.href} className="group">
              {tile}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
