"use client"

import { Suspense } from "react"
import {
  BellRing,
  CalendarRange,
  Info,
  PlugZap,
  Settings,
  SlidersHorizontal,
  UserRound,
} from "lucide-react"
import { PageHeader } from "@/components/PageHeader"
import { PageHeroStrip } from "@/components/PageHeroStrip"
import { ProfileSwitcher } from "@/components/ProfileSwitcher"
import { ProfilePhotoSettings } from "@/components/ProfilePhotoSettings"
import { TrackingTargetSettings } from "@/components/TrackingTargetSettings"
import { TrainingStyleSettings } from "@/components/TrainingStyleSettings"
import { VacationModeSettings } from "@/components/VacationModeSettings"
import { WorkCycleSettings } from "@/components/WorkCycleSettings"
import { GoogleHealthSettings } from "@/components/GoogleHealthSettings"
import { PushNotificationManager } from "@/components/PushNotificationManager"
import { CATEGORY_THEME } from "@/lib/category-theme"
import { cn, glassPanelClass } from "@/lib/utils"

const MORE_THEME = CATEGORY_THEME.more

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Settings
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/[0.07]">
        <Icon className="h-4 w-4 text-primary/80" />
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-foreground">{title}</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/75">{description}</p>
      </div>
    </div>
  )
}

export default function MorePage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <PageHeader title="Settings" />
        <p className="type-hud-caption normal-case text-muted-foreground/75">
          Personalize targets, schedule, profile, and connected services
        </p>
      </div>

      <PageHeroStrip
        color={MORE_THEME.color}
        icon={Settings}
        eyebrow="Control center"
        value="YOUR GRID"
        hint="one place for every personal setting"
        metrics={[
          { label: "Targets", value: "6" },
          { label: "Scope", value: "Profile" },
          { label: "Mode", value: "Live" },
        ]}
      />

      <section className={cn(glassPanelClass, "animate-fade-up space-y-5 p-4 sm:p-5 lg:p-6")}>
        <SectionHeading
          icon={SlidersHorizontal}
          title="Targets & training"
          description="These values drive dashboard rings, remaining totals, goal nights, hydration, recovery, and training progress."
        />
        <div className="hud-divider" />
        <TrackingTargetSettings />
        <div className="hud-divider" />
        <TrainingStyleSettings />
        <div className="hud-divider" />
        <WorkCycleSettings />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={cn(glassPanelClass, "animate-fade-up stagger-1 space-y-5 p-4 sm:p-5 lg:p-6")}>
          <SectionHeading
            icon={UserRound}
            title="Profile"
            description="Manage the active athlete, identity, and profile image. Each profile keeps separate targets and history."
          />
          <div className="hud-divider" />
          <ProfilePhotoSettings />
          <div className="hud-divider" />
          <ProfileSwitcher />
        </section>

        <section className={cn(glassPanelClass, "animate-fade-up stagger-2 space-y-5 p-4 sm:p-5 lg:p-6")}>
          <SectionHeading
            icon={CalendarRange}
            title="Schedule controls"
            description="Pause selected tracking during time away without deleting or rewriting existing history."
          />
          <div className="hud-divider" />
          <VacationModeSettings />
        </section>
      </div>

      <section className={cn(glassPanelClass, "animate-fade-up stagger-3 space-y-5 p-4 sm:p-5 lg:p-6")}>
        <SectionHeading
          icon={PlugZap}
          title="Connections & alerts"
          description="Control health-data sync and decide which notifications THEGRID can send."
        />
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
              <PlugZap className="h-3.5 w-3.5" />
              Health connection
            </div>
            <Suspense fallback={null}>
              <GoogleHealthSettings />
            </Suspense>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
              <BellRing className="h-3.5 w-3.5" />
              Notifications
            </div>
            <PushNotificationManager />
          </div>
        </div>
      </section>

      <section className={cn(glassPanelClass, "animate-fade-up stagger-4 space-y-4 p-4 sm:p-5 lg:p-6")}>
        <div className="flex items-center gap-3">
          <div className="status-dot" />
          <h2 className="text-base font-bold uppercase tracking-[0.18em] sm:text-lg">
            <span className="text-gradient-glass title-underline-accent inline-block">THEGRID</span>
          </h2>
        </div>
        <div className="hud-divider" />
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/45" />
          <div className="space-y-2">
            <p className="type-hud-caption normal-case leading-relaxed tracking-wide text-muted-foreground/75">
              Tactical health and fitness command system. Track calories, weight, steps, running,
              workouts, sleep, hydration, recovery, bowel, and alcohol from one control panel.
            </p>
            <p className="type-hud-eyebrow text-muted-foreground/55">Build v0.1.0</p>
          </div>
        </div>
      </section>
    </div>
  )
}
