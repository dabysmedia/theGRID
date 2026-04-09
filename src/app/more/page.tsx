"use client"

import { Settings } from "lucide-react"
import { DatePicker } from "@/components/DatePicker"

export default function MorePage() {
  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-start gap-2.5 sm:gap-3">
          <div className="status-dot mt-1 shrink-0 translate-y-px" aria-hidden />
          <div className="min-w-0 flex flex-col gap-2 sm:gap-2.5">
            <h1 className="font-nabla text-xl font-semibold leading-tight tracking-[-0.03em] text-foreground sm:text-2xl">
              System
            </h1>
            <DatePicker />
            <p className="text-[11px] leading-snug text-muted-foreground/75 sm:text-xs">
              Configuration and info
            </p>
          </div>
        </div>
      </header>

      <div className="glass hud-corners space-y-4 rounded-2xl p-6 lg:max-w-md">
        <div className="flex items-center gap-3">
          <div className="status-dot" />
          <h2 className="text-sm font-bold tracking-[0.2em] uppercase">
            <span className="text-muted-foreground/90">the</span>
            <span className="inline-block origin-left scale-150 align-baseline text-foreground">
              GRID
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
