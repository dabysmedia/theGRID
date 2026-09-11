"use client"

import { cn } from "@/lib/utils"
import {
  getMachineBrand,
  type MachineBrand,
  type BrandShape,
  type BrandWordmark,
} from "@/lib/workouts/machine-brands"

/*
 * Crisp, self-contained brand mark for a gym equipment manufacturer.
 *
 * These are stylised marks (coloured emblem + typographic wordmark) built from
 * the catalogue metadata — not scraped logo files. That keeps them sharp at any
 * size, identical in light/dark mode, and impossible to "fail to load".
 */

export type MachineMarkSize = "xs" | "sm" | "md" | "lg"

export interface MachineBrandMarkProps {
  /** Catalogue id (e.g. "hammer") or a `custom:…` id. */
  machineId?: string | null
  /** Display name used for custom machines / fallback label. */
  machineName?: string | null
  size?: MachineMarkSize
  /** `plate` = emblem only, `chip` = emblem + short name, `row` = emblem + full name. */
  variant?: "plate" | "chip" | "row"
  className?: string
  /** Suppress the label even in chip/row variants. */
  hideLabel?: boolean
}

const SIZES: Record<
  MachineMarkSize,
  { tile: string; monogram: string; label: string; gap: string; pad: string; radius: string }
> = {
  xs: { tile: "size-4", monogram: "text-[7px]", label: "text-[9px]", gap: "gap-1", pad: "px-1 py-[3px]", radius: "rounded-[3px]" },
  sm: { tile: "size-5", monogram: "text-[8px]", label: "text-[10px]", gap: "gap-1.5", pad: "px-1.5 py-0.5", radius: "rounded-[4px]" },
  md: { tile: "size-7", monogram: "text-[10px]", label: "text-xs", gap: "gap-2", pad: "px-2 py-1", radius: "rounded-md" },
  lg: { tile: "size-10", monogram: "text-sm", label: "text-sm", gap: "gap-2.5", pad: "px-2.5 py-1.5", radius: "rounded-lg" },
}

const SHAPE_CLIP: Record<BrandShape, string | undefined> = {
  square: undefined,
  round: undefined,
  hex: "polygon(25% 1%, 75% 1%, 99% 50%, 75% 99%, 25% 99%, 1% 50%)",
  shield: "polygon(3% 3%, 97% 3%, 97% 62%, 50% 98%, 3% 62%)",
  chevron: "polygon(50% 1%, 98% 27%, 98% 97%, 2% 97%, 2% 27%)",
}

const WORDMARK_CLASS: Record<BrandWordmark, string> = {
  condensed: "font-heading font-extrabold uppercase tracking-[-0.02em]",
  italic: "font-heading font-black uppercase italic tracking-[-0.01em]",
  wide: "font-heading font-semibold uppercase tracking-[0.16em]",
  serif: "font-serif font-semibold uppercase tracking-[0.02em]",
  stencil: "font-mono font-bold uppercase tracking-[0.1em]",
  mono: "font-mono font-semibold uppercase tracking-[0.14em]",
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

/** Darken a #rrggbb colour; returns input unchanged for non-hex values. */
function darken(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const value = parseInt(m[1], 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  const f = 1 - amount
  return `#${[clampByte(r * f), clampByte(g * f), clampByte(b * f)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`
}

export function MachineBrandMark({
  machineId,
  machineName,
  size = "sm",
  variant = "chip",
  className,
  hideLabel = false,
}: MachineBrandMarkProps) {
  const brand = getMachineBrand(machineId) ?? (machineName?.trim() ? getMachineBrand(`custom:${machineName.trim()}`) : null)
  if (!brand) return null

  const s = SIZES[size]
  const showLabel = !hideLabel && variant !== "plate"
  const label = variant === "row" ? brand.name : brand.short
  const deep = darken(brand.color, 0.42)

  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center",
        variant !== "plate" && `rounded-full border border-white/10 ${s.pad}`,
        variant !== "plate" && "bg-white/[0.04] backdrop-blur-sm",
        s.gap,
        className,
      )}
      style={variant !== "plate" ? { boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06)` } : undefined}
      title={brand.name}
    >
      <BrandEmblem brand={brand} size={size} deep={deep} />
      {showLabel ? (
        <span
          className={cn(
            "min-w-0 truncate leading-none",
            WORDMARK_CLASS[brand.wordmark],
            s.label,
          )}
          style={{ color: "var(--foreground)" }}
        >
          {label}
        </span>
      ) : null}
    </span>
  )
}

function BrandEmblem({
  brand,
  size,
  deep,
}: {
  brand: MachineBrand
  size: MachineMarkSize
  deep: string
}) {
  const s = SIZES[size]
  const clip = SHAPE_CLIP[brand.shape]
  const shapeClass =
    brand.shape === "round"
      ? "rounded-full"
      : brand.shape === "square"
        ? "rounded-[28%]"
        : undefined

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden",
        s.tile,
        shapeClass,
      )}
      style={{
        background: `linear-gradient(150deg, ${brand.color} 0%, ${deep} 100%)`,
        clipPath: clip,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.25)",
      }}
      aria-hidden
    >
      {/* diagonal sheen */}
      <span
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "linear-gradient(115deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 42%)",
        }}
      />
      <span
        className={cn(
          "relative z-[1] font-heading font-black leading-none",
          s.monogram,
        )}
        style={{ color: brand.ink, letterSpacing: "-0.04em" }}
      >
        {brand.monogram}
      </span>
    </span>
  )
}

/** Tiny leading dot for dense rows (set tables, trend legends). */
export function MachineBrandDot({
  machineId,
  machineName,
  className,
}: {
  machineId?: string | null
  machineName?: string | null
  className?: string
}) {
  const brand = getMachineBrand(machineId) ?? (machineName?.trim() ? getMachineBrand(`custom:${machineName.trim()}`) : null)
  if (!brand) return null
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full ring-1 ring-white/15", className)}
      style={{ background: brand.color }}
      title={brand.name}
      aria-hidden
    />
  )
}
