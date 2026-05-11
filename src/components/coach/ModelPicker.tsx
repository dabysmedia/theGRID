"use client"

import { Zap, Sparkles } from "lucide-react"
import { COACH_MODELS, type CoachModelTier } from "@/lib/coach/models"
import { cn } from "@/lib/utils"

interface ModelPickerProps {
  value: string
  onChange: (id: string) => void
  /** When true, render as compact icons-only (e.g. inside the composer). */
  compact?: boolean
  disabled?: boolean
  className?: string
}

const ICONS: Record<CoachModelTier, typeof Zap> = {
  fast: Zap,
  smart: Sparkles,
}

export function ModelPicker({
  value,
  onChange,
  compact = false,
  disabled = false,
  className,
}: ModelPickerProps) {
  const ids = Object.keys(COACH_MODELS)
  return (
    <div
      role="radiogroup"
      aria-label="Choose coach model"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-xl border border-glass-border bg-glass-highlight/20 p-0.5 backdrop-blur-sm",
        disabled && "pointer-events-none opacity-60",
        className
      )}
    >
      {ids.map((id) => {
        const model = COACH_MODELS[id]
        const Icon = ICONS[model.tier]
        const active = id === value
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(id)}
            title={`${model.label} — ${model.description}`}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
              active
                ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_oklch(from_var(--primary)_l_c_h_/_0.35)]"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            {!compact && <span>{model.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
