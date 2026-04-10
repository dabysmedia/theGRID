"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { createEmptyAnatomyState } from "@/lib/anatomy-health/model"
import type { SeverityLevel } from "@/lib/anatomy-health/model"
import { DEFAULT_REGION_LABELS } from "@/lib/anatomy-health/region-labels"
import { formatBodySegmentTitle, parseBodySegmentKey } from "@/lib/anatomy-health/segment-labels"
import { getConditionById } from "@/lib/recovery-catalog"
import { getInjuryPickerOptionsForSegmentKey } from "@/lib/anatomy-health/injury-picker-options"
import { injurySeverityToLevel } from "@/lib/anatomy-health/severity"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { BodySilhouetteSvg } from "./BodySilhouetteSvg"
import "./anatomy-health.css"

const EMPTY_STATE = createEmptyAnatomyState(DEFAULT_REGION_LABELS)

export type InjurySiteLogDraft = {
  conditionKey: string
  customLabel?: string
  severity: "mild" | "moderate" | "severe"
}

export interface InjuryFullscreenPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** One injury per segment key (interaction key). */
  initialBySegment: Record<string, InjurySiteLogDraft>
  onConfirm: (bySegment: Record<string, InjurySiteLogDraft>) => void
}

function severityToLevel(s: "mild" | "moderate" | "severe"): SeverityLevel {
  return injurySeverityToLevel(s)
}

