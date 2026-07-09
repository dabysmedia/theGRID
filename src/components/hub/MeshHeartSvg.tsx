"use client"

import { useId, useMemo } from "react"
import { cn } from "@/lib/utils"

type Props = {
  accent?: string
  className?: string
}

type Pt = { x: number; y: number }

/**
 * Mesh/node heart — low-opacity fill, lattice edges + glowing nodes.
 * Used in hub readiness strip and Vitals tile.
 */
export function MeshHeartSvg({ accent = "#f43f5e", className }: Props) {
  const uid = useId().replace(/:/g, "")
  const clipId = `mesh-heart-clip-${uid}`
  const fillId = `mesh-heart-fill-${uid}`
  const glowId = `mesh-heart-glow-${uid}`
  const nodeGlowId = `mesh-heart-node-${uid}`

  const heartPath =
    "M50 88 C20 68 8 48 8 32 C8 18 18 10 30 10 C40 10 47 16 50 24 C53 16 60 10 70 10 C82 10 92 18 92 32 C92 48 80 68 50 88 Z"

  const { nodes, edges } = useMemo(() => {
    const cols = 8
    const rows = 9
    const xs = Array.from({ length: cols }, (_, i) => 14 + i * ((100 - 28) / (cols - 1)))
    const ys = Array.from({ length: rows }, (_, i) => 12 + i * ((90 - 12) / (rows - 1)))

    const grid: Pt[][] = ys.map((y) => xs.map((x) => ({ x, y })))
    const nodeList: Pt[] = []
    const edgeList: [Pt, Pt][] = []

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = grid[r]![c]!
        nodeList.push(p)
        if (c + 1 < cols) edgeList.push([p, grid[r]![c + 1]!])
        if (r + 1 < rows) edgeList.push([p, grid[r + 1]![c]!])
        if (r + 1 < rows && c + 1 < cols && (r + c) % 2 === 0) {
          edgeList.push([p, grid[r + 1]![c + 1]!])
        }
      }
    }

    return { nodes: nodeList, edges: edgeList }
  }, [])

  return (
    <svg viewBox="0 0 100 100" className={cn(className)} aria-hidden fill="none">
      <defs>
        <clipPath id={clipId}>
          <path d={heartPath} />
        </clipPath>
        <linearGradient id={fillId} x1="20" y1="10" x2="80" y2="90">
          <stop offset="0%" stopColor={accent} stopOpacity="0.07" />
          <stop offset="55%" stopColor={accent} stopOpacity="0.02" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.04" />
        </linearGradient>
        <filter id={glowId} x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="0.85" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={nodeGlowId} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.05" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path d={heartPath} fill={`url(#${fillId})`} />

      <g clipPath={`url(#${clipId})`}>
        {edges.map(([a, b], i) => (
          <line
            key={`e-${i}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={i % 3 === 0 ? "#67e8f9" : accent}
            strokeWidth="0.5"
            strokeOpacity={0.32 + (i % 4) * 0.04}
          />
        ))}
        {nodes.map((p, i) => (
          <circle
            key={`n-${i}`}
            cx={p.x}
            cy={p.y}
            r={i % 5 === 0 ? 1.4 : 1}
            fill={i % 3 === 0 ? "#a5f3fc" : accent}
            fillOpacity={0.8}
            filter={i % 4 === 0 ? `url(#${nodeGlowId})` : undefined}
          />
        ))}
      </g>

      <path
        d={heartPath}
        stroke={accent}
        strokeWidth="1.3"
        strokeLinejoin="round"
        filter={`url(#${glowId})`}
        opacity="0.72"
      />
      <path
        d={heartPath}
        stroke="#ffffff"
        strokeWidth="0.35"
        strokeOpacity="0.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}
