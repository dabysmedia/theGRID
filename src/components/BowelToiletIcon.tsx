"use client"

import { useId } from "react"
import { cn } from "@/lib/utils"

const BOWEL_COLOR = "#92400e"

export function BowelToiletIcon({
  value,
  color = BOWEL_COLOR,
  className,
  size = "md",
}: {
  /** Count or Bristol type shown inside the bowl. Use "—" for none. */
  value: number | string
  color?: string
  className?: string
  size?: "sm" | "md" | "lg"
}) {
  const display =
    typeof value === "number"
      ? value > 9
        ? "9+"
        : String(value)
      : value
  const compact = display.length > 1
  const gradId = useId().replace(/:/g, "")

  const sizeClass =
    size === "sm"
      ? "h-12 w-12"
      : size === "lg"
        ? "h-[5.75rem] w-[5.75rem] sm:h-[6rem] sm:w-[6rem]"
        : "h-14 w-14"

  const fontSize = size === "sm" ? (compact ? 11 : 14) : size === "lg" ? (compact ? 16 : 22) : compact ? 13 : 17

  return (
    <svg
      viewBox="0 0 72 80"
      className={cn("shrink-0", sizeClass, className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity={0.16} />
          <stop offset="100%" stopColor={color} stopOpacity={0.04} />
        </linearGradient>
      </defs>

      {/* Tank */}
      <rect
        x="22"
        y="6"
        width="28"
        height="20"
        rx="4"
        fill={`url(#${gradId})`}
        stroke={color}
        strokeWidth="1.75"
        opacity={0.95}
      />
      <line
        x1="24"
        y1="10"
        x2="48"
        y2="10"
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity={0.35}
      />

      {/* Tank → bowl connector */}
      <path
        d="M 32 26 L 32 32 L 40 32 L 40 26"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity={0.5}
      />

      {/* Seat rim */}
      <ellipse
        cx="36"
        cy="34"
        rx="18"
        ry="5.5"
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        opacity={0.85}
      />

      {/* Bowl */}
      <path
        d="M 18 34 C 18 34 18 52 18 56 C 18 68 26 72 36 72 C 46 72 54 68 54 56 C 54 52 54 34 54 34"
        fill={`url(#${gradId})`}
        stroke={color}
        strokeWidth="1.75"
        strokeLinejoin="round"
        opacity={0.95}
      />

      {/* Inner bowl shadow */}
      <ellipse cx="36" cy="54" rx="11" ry="9" fill={color} opacity={0.08} />

      {/* Base */}
      <ellipse cx="36" cy="74" rx="14" ry="3" fill={color} opacity={0.12} />

      {/* Number in bowl */}
      <text
        x="36"
        y="56"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={color}
        fontSize={fontSize}
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        className="tabular-nums"
      >
        {display}
      </text>
    </svg>
  )
}
