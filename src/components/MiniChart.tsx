"use client"

import { ResponsiveContainer, AreaChart, Area } from "recharts"

interface MiniChartProps {
  data: { value: number }[]
  color?: string
}

export function MiniChart({ data, color = "oklch(0.82 0.18 110)" }: MiniChartProps) {
  if (!data.length) {
    return (
      <div className="h-12 w-full flex items-center justify-center">
        <div className="flex gap-1 items-end h-6">
          {[3, 5, 4, 6, 3, 5, 7].map((h, i) => (
            <div
              key={i}
              className="w-1 rounded-full bg-muted-foreground/15"
              style={{ height: `${h * 3}px` }}
            />
          ))}
        </div>
      </div>
    )
  }

  const gradientId = `mini-${color.replace(/[^a-zA-Z0-9]/g, "")}`

  return (
    <div className="h-12 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
