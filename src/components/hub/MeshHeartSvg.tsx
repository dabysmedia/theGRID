"use client"

import { useId } from "react"
import { cn } from "@/lib/utils"

type Props = {
  accent?: string
  className?: string
}

/** Mesh-line heart graphic used in the Vitals hub tile. */
export function MeshHeartSvg({ accent = "#f43f5e", className }: Props) {
  const uid = useId().replace(/:/g, "")
  const clipId = `mesh-heart-clip-${uid}`
  const fillId = `mesh-heart-fill-${uid}`
  const glowId = `mesh-heart-glow-${uid}`
  const heartPath =
    "M50 88 C20 68 8 48 8 32 C8 18 18 10 30 10 C40 10 47 16 50 24 C53 16 60 10 70 10 C82 10 92 18 92 32 C92 48 80 68 50 88 Z"

  return (
    <svg viewBox="0 0 100 100" className={cn(className)} aria-hidden fill="none">
      <defs>
        <clipPath id={clipId}>
          <path d={heartPath} />
        </clipPath>
        <linearGradient id={fillId} x1="20" y1="10" x2="80" y2="90">
          <stop offset="0%" stopColor={accent} stopOpacity="0.32" />
          <stop offset="55%" stopColor={accent} stopOpacity="0.12" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.18" />
        </linearGradient>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path d={heartPath} fill={`url(#${fillId})`} />

      <g clipPath={`url(#${clipId})`} opacity="0.9">
        {Array.from({ length: 11 }, (_, i) => {
          const y = 12 + i * 7.5
          return (
            <line
              key={`h-${i}`}
              x1="6"
              y1={y}
              x2="94"
              y2={y}
              stroke={accent}
              strokeWidth="0.55"
              strokeOpacity={0.24 + (i % 3) * 0.05}
            />
          )
        })}
        {Array.from({ length: 11 }, (_, i) => {
          const x = 12 + i * 7.5
          return (
            <line
              key={`v-${i}`}
              x1={x}
              y1="8"
              x2={x}
              y2="92"
              stroke="#67e8f9"
              strokeWidth="0.45"
              strokeOpacity={0.16 + (i % 2) * 0.06}
            />
          )
        })}
        {Array.from({ length: 7 }, (_, i) => (
          <line
            key={`d-${i}`}
            x1={8 + i * 12}
            y1="10"
            x2={28 + i * 12}
            y2="90"
            stroke={accent}
            strokeWidth="0.4"
            strokeOpacity="0.14"
          />
        ))}
      </g>

      <path
        d={heartPath}
        stroke={accent}
        strokeWidth="1.85"
        strokeLinejoin="round"
        filter={`url(#${glowId})`}
        opacity="0.95"
      />
      <path
        d={heartPath}
        stroke="#ffffff"
        strokeWidth="0.5"
        strokeOpacity="0.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}
