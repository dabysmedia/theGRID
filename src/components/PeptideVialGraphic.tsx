"use client"

import { cn } from "@/lib/utils"

export const PEPTIDE_VIAL_IMAGE = "/images/peptide-vial-reta.png"

/** Circle rim point at bottom-right (~45°), as % offset from center. */
const RIM_X = "34.2%"
const RIM_Y = "34.2%"

export function PeptideVialGraphic({
  color = "#a855f7",
  doseMg,
  className,
  size = "lg",
}: {
  color?: string
  /** Last logged dose — badge on the ring at bottom-right. */
  doseMg?: number | null
  className?: string
  size?: "sm" | "md" | "lg"
}) {
  const boxClass =
    size === "lg"
      ? "h-[8.25rem] w-full max-w-[9.5rem] sm:h-[8.75rem] sm:max-w-[10rem]"
      : size === "md"
        ? "h-[4.5rem] w-[4.5rem]"
        : "h-12 w-12"

  const imageScale =
    size === "lg" ? "scale-[1.28]" : size === "md" ? "scale-[1.18]" : "scale-[1.12]"

  return (
    <div
      className={cn(
        "relative mx-auto flex shrink-0 items-center justify-center overflow-visible",
        boxClass,
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-[2%] rounded-full opacity-45 blur-lg"
        style={{ background: `radial-gradient(circle at 50% 50%, ${color}50, transparent 68%)` }}
        aria-hidden
      />
      <svg
        className="pointer-events-none absolute inset-[-4%] h-[108%] w-[108%]"
        viewBox="0 0 76 76"
        aria-hidden
      >
        <circle
          cx="38"
          cy="38"
          r="34"
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          strokeDasharray="3.5 5.5"
          strokeLinecap="round"
          opacity={0.38}
        />
      </svg>
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset, no next/image in project */}
      <img
        src={PEPTIDE_VIAL_IMAGE}
        alt=""
        className={cn("relative z-10 h-full w-full object-contain object-center drop-shadow-[0_8px_20px_rgba(0,0,0,0.45)]", imageScale)}
        draggable={false}
      />
      {/* Half inside / half outside the dashed ring — bottom-right */}
      <div
        className="absolute z-20 flex min-w-[2.75rem] flex-col items-center rounded-full border border-border/40 bg-background/90 px-2 py-1 leading-none shadow-md backdrop-blur-[3px]"
        style={{
          left: `calc(50% + ${RIM_X})`,
          top: `calc(50% + ${RIM_Y})`,
          transform: "translate(-50%, -50%)",
          borderColor: `${color}44`,
        }}
      >
        <span
          className={cn(
            "font-bold tabular-nums tracking-tight",
            size === "lg"
              ? "text-[1.35rem] sm:text-[1.45rem]"
              : size === "md"
                ? "text-base"
                : "text-sm"
          )}
          style={{ color }}
        >
          {doseMg != null ? doseMg : "—"}
        </span>
        {doseMg != null && (
          <span className="mt-px text-[7px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
            mg
          </span>
        )}
      </div>
    </div>
  )
}
