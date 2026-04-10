"use client"

import { Settings } from "lucide-react"
import { DatePicker } from "@/components/DatePicker"
import { ProfileSwitcher } from "@/components/ProfileSwitcher"
import { ProfileHeaderTrigger } from "@/context/ProfileDialogContext"

export default function MorePage() {
  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-start gap-2.5 sm:gap-3">
          <div className="status-dot mt-1 shrink-0 translate-y-px" aria-hidden />
          <div className="min-w-0 flex flex-1 flex-col gap-2 sm:gap-2.5">
            <h1 className="font-iceberg text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-3xl">
              <span className="text-gradient-glass title-underline-accent inline-block">
                System
              </span>
            </h1>
            <DatePicker />
            <p className="text-[11px] leading-snug text-muted-foreground/75 sm:text-xs">
              Configuration and info
            </p>
          </div>
          <ProfileHeaderTrigger className="mt-1 shrink-0" />
        </div>
      </header>

      <div className="glass hud-corners rounded-2xl p-6 lg:max-w-md">
        <ProfileSwitcher />
      </div>

      <div className="glass hud-corners space-y-4 rounded-2xl p-6 lg:max-w-md">
        <div className="flex items-center gap-3">
          <div className="status-dot" />
          <h2 className="text-base font-bold tracking-[0.18em] uppercase sm:text-lg">
            <span className="text-gradient-glass title-underline-accent font-iceberg inline-block">
              THEGRID
            </span>
          </h2>
        </div>
        <div className="hud-divider" />
        <p className="text-xs text-muted-foreground/75 leading-relaxed tracking-wide">
          Tactical health and fitness command system. Track calories, weight, steps,
          running, workouts, sleep, bowel, and alcohol — all from one control panel.
        </p>
        <div className="flex items-center gap-2 pt-2">
          <Settings className="h-3 w-3 text-muted-foreground/45" />
          <p className="text-[10px] text-muted-foreground/55 tracking-[0.12em] uppercase">BUILD v0.1.0</p>
        </div>
      </div>
    </div>
  )
}
