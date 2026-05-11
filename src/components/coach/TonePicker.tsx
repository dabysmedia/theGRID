"use client"

import { Sparkles, Flame } from "lucide-react"
import {
  COACH_TONES,
  COACH_TONE_IDS,
  type CoachToneId,
} from "@/lib/coach/tones"
import { cn } from "@/lib/utils"

interface TonePickerProps {
  value: CoachToneId
  onChange: (id: CoachToneId) => void
  disabled?: boolean
  className?: string
}

const ICONS: Record<CoachToneId, typeof Sparkles> = {
  standard: Sparkles,
  blunt: Flame,
}

export function TonePicker({
  value,
  onChange,
  disabled = false,
  className,
}: TonePickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Choose coach tone"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-xl border border-glass-border bg-glass-highlight/20 p-0.5 backdrop-blur-sm",
        disabled && "pointer-events-none opacity-60",
        className
      )}
    >
      {COACH_TONE_IDS.map((id) => {
        const tone = COACH_TONES[id]
        const Icon = ICONS[id]
        const active = id === value
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(id)}
            title={`${tone.label} — ${tone.description}`}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
              active
                ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_oklch(from_var(--primary)_l_c_h_/_0.35)]"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <span>{tone.label}</span>
          </button>
        )
      })}
    </div>
  )
}
