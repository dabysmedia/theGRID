"use client"

import { Suspense } from "react"
import { Settings } from "lucide-react"
import { PageHeader } from "@/components/PageHeader"
import { PageHeroStrip } from "@/components/PageHeroStrip"
import { ProfileSwitcher } from "@/components/ProfileSwitcher"
import { ProfilePhotoSettings } from "@/components/ProfilePhotoSettings"
import { VacationModeSettings } from "@/components/VacationModeSettings"
import { WorkCycleSettings } from "@/components/WorkCycleSettings"
import { GoogleHealthSettings } from "@/components/GoogleHealthSettings"
import { PushNotificationManager } from "@/components/PushNotificationManager"
import { CATEGORY_THEME } from "@/lib/category-theme"
import { cn, glassPanelClass } from "@/lib/utils"

const MORE_THEME = CATEGORY_THEME.more

export default function MorePage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <PageHeader title="System" />
        <p className="type-hud-caption normal-case text-muted-foreground/75">
          Profile, notifications, and configuration
        </p>
      </div>

      <PageHeroStrip
        color={MORE_THEME.color}
        icon={Settings}
        eyebrow="Command"
        value="THEGRID"
        hint="tactical health OS"
        metrics={[
          { label: "Build", value: "v0.1.0" },
          { label: "Mode", value: "Live" },
          { label: "Theme", value: "HUD" },
        ]}
      />

      <div className={cn(glassPanelClass, "animate-fade-up space-y-8 p-5 lg:max-w-md lg:p-6")}>
        <ProfilePhotoSettings />
        <div className="hud-divider" />
        <ProfileSwitcher />
        <div className="hud-divider" />
        <div className="space-y-2">
          <h2 className="type-hud-rail text-muted-foreground/70">Settings</h2>
          <VacationModeSettings />
          <div className="hud-divider" />
          <WorkCycleSettings />
        </div>
        <div className="hud-divider" />
        <Suspense fallback={null}>
          <GoogleHealthSettings />
        </Suspense>
        <div className="hud-divider" />
        <PushNotificationManager />
      </div>

      <div className={cn(glassPanelClass, "animate-fade-up stagger-1 space-y-4 p-5 lg:max-w-md lg:p-6")}>
        <div className="flex items-center gap-3">
          <div className="status-dot" />
          <h2 className="text-base font-bold uppercase tracking-[0.18em] sm:text-lg">
            <span className="text-gradient-glass title-underline-accent inline-block">
              THEGRID
            </span>
          </h2>
        </div>
        <div className="hud-divider" />
        <p className="type-hud-caption normal-case leading-relaxed tracking-wide text-muted-foreground/75">
          Tactical health and fitness command system. Track calories, weight, steps,
          running, workouts, sleep, bowel, and alcohol — all from one control panel.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <Settings className="h-3 w-3 text-muted-foreground/45" />
          <p className="type-hud-eyebrow text-muted-foreground/55">Build v0.1.0</p>
        </div>
      </div>
    </div>
  )
}
