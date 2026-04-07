"use client"

import Link from "next/link"
import { DatePicker } from "@/components/DatePicker"
import {
  Flame,
  Footprints,
  PersonStanding,
  Dumbbell,
  Moon,
  Beer,
  CircleDot,
  Weight,
} from "lucide-react"

const logCategories = [
  { href: "/calories", label: "Calories", desc: "Track meals & macros", icon: Flame, color: "#ef4444" },
  { href: "/weight", label: "Weight", desc: "Daily weigh-ins & trends", icon: Weight, color: "#22c55e" },
  { href: "/steps", label: "Steps", desc: "Daily step count", icon: Footprints, color: "#22c55e" },
  { href: "/running", label: "Running", desc: "Distance, time & pace", icon: PersonStanding, color: "#3b82f6" },
  { href: "/workouts", label: "Workouts", desc: "Log your sessions", icon: Dumbbell, color: "#a855f7" },
  { href: "/sleep", label: "Sleep", desc: "Track rest & quality", icon: Moon, color: "#6366f1" },
  { href: "/bowel", label: "Bowel", desc: "Bristol scale tracking", icon: CircleDot, color: "#78716c" },
  { href: "/alcohol", label: "Alcohol", desc: "Log drinks & units", icon: Beer, color: "#f59e0b" },
]

export default function LogPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="status-dot" />
          <div>
            <h1 className="text-lg font-bold tracking-[0.15em] uppercase">Quick Log</h1>
            <p className="text-[10px] text-muted-foreground/65 tracking-[0.08em] uppercase mt-0.5">Select category to input data</p>
          </div>
        </div>
        <div className="pl-5 lg:pl-0">
          <DatePicker />
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4">
        {logCategories.map((cat) => (
          <Link key={cat.href} href={cat.href} className="group">
            <div className="glass hud-corners flex h-full cursor-pointer flex-col items-center gap-3 rounded-2xl p-4 text-center transition-all duration-200 hover:bg-glass-highlight/40 active:scale-[0.97] lg:p-5">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl lg:h-14 lg:w-14"
                style={{ backgroundColor: `${cat.color}12` }}
              >
                <cat.icon className="h-6 w-6 lg:h-7 lg:w-7" style={{ color: cat.color }} />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-[0.1em] uppercase">{cat.label}</p>
                <p className="text-[10px] text-muted-foreground/65 mt-0.5 tracking-wide">{cat.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
