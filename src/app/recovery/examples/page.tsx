"use client"

import { useState } from "react"
import Link from "next/link"
import { AnatomyCanvas } from "@/components/anatomy-health"
import { MOCK_EXAMPLES, MOCK_EXAMPLE_INJURY_SEGMENTS } from "@/lib/anatomy-health/mock-examples"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const KEYS = ["nominal", "lowerLimbFocus", "multiSite"] as const

/**
 * Internal fixture viewer for the anatomy HUD (mock data only).
 * Not linked from main nav — visit /recovery/examples directly.
 */
export default function RecoveryAnatomyExamplesPage() {
  const [key, setKey] = useState<(typeof KEYS)[number]>("lowerLimbFocus")
  const state = MOCK_EXAMPLES[key]()

  return (
    <div className="space-y-4 pb-8">
      <div className="glass-subtle hud-corners rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-border/35">
        <div>
          <h1 className="text-lg font-sans font-semibold uppercase tracking-[0.2em] text-foreground flex items-center gap-2">
            <span className="status-dot" style={{ width: 5, height: 5 }} />
            Anatomy fixtures
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Mock states for layout QA. Production UI lives on{" "}
            <Link href="/workouts#recovery" className="underline underline-offset-2 text-primary hover:text-primary/80">
              /workouts#recovery
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {KEYS.map((k) => (
            <Button
              key={k}
              type="button"
              size="sm"
              variant={key === k ? "glass" : "outline"}
              className={cn(
                "type-hud-chip font-sans",
                key !== k && "border-border/50 bg-background/30"
              )}
              onClick={() => setKey(k)}
            >
              {k}
            </Button>
          ))}
        </div>
      </div>
      <AnatomyCanvas state={state} injurySegmentSeverity={MOCK_EXAMPLE_INJURY_SEGMENTS[key]} />
    </div>
  )
}
