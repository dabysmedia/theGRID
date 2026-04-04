"use client"

import Link from "next/link"
import {
  Flame,
  Footprints,
  PersonStanding,
  Dumbbell,
  Moon,
  Beer,
  CircleDot,
  Weight,
  ChevronRight,
} from "lucide-react"

const statCategories = [
  { href: "/calories", label: "Calories", icon: Flame, color: "#ef4444" },
  { href: "/weight", label: "Weight", icon: Weight, color: "#22c55e" },
  { href: "/steps", label: "Steps", icon: Footprints, color: "#22c55e" },
  { href: "/running", label: "Running", icon: PersonStanding, color: "#3b82f6" },
  { href: "/workouts", label: "Workouts", icon: Dumbbell, color: "#a855f7" },
  { href: "/sleep", label: "Sleep", icon: Moon, color: "#6366f1" },
  { href: "/bowel", label: "Bowel", icon: CircleDot, color: "#78716c" },
  { href: "/alcohol", label: "Alcohol", icon: Beer, color: "#f59e0b" },
]

export default function StatsPage() {
  return (
    <div className="space-y-8">
      <header className="flex items-center gap-3">
        <div className="status-dot" />
        <div>
          <h1 className="text-lg font-bold tracking-[0.15em] uppercase">Statistics</h1>
          <p className="text-[10px] text-muted-foreground/65 tracking-[0.08em] uppercase mt-0.5">Detailed analytics per system</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 lg:gap-3">
        {statCategories.map((cat) => (
          <Link key={cat.href} href={cat.href} className="group block">
            <div className="glass p-3.5 lg:p-4 flex items-center justify-between transition-all duration-200 hover:bg-glass-highlight/40 active:scale-[0.98]" style={{ borderRadius: '4px' }}>
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10"
                  style={{ backgroundColor: `${cat.color}12`, borderRadius: '3px' }}
                >
                  <cat.icon className="h-4 w-4 lg:h-5 lg:w-5" style={{ color: cat.color }} />
                </div>
                <span className="text-xs font-medium tracking-[0.12em] uppercase">{cat.label}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/35 group-hover:text-primary/50 transition-colors" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
