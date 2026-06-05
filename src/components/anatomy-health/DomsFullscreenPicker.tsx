"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { createEmptyAnatomyState } from "@/lib/anatomy-health/model"
import { DEFAULT_REGION_LABELS } from "@/lib/anatomy-health/region-labels"
import { formatBodySegmentTitle, parseBodySegmentKey } from "@/lib/anatomy-health/segment-labels"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { BodySilhouetteSvg } from "./BodySilhouetteSvg"
import "./anatomy-health.css"

const EMPTY_STATE = createEmptyAnatomyState(DEFAULT_REGION_LABELS)

const SORENESS_LEVELS: { label: string; value: number }[] = [
  { label: "Trace", value: 2 },
  { label: "Light", value: 4 },
  { label: "Moderate", value: 6 },
  { label: "Strong", value: 8 },
  { label: "Very strong", value: 10 },
]

export interface DomsFullscreenPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialScores: Record<string, number>
  onConfirm: (scores: Record<string, number>) => void
}

export function DomsFullscreenPicker({
  open,
  onOpenChange,
  initialScores,
  onConfirm,
}: DomsFullscreenPickerProps) {
  const [mounted, setMounted] = useState(false)
  const [view, setView] = useState<"front" | "back">("front")
  const [scores, setScores] = useState<Record<string, number>>({})
  const [pickedKey, setPickedKey] = useState<string | null>(null)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (open) {
      setScores({ ...initialScores })
      setPickedKey(null)
      setHoveredKey(null)
      setView("front")
    }
  }, [open, initialScores])

  useEffect(() => {
    if (!pickedKey) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        setPickedKey(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pickedKey])

  const handleSelectSegment = useCallback((key: string) => {
    setPickedKey(key)
  }, [])

  const segmentLabel = useMemo(() => {
    if (!pickedKey) return null
    const p = parseBodySegmentKey(pickedKey)
    if (!p) return pickedKey
    return formatBodySegmentTitle(p.slug, p.side)
  }, [pickedKey])

  const markedList = useMemo(() => {
    return Object.entries(scores)
      .filter(([, v]) => v > 0)
      .sort(([a], [b]) => a.localeCompare(b))
  }, [scores])

  function closeMusclePopup() {
    setPickedKey(null)
  }

  function applySoreness(value: number) {
    if (!pickedKey) return
    setScores((prev) => ({ ...prev, [pickedKey]: value }))
    setPickedKey(null)
  }

  function removeMuscle() {
    if (!pickedKey) return
    setScores((prev) => {
      const next = { ...prev }
      delete next[pickedKey]
      return next
    })
    setPickedKey(null)
  }

  if (!open || !mounted) return null

  return createPortal(
    <div
      className="anatomy-health-root fixed inset-0 z-[130] isolate flex flex-col bg-background/96 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Mark muscle soreness"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/40 px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground">DOMS · muscle soreness</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            Tap a muscle, rate soreness, switch front/back. Only marked areas are saved.
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(["front", "back"] as const).map((v) => (
            <Button
              key={v}
              type="button"
              size="sm"
              variant={view === v ? "glass" : "outline"}
              className={cn(
                "type-hud-chip h-8 px-2 font-sans",
                view !== v && "border-border/50 bg-background/40"
              )}
              onClick={() => {
                setView(v)
                setPickedKey(null)
              }}
            >
              {v}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 w-full flex-1 overflow-hidden">
        <div className="anatomy-figure-chassis absolute inset-0 rounded-none border-x-0 border-border/25 shadow-none">
          <div
            className="anatomy-svg-viewport-backdrop pointer-events-none absolute inset-0"
            aria-hidden
          />
          <div className="absolute inset-0 z-[1] flex min-h-0 min-w-0 items-center justify-center p-2 sm:p-4">
            <BodySilhouetteSvg
              view={view}
              state={EMPTY_STATE}
              selectedSegmentKey={pickedKey}
              hoveredSegmentKey={hoveredKey}
              onSelectSegment={handleSelectSegment}
              onHoverSegment={setHoveredKey}
              domsScores={scores}
              domsHighlightKeys={pickedKey ? [pickedKey] : null}
              fillParent
              className="h-full w-full max-h-full max-w-full"
            />
          </div>
        </div>

        {pickedKey && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="doms-muscle-title"
            className="absolute inset-0 z-[25] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[3px]"
            onClick={closeMusclePopup}
          >
            <div
              className="glass-panel w-full max-w-md border border-border/40 p-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-2 border-b border-border/30 pb-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Soreness
                  </p>
                  <p id="doms-muscle-title" className="text-base font-semibold text-foreground leading-tight">
                    {segmentLabel}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  onClick={closeMusclePopup}
                  aria-label="Back to body map"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-3 mb-2">How sore is this area?</p>
              <div className="flex flex-col gap-1.5">
                {SORENESS_LEVELS.map(({ label, value }) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={scores[pickedKey] === value ? "glass" : "outline"}
                    className={cn(
                      "h-10 justify-start text-left text-sm",
                      scores[pickedKey] !== value && "border-border/50 bg-background/40"
                    )}
                    onClick={() => applySoreness(value)}
                  >
                    {label}
                    <span className="ml-auto font-sans text-xs text-muted-foreground tabular-nums">{value}</span>
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-3 w-full text-xs text-muted-foreground"
                onClick={removeMuscle}
              >
                Remove this muscle
              </Button>
            </div>
          </div>
        )}
      </div>

      <footer className="flex shrink-0 flex-col gap-2 border-t border-border/40 px-3 py-2.5 sm:px-4">
        {markedList.length > 0 && !pickedKey && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground shrink-0">
              Marked
            </span>
            <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
              {markedList.map(([key, val]) => {
                const p = parseBodySegmentKey(key)
                const name = p ? formatBodySegmentTitle(p.slug, p.side) : key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (p?.view && p.view !== view) setView(p.view)
                      setPickedKey(key)
                    }}
                    className="shrink-0 rounded-md border border-border/50 bg-background/60 px-2 py-1 text-left text-[10px] text-foreground backdrop-blur-sm"
                  >
                    <span className="line-clamp-1">{name}</span>
                    <span className="font-sans text-muted-foreground tabular-nums"> · {val}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="glass"
            size="sm"
            className="press-scale"
            onClick={() => {
              onConfirm(scores)
              onOpenChange(false)
            }}
          >
            Save muscle map
          </Button>
        </div>
      </footer>
    </div>,
    document.body
  )
}
