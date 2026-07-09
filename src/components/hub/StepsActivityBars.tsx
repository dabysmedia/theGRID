"use client"

import { cn } from "@/lib/utils"

type Props = {
  values: number[]
  labels: string[]
  className?: string
}

/**
 * Isometric 3D-style steps bars for the hub — CSS only (no Three.js bundle).
 * Reads as a small HUD terrain strip under the rings.
 */
export function StepsActivityBars({ values, labels, className }: Props) {
  const max = Math.max(...values, 1)
  const todayIdx = values.length - 1

  return (
    <div className={cn("relative", className)}>
      <div className="mb-2 flex items-end justify-between gap-2">
        <p className="type-hud-subsection">Steps Activity</p>
        <p className="text-[10px] tabular-nums tracking-wide text-muted-foreground/55">
          {values[todayIdx] > 0
            ? `${Math.round(values[todayIdx]).toLocaleString()} today`
            : "No steps yet"}
        </p>
      </div>

      <div
        className="relative overflow-hidden rounded-xl border border-emerald-500/15 bg-gradient-to-b from-emerald-500/[0.07] via-transparent to-transparent px-2.5 pb-2 pt-3"
        style={{
          perspective: "520px",
          perspectiveOrigin: "50% 120%",
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 bottom-7 h-10 opacity-40"
          aria-hidden
          style={{
            backgroundImage:
              "linear-gradient(to right, oklch(0.7 0.15 150 / 12%) 1px, transparent 1px), linear-gradient(to top, oklch(0.7 0.15 150 / 10%) 1px, transparent 1px)",
            backgroundSize: "14% 8px, 100% 8px",
            maskImage: "linear-gradient(to top, black, transparent)",
            transform: "rotateX(58deg) scaleY(0.85)",
            transformOrigin: "bottom center",
          }}
        />
        <div
          className="pointer-events-none absolute inset-x-3 bottom-7 h-px bg-gradient-to-r from-transparent via-emerald-400/35 to-transparent"
          aria-hidden
        />

        <div
          className="relative z-10 flex h-[4.5rem] items-end justify-between gap-1.5 px-0.5"
          style={{ transformStyle: "preserve-3d" }}
        >
          {values.map((val, i) => {
            const pct = max > 0 ? val / max : 0
            const heightPx = Math.max(10, Math.round(pct * 56))
            const isToday = i === todayIdx
            const delay = 280 + i * 70

            return (
              <div
                key={i}
                className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
              >
                <div
                  className="relative flex w-full justify-center"
                  style={{ height: 58, perspective: "240px" }}
                >
                  <div
                    className="absolute bottom-0 origin-bottom animate-bar-grow"
                    style={{
                      width: "62%",
                      maxWidth: 22,
                      height: heightPx,
                      animationDelay: `${delay}ms`,
                      transformStyle: "preserve-3d",
                      transform: "rotateX(12deg) rotateY(-18deg)",
                    }}
                  >
                    <div
                      className="absolute left-0 right-0 top-0"
                      style={{
                        height: 7,
                        transform: "translateY(-6px) rotateX(72deg)",
                        transformOrigin: "bottom",
                        background: isToday
                          ? "linear-gradient(135deg, #86efac, #22c55e)"
                          : "linear-gradient(135deg, #4ade8088, #16a34a66)",
                        boxShadow: isToday
                          ? "0 0 12px #22c55e66"
                          : "0 0 6px #22c55e22",
                      }}
                    />
                    <div
                      className="absolute bottom-0 top-0"
                      style={{
                        width: 6,
                        right: -5,
                        transform: "skewY(-38deg)",
                        transformOrigin: "left bottom",
                        background: isToday
                          ? "linear-gradient(180deg, #16a34a, #14532d)"
                          : "linear-gradient(180deg, #15803d88, #052e1688)",
                      }}
                    />
                    <div
                      className="absolute inset-0 overflow-hidden"
                      style={{
                        background: isToday
                          ? "linear-gradient(180deg, #4ade80 0%, #22c55e 45%, #15803d 100%)"
                          : "linear-gradient(180deg, #22c55e99 0%, #16a34a66 55%, #14532d55 100%)",
                        boxShadow: isToday
                          ? "inset 0 1px 0 #bbf7d0aa, 0 0 14px #22c55e55"
                          : "inset 0 1px 0 #86efac33",
                        borderRadius: "1px 1px 0 0",
                      }}
                    >
                      <div
                        className="absolute inset-x-0 top-0 h-1/3 opacity-40"
                        style={{
                          background:
                            "linear-gradient(180deg, #ffffff55, transparent)",
                        }}
                      />
                      {isToday ? (
                        <div
                          className="absolute inset-0 animate-pulse opacity-25"
                          style={{
                            background:
                              "linear-gradient(105deg, transparent 35%, #ffffff66 50%, transparent 65%)",
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>

                <span
                  className={cn(
                    "text-[10px] tracking-wider",
                    isToday
                      ? "font-semibold text-emerald-300"
                      : "text-muted-foreground/50",
                  )}
                >
                  {labels[i] ?? ""}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