export function InjuryFullscreenPicker({
  open,
  onOpenChange,
  initialBySegment,
  onConfirm,
}: InjuryFullscreenPickerProps) {
  const [mounted, setMounted] = useState(false)
  const [view, setView] = useState<"front" | "back">("front")
  const [bySegment, setBySegment] = useState<Record<string, InjurySiteLogDraft>>({})
  const [pickedKey, setPickedKey] = useState<string | null>(null)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  const [popupConditionKey, setPopupConditionKey] = useState<string | "custom" | null>(null)
  const [popupCustomLabel, setPopupCustomLabel] = useState("")
  const [popupSeverity, setPopupSeverity] = useState<"mild" | "moderate" | "severe">("mild")

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (open) {
      setBySegment({ ...initialBySegment })
      setPickedKey(null)
      setHoveredKey(null)
      setView("front")
      resetPopup()
    }
  }, [open, initialBySegment])

  function resetPopup() {
    setPopupConditionKey(null)
    setPopupCustomLabel("")
    setPopupSeverity("mild")
  }

  useEffect(() => {
    if (!pickedKey) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        closePopup()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pickedKey])

  const injuryPreviewSeverity = useMemo(() => {
    const o: Record<string, SeverityLevel> = {}
    for (const [k, v] of Object.entries(bySegment)) {
      o[k] = severityToLevel(v.severity)
    }
    return o
  }, [bySegment])

  const handleSelectSegment = useCallback((key: string) => {
    setPickedKey(key)
    const existing = bySegment[key]
    if (existing) {
      if (existing.conditionKey === "custom") {
        setPopupConditionKey("custom")
        setPopupCustomLabel(existing.customLabel ?? "")
      } else {
        setPopupConditionKey(existing.conditionKey)
        setPopupCustomLabel("")
      }
      setPopupSeverity(existing.severity)
    } else {
      resetPopup()
    }
  }, [bySegment])

  const segmentLabel = useMemo(() => {
    if (!pickedKey) return null
    const p = parseBodySegmentKey(pickedKey)
    if (!p) return pickedKey
    return formatBodySegmentTitle(p.slug, p.side)
  }, [pickedKey])

  const pickerOptions = useMemo(
    () => (pickedKey ? getInjuryPickerOptionsForSegmentKey(pickedKey) : { areaSpecific: [], general: [] }),
    [pickedKey]
  )

  function closePopup() {
    setPickedKey(null)
    resetPopup()
  }

  function applySite() {
    if (!pickedKey) return
    if (popupConditionKey === "custom") {
      const label = popupCustomLabel.trim()
      if (!label) return
      setBySegment((prev) => ({
        ...prev,
        [pickedKey]: { conditionKey: "custom", customLabel: label, severity: popupSeverity },
      }))
    } else if (popupConditionKey) {
      setBySegment((prev) => ({
        ...prev,
        [pickedKey]: { conditionKey: popupConditionKey, severity: popupSeverity },
      }))
    } else {
      return
    }
    closePopup()
  }

  function removeSite() {
    if (!pickedKey) return
    setBySegment((prev) => {
      const next = { ...prev }
      delete next[pickedKey]
      return next
    })
    closePopup()
  }

  const markedList = useMemo(() => {
    return Object.entries(bySegment)
      .sort(([a], [b]) => a.localeCompare(b))
  }, [bySegment])

  function injuryDraftTitle(d: InjurySiteLogDraft): string {
    if (d.conditionKey === "custom") return d.customLabel || "Custom"
    return getConditionById(d.conditionKey)?.name ?? d.conditionKey
  }

  if (!open || !mounted) return null

  return createPortal(
    <div
      className="anatomy-health-root fixed inset-0 z-[130] isolate flex flex-col bg-background/96 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Log injury locations"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/40 px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground">New injuries</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            Tap a body area, choose injury type and severity — same flow as muscle soreness.
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
                "h-8 px-2 text-[10px] font-mono uppercase",
                view !== v && "border-border/50 bg-background/40"
              )}
              onClick={() => {
                setView(v)
                closePopup()
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
              injurySegmentSeverity={injuryPreviewSeverity}
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
            aria-labelledby="injury-segment-title"
            className="absolute inset-0 z-[25] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[3px]"
            onClick={closePopup}
          >
            <div
              className="glass hud-corners w-full max-w-md max-h-[min(78vh,520px)] overflow-hidden flex flex-col rounded-2xl border border-border/40 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-2 border-b border-border/30 p-4 pb-3 shrink-0">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Injury</p>
                  <p id="injury-segment-title" className="text-base font-semibold text-foreground leading-tight">
                    {segmentLabel}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  onClick={closePopup}
                  aria-label="Back to body map"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1.5">Type</p>
                  {pickerOptions.areaSpecific.length > 0 ? (
                    <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                      Common for this area
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-1">
                    {pickerOptions.areaSpecific.map((c) => (
                      <Button
                        key={c.id}
                        type="button"
                        size="sm"
                        variant={popupConditionKey === c.id ? "glass" : "outline"}
                        className={cn(
                          "h-auto min-h-9 justify-start py-2 text-left text-xs",
                          popupConditionKey !== c.id && "border-border/50 bg-background/40"
                        )}
                        onClick={() => {
                          setPopupConditionKey(c.id)
                          setPopupCustomLabel("")
                        }}
                      >
                        {c.name}
                      </Button>
                    ))}
                  </div>
                </div>

                {pickerOptions.general.length > 0 ? (
                  <div>
                    <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                      General
                    </p>
                    <div className="flex flex-col gap-1">
                      {pickerOptions.general.map((c) => (
                        <Button
                          key={c.id}
                          type="button"
                          size="sm"
                          variant={popupConditionKey === c.id ? "glass" : "outline"}
                          className={cn(
                            "h-auto min-h-9 justify-start py-2 text-left text-xs",
                            popupConditionKey !== c.id && "border-border/50 bg-background/40"
                          )}
                          onClick={() => {
                            setPopupConditionKey(c.id)
                            setPopupCustomLabel("")
                          }}
                        >
                          {c.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant={popupConditionKey === "custom" ? "glass" : "outline"}
                    className={cn(
                      "w-full justify-start text-xs mb-2",
                      popupConditionKey !== "custom" && "border-border/50 bg-background/40"
                    )}
                    onClick={() => setPopupConditionKey("custom")}
                  >
                    Custom…
                  </Button>
                  {popupConditionKey === "custom" ? (
                    <Input
                      value={popupCustomLabel}
                      onChange={(e) => setPopupCustomLabel(e.target.value)}
                      placeholder="Describe the injury"
                      className="bg-black/30 border-border/45 text-sm"
                    />
                  ) : null}
                </div>

                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Severity today</Label>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(["mild", "moderate", "severe"] as const).map((s) => (
                      <Button
                        key={s}
                        type="button"
                        size="sm"
                        variant={popupSeverity === s ? "glass" : "outline"}
                        className={cn("text-[10px] uppercase", popupSeverity !== s && "bg-background/30")}
                        onClick={() => setPopupSeverity(s)}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="shrink-0 border-t border-border/30 p-4 flex flex-col gap-2">
                <Button
                  type="button"
                  variant="glass"
                  className="w-full press-scale"
                  disabled={
                    popupConditionKey === null ||
                    (popupConditionKey === "custom" && !popupCustomLabel.trim())
                  }
                  onClick={applySite}
                >
                  Save this site
                </Button>
                {bySegment[pickedKey] ? (
                  <Button type="button" variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={removeSite}>
                    Remove this site
                  </Button>
                ) : null}
              </div>
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
              {markedList.map(([key, draft]) => {
                const p = parseBodySegmentKey(key)
                const name = p ? formatBodySegmentTitle(p.slug, p.side) : key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (p?.view && p.view !== view) setView(p.view)
                      handleSelectSegment(key)
                    }}
                    className="shrink-0 rounded-md border border-border/50 bg-background/60 px-2 py-1 text-left text-[10px] text-foreground backdrop-blur-sm"
                  >
                    <span className="line-clamp-1">{name}</span>
                    <span className="text-muted-foreground"> · {injuryDraftTitle(draft)} · {draft.severity}</span>
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
              onConfirm(bySegment)
              onOpenChange(false)
            }}
          >
            Save injury map
          </Button>
        </div>
      </footer>
    </div>,
    document.body
  )
}
