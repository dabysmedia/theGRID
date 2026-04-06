"use client"

import { Settings } from "lucide-react"
import { DatePicker } from "@/components/DatePicker"

export default function MorePage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="status-dot" />
          <div>
            <h1 className="text-lg font-bold tracking-[0.15em] uppercase">System</h1>
            <p className="text-[10px] text-muted-foreground/65 tracking-[0.08em] uppercase mt-0.5">Configuration & info</p>
          </div>
        </div>
        <div className="pl-5 lg:pl-0">
          <DatePicker />
        </div>
      </header>

      <div className="glass hud-corners p-6 space-y-4 lg:max-w-md" style={{ borderRadius: '4px' }}>
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
