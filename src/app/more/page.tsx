"use client"

import { Settings } from "lucide-react"
import { PageHeader } from "@/components/PageHeader"
import { ProfileSwitcher } from "@/components/ProfileSwitcher"
import { ProfilePhotoSettings } from "@/components/ProfilePhotoSettings"
import { VacationModeSettings } from "@/components/VacationModeSettings"
import { PushNotificationManager } from "@/components/PushNotificationManager"

export default function MorePage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <PageHeader title="System" />
        <p className="text-[11px] leading-snug text-muted-foreground/75 sm:text-xs">
          Configuration and info
        </p>
      </div>

      <div className="glass-panel p-6 lg:max-w-md space-y-8">
        <ProfilePhotoSettings />
        <div className="hud-divider" />
        <ProfileSwitcher />
        <div className="hud-divider" />
        <div className="space-y-1">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/55">
            Settings
          </h2>
          <VacationModeSettings />
        </div>
        <div className="hud-divider" />
        <PushNotificationManager />
      </div>

      <div className="glass-panel space-y-4 p-6 lg:max-w-md">
        <div className="flex items-center gap-3">
          <div className="status-dot" />
          <h2 className="text-base font-bold tracking-[0.18em] uppercase sm:text-lg">
            <span className="text-gradient-glass title-underline-accent inline-block">
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
