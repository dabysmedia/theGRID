"use client"

import { Settings } from "lucide-react"
import { DatePicker } from "@/components/DatePicker"

export default function MorePage() {
  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="status-dot translate-y-px" aria-hidden />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              System
            </h1>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground/75 sm:text-xs">
              Configuration and info
            </p>
          </div>
        </div>
        <div className="mt-4 border-t border-border/30 pt-4 sm:mt-5">
          <DatePicker />
        </div>
      </header>

      <div className="glass hud-corners space-y-4 rounded-2xl p-6 lg:max-w-md">
        <div className="flex items-center gap-3">
          <div className="status-dot" />
          <h2 className="text-sm font-bold tracking-[0.2em] uppercase">
            the<span className="text-gradient">GRID</span>
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
