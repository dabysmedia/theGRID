import type { LucideIcon } from "lucide-react"
import {
  Activity,
  BarChart3,
  Beer,
  CheckSquare,
  CircleDot,
  Crosshair,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Moon,
  NotebookPen,
  PersonStanding,
  Settings,
  Syringe,
  Timer,
  Weight,
} from "lucide-react"

/**
 * Canonical visual identity for every tracked system.
 * Single source of truth for category color, icon, label, and route —
 * hub tiles, stats sections, hero strips, and charts should all read from here.
 */
export interface CategoryTheme {
  key: CategoryKey
  label: string
  href: string
  icon: LucideIcon
  /** Hex accent — used for chart strokes, icon tints, glows. */
  color: string
  /** Default unit shown next to values. */
  unit: string
  /** Short description for quick-log / directory tiles. */
  description?: string
}

export type CategoryKey =
  | "calories"
  | "steps"
  | "running"
  | "workouts"
  | "sleep"
  | "vitals"
  | "peptides"
  | "bowel"
  | "recovery"
  | "alcohol"
  | "weight"
  | "habits"
  | "fasting"
  | "goals"
  | "journal"
  | "stats"
  | "more"

export const CATEGORY_THEME: Record<CategoryKey, CategoryTheme> = {
  calories: { key: "calories", label: "Calories", href: "/calories", icon: Flame, color: "#ef4444", unit: "cal", description: "Track meals & macros" },
  steps: { key: "steps", label: "Steps", href: "/steps", icon: Footprints, color: "#22c55e", unit: "steps", description: "Daily step count" },
  running: { key: "running", label: "Running", href: "/running", icon: PersonStanding, color: "#3b82f6", unit: "mi", description: "Distance, time & pace" },
  workouts: { key: "workouts", label: "Workouts", href: "/workouts", icon: Dumbbell, color: "#c4d632", unit: "sessions", description: "Log your sessions" },
  sleep: { key: "sleep", label: "Sleep", href: "/sleep", icon: Moon, color: "#6366f1", unit: "hrs", description: "Track rest & quality" },
  vitals: { key: "vitals", label: "Vitals", href: "/vitals", icon: HeartPulse, color: "#f43f5e", unit: "bpm", description: "Heart rate, HRV & zones" },
  peptides: { key: "peptides", label: "Peptides", href: "/peptides", icon: Syringe, color: "#a855f7", unit: "mg", description: "Reta doses & effects" },
  bowel: { key: "bowel", label: "Bowel", href: "/bowel", icon: CircleDot, color: "#92400e", unit: "", description: "Bristol scale tracking" },
  recovery: { key: "recovery", label: "Recovery", href: "/workouts#recovery", icon: Activity, color: "#2dd4bf", unit: "/10", description: "Muscle load from training" },
  alcohol: { key: "alcohol", label: "Alcohol", href: "/alcohol", icon: Beer, color: "#f59e0b", unit: "units", description: "Log drinks & units" },
  weight: { key: "weight", label: "Weight", href: "/weight", icon: Weight, color: "#14b8a6", unit: "lbs", description: "Daily weigh-ins & trends" },
  habits: { key: "habits", label: "Habits", href: "/habits", icon: CheckSquare, color: "#22c55e", unit: "done", description: "Daily habit streaks" },
  fasting: { key: "fasting", label: "Fasting", href: "/fasting", icon: Timer, color: "#f97316", unit: "hrs", description: "Windows & adherence" },
  goals: { key: "goals", label: "Goals", href: "/goals", icon: Crosshair, color: "#c4d632", unit: "%", description: "Long-term targets" },
  journal: { key: "journal", label: "Journal", href: "/journal", icon: NotebookPen, color: "#38bdf8", unit: "posts", description: "Daily notes & mood" },
  stats: { key: "stats", label: "Statistics", href: "/stats", icon: BarChart3, color: "#a78bfa", unit: "", description: "Monthly analytics" },
  more: { key: "more", label: "System", href: "/more", icon: Settings, color: "#94a3b8", unit: "", description: "Profile & settings" },
}

/** Ordered tiles for the Quick Log directory. */
export const QUICK_LOG_CATEGORIES: CategoryKey[] = [
  "calories",
  "weight",
  "steps",
  "running",
  "workouts",
  "sleep",
  "peptides",
  "recovery",
  "bowel",
  "alcohol",
]

/** Hex + alpha suffix helper for translucent tints, e.g. `tint(color, "18")`. */
export function categoryTint(color: string, alphaHex: string): string {
  return `${color}${alphaHex}`
}
