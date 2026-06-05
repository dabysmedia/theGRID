"use client"

import Link from "next/link"
import { useMemo } from "react"
import { PageHeader } from "@/components/PageHeader"
import {
  Flame,
  Footprints,
  PersonStanding,
  Dumbbell,
  Moon,
  Syringe,
  Beer,
  CircleDot,
  Weight,
  Activity,
} from "lucide-react"
import { useActiveDate } from "@/context/DateContext"
import { useUser } from "@/context/UserContext"
import { cn } from "@/lib/utils"
import { isVacationBlockingCalendarDay } from "@/lib/vacation-mode"

const logCategories = [
  { href: "/calories", label: "Calories", desc: "Track meals & macros", icon: Flame, color: "#ef4444" },
  { href: "/weight", label: "Weight", desc: "Daily weigh-ins & trends", icon: Weight, color: "#22c55e" },
  { href: "/steps", label: "Steps", desc: "Daily step count", icon: Footprints, color: "#22c55e" },
  { href: "/running", label: "Running", desc: "Distance, time & pace", icon: PersonStanding, color: "#3b82f6" },
  { href: "/workouts", label: "Workouts", desc: "Log your sessions", icon: Dumbbell, color: "#c4d632" },
  { href: "/sleep", label: "Sleep", desc: "Track rest & quality", icon: Moon, color: "#6366f1" },
  { href: "/peptides", label: "Peptides", desc: "Reta doses & effects", icon: Syringe, color: "#a855f7" },
  { href: "/recovery", label: "Recovery", desc: "Pain, energy, injuries", icon: Activity, color: "#2dd4bf" },
  { href: "/bowel", label: "Bowel", desc: "Bristol scale tracking", icon: CircleDot, color: "#92400e" },
  { href: "/alcohol", label: "Alcohol", desc: "Log drinks & units", icon: Beer, color: "#f59e0b" },
]

export default function LogPage() {
  const { user } = useUser()
  const { activeDate } = useActiveDate()
  const vacationBlocksBody = useMemo(
    () => isVacationBlockingCalendarDay(user?.vacationResumeDate, activeDate),
    [user?.vacationResumeDate, activeDate]
  )

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <PageHeader title="Quick Log" />
        <p className="text-[11px] leading-snug text-muted-foreground/75 sm:text-xs">
          Select a category to enter data
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4">
        {logCategories.map((cat) => {
          const calPaused = cat.href === "/calories" && vacationBlocksBody
          const weightPaused = cat.href === "/weight" && vacationBlocksBody
          const tilePaused = calPaused || weightPaused
          const tile = (
            <div
              className={cn(
                "glass-panel flex h-full cursor-pointer flex-col items-center gap-3 p-4 text-center transition-all duration-200 hover:bg-glass-highlight/40 active:scale-[0.97] lg:p-5",
                tilePaused && "cursor-not-allowed opacity-45 saturate-[0.4] hover:bg-transparent"
              )}
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl lg:h-14 lg:w-14"
                style={{ backgroundColor: `${cat.color}12` }}
              >
                <cat.icon className="h-6 w-6 lg:h-7 lg:w-7" style={{ color: cat.color }} />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-[0.1em] uppercase">{cat.label}</p>
                <p className="text-[10px] text-muted-foreground/65 mt-0.5 tracking-wide">
                  {tilePaused ? "Paused (vacation)" : cat.desc}
                </p>
              </div>
            </div>
          )

          if (tilePaused) {
            return (
              <div
                key={cat.href}
                className="group"
                title={`${cat.label} paused during vacation mode`}
              >
                {tile}
              </div>
            )
          }

          return (
            <Link key={cat.href} href={cat.href} className="group">
              {tile}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
