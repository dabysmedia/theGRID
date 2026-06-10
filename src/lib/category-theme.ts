import type { LucideIcon } from "lucide-react"
import {
  Activity,
  Beer,
  CircleDot,
  Dumbbell,
  Flame,
  Footprints,
  Moon,
  PersonStanding,
  Syringe,
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
}

export type CategoryKey =
  | "calories"
  | "steps"
  | "running"
  | "workouts"
  | "sleep"
  | "peptides"
  | "bowel"
  | "recovery"
  | "alcohol"
  | "weight"

export const CATEGORY_THEME: Record<CategoryKey, CategoryTheme> = {
  calories: { key: "calories", label: "Calories", href: "/calories", icon: Flame, color: "#ef4444", unit: "cal" },
  steps: { key: "steps", label: "Steps", href: "/steps", icon: Footprints, color: "#22c55e", unit: "steps" },
  running: { key: "running", label: "Running", href: "/running", icon: PersonStanding, color: "#3b82f6", unit: "mi" },
  workouts: { key: "workouts", label: "Workouts", href: "/workouts", icon: Dumbbell, color: "#c4d632", unit: "sessions" },
  sleep: { key: "sleep", label: "Sleep", href: "/sleep", icon: Moon, color: "#6366f1", unit: "hrs" },
  peptides: { key: "peptides", label: "Peptides", href: "/peptides", icon: Syringe, color: "#a855f7", unit: "mg" },
  bowel: { key: "bowel", label: "Bowel", href: "/bowel", icon: CircleDot, color: "#92400e", unit: "" },
  recovery: { key: "recovery", label: "Recovery", href: "/workouts#recovery", icon: Activity, color: "#2dd4bf", unit: "/10" },
  alcohol: { key: "alcohol", label: "Alcohol", href: "/alcohol", icon: Beer, color: "#f59e0b", unit: "units" },
  weight: { key: "weight", label: "Weight", href: "/weight", icon: Weight, color: "#14b8a6", unit: "lbs" },
}

/** Hex + alpha suffix helper for translucent tints, e.g. `tint(color, "18")`. */
export function categoryTint(color: string, alphaHex: string): string {
  return `${color}${alphaHex}`
}
