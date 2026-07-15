"use client"

import { useMemo, useState, type CSSProperties } from "react"
import { Calculator, Minus, Plus, Scale } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  BAR_WEIGHT_OPTIONS_LB,
  calculatePlatesPerSide,
  formatPlateSummary,
  groupPlatesPerSide,
  loadBarWeightLb,
  PLATE_COLORS_LB,
  saveBarWeightLb,
} from "@/lib/plate-calculator"
import { cn } from "@/lib/utils"

interface PlateCalculatorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialWeight: number | null
  onApply: (weightLb: number) => void
}

const PLATE_HEIGHT_LB: Record<number, number> = {
  45: 132,
  35: 124,
  25: 112,
  10: 98,
  5: 88,
  2.5: 80,
}

const PLATE_WIDTH_LB: Record<number, number> = {
  45: 34,
  35: 32,
  25: 29,
  10: 25,
  5: 23,
  2.5: 20,
}

function roundToLoadableTotal(weight: number, barWeight: number): number {
  return Math.max(barWeight, barWeight + Math.round((weight - barWeight) / 5) * 5)
}

function BarbellLoadGraphic({
  plates,
  totalWeight,
  barWeight,
}: {
  plates: number[]
  totalWeight: number | null
  barWeight: number
}) {
  const plateStackWidth = plates.reduce(
    (sum, weight) => sum + Math.max(1, (PLATE_WIDTH_LB[weight] ?? 10) - 2),
    0,
  )
  const collarWidth = 16
  const collarLeft = `calc(50% - ${plateStackWidth / 2 + collarWidth}px)`

  const renderLoadedSleeve = () => (
    <div
      className="absolute top-[54%] z-10 flex -translate-y-1/2 items-center"
      style={{ left: collarLeft }}
      aria-hidden
    >
      <div className="relative z-10 h-11 w-4 shrink-0 rounded-[4px] border border-white/20 bg-gradient-to-r from-slate-600 via-slate-200/85 to-slate-700 shadow-[inset_1px_0_0_rgba(255,255,255,0.25),0_0_8px_rgba(226,232,240,0.12)]" />
      {plates.map((weight, index) => {
        const color = PLATE_COLORS_LB[weight] ?? "#64748b"
        return (
          <div
            key={`${weight}-${index}`}
            className="plate-calc-plate relative -mx-px flex shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-black/35 shadow-[inset_1px_0_0_rgba(255,255,255,0.28),inset_-1px_0_0_rgba(0,0,0,0.28),0_5px_12px_rgba(0,0,0,0.35)]"
            style={
              {
                width: PLATE_WIDTH_LB[weight] ?? 10,
                height: PLATE_HEIGHT_LB[weight] ?? 54,
                background: `linear-gradient(90deg, color-mix(in srgb, ${color} 70%, black), ${color} 48%, color-mix(in srgb, ${color} 75%, white))`,
                animationDelay: `${90 + index * 65}ms`,
              } as CSSProperties
            }
          >
            <span
              className={cn(
                "font-black leading-none text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.65)]",
                (PLATE_WIDTH_LB[weight] ?? 10) < 18 ? "text-[6px]" : "text-[8px]",
              )}
            >
              {weight}
            </span>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="relative h-[10.25rem] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#070a0e]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.025) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          maskImage: "linear-gradient(to bottom, black, transparent 90%)",
        }}
        aria-hidden
      />
      <div className="absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-3">
        <div>
          <p className="type-hud-micro text-muted-foreground/55">Loaded bar</p>
          <p className="mt-1 font-heading text-xl font-semibold tabular-nums tracking-tight text-foreground/95">
            {totalWeight != null ? totalWeight : barWeight}
            <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/45">
              lb
            </span>
          </p>
        </div>
        <p className="rounded-lg border border-[#c4d632]/15 bg-[#c4d632]/[0.06] px-2 py-1 type-hud-micro text-[#dce95c]/75">
          {plates.length > 0
            ? `${plates.length} plate${plates.length === 1 ? "" : "s"} shown`
            : "Bar only"}
        </p>
      </div>

      <div
        className="absolute -left-6 top-[54%] h-3.5 -translate-y-1/2 border-y border-white/15 bg-slate-500 shadow-[0_2px_7px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.32)]"
        style={{ right: `calc(50% + ${plateStackWidth / 2 + collarWidth}px)` }}
        aria-hidden
      >
        <div className="absolute inset-0 opacity-35 [background:repeating-linear-gradient(135deg,transparent_0_2px,rgba(255,255,255,.32)_2px_3px)]" />
      </div>
      <div className="absolute inset-y-0 left-1/2 w-[54%] -translate-x-1/2 overflow-hidden" aria-hidden>
        <div
          className="absolute top-[54%] h-4 -translate-y-1/2 rounded-r-full border border-white/15 bg-gradient-to-b from-slate-300/80 via-slate-500/85 to-slate-800 shadow-[0_3px_10px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.38)]"
          style={{ left: collarLeft, width: plateStackWidth + collarWidth + 72 }}
        />
        {renderLoadedSleeve()}
      </div>
      <div className="pointer-events-none absolute inset-x-10 bottom-2 h-px bg-gradient-to-r from-transparent via-[#c4d632]/35 to-transparent" aria-hidden />
    </div>
  )
}

export function PlateCalculatorDialog({
  open,
  onOpenChange,
  initialWeight,
  onApply,
}: PlateCalculatorDialogProps) {
  const [targetWeight, setTargetWeight] = useState(() =>
    initialWeight != null && Number.isFinite(initialWeight) && initialWeight > 0
      ? String(initialWeight)
      : "",
  )
  const [barWeight, setBarWeight] = useState(loadBarWeightLb)

  const targetNum = parseFloat(targetWeight)
  const loadableTarget =
    Number.isFinite(targetNum) && targetNum > 0
      ? roundToLoadableTotal(targetNum, barWeight)
      : null
  const result = useMemo(
    () =>
      loadableTarget != null
        ? calculatePlatesPerSide(loadableTarget, barWeight)
        : null,
    [loadableTarget, barWeight],
  )

  const plateGroups = result?.ok === true ? groupPlatesPerSide(result.perSide) : []

  function bumpTarget(delta: number) {
    const base = loadableTarget ?? barWeight
    const next = roundToLoadableTotal(base + delta, barWeight)
    setTargetWeight(String(next))
  }

  function selectBarWeight(lb: number) {
    setBarWeight(lb)
    saveBarWeightLb(lb)
  }

  function handleApply() {
    if (!result?.ok) return
    onApply(result.totalWeight)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        priority="high"
        className={cn(
          "glass-frost !flex w-[calc(100vw-1rem)] max-h-[min(94dvh,52rem)] max-w-md flex-col gap-0 overflow-hidden rounded-[1.65rem] border-white/[0.1] bg-[#080b10]/95 p-0 shadow-[0_30px_90px_rgba(0,0,0,0.72)]",
          "[&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3",
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(ellipse_70%_80%_at_20%_0%,rgba(196,214,50,0.11),transparent_72%)]" aria-hidden />
        <div className="relative space-y-1 px-4 pb-3 pt-4 pr-12 sm:px-5">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-xl border border-[#c4d632]/20 bg-[#c4d632]/10 text-[#dce95c] shadow-[0_0_18px_rgba(196,214,50,0.12)]">
                <Calculator className="size-4" aria-hidden />
              </div>
              <div>
                <p className="type-hud-micro text-[#c4d632]/70">Loadout</p>
                <DialogTitle className="mt-0.5">Plate calculator</DialogTitle>
              </div>
            </div>
            <DialogDescription>
              Set the total and build the same stack on both sides.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="type-hud-caption">Target total</p>
              <p className="type-hud-micro text-muted-foreground/45">Pounds</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-12 min-h-12 min-w-12 shrink-0 rounded-xl border-white/10 bg-white/[0.025] touch-manipulation"
                aria-label="Decrease weight by 5 lb"
                onClick={() => bumpTarget(-5)}
              >
                <Minus className="size-5" />
              </Button>
              <Input
                type="number"
                inputMode="decimal"
                step="5"
                placeholder={String(barWeight)}
                value={targetWeight}
                onChange={(event) => setTargetWeight(event.target.value)}
                onBlur={() => {
                  if (loadableTarget != null) setTargetWeight(String(loadableTarget))
                }}
                aria-label="Target total weight in pounds"
                className="h-14 min-h-14 flex-1 rounded-xl border-[#c4d632]/25 bg-black/25 text-center font-heading text-2xl font-semibold tabular-nums text-foreground shadow-[inset_0_0_18px_rgba(196,214,50,0.035)] focus-visible:border-[#c4d632]/50 focus-visible:ring-[#c4d632]/20"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-12 min-h-12 min-w-12 shrink-0 rounded-xl border-white/10 bg-white/[0.025] touch-manipulation"
                aria-label="Increase weight by 5 lb"
                onClick={() => bumpTarget(5)}
              >
                <Plus className="size-5" />
              </Button>
            </div>
          </div>

          <BarbellLoadGraphic
            plates={result?.ok ? result.perSide : []}
            totalWeight={result?.ok ? result.totalWeight : null}
            barWeight={barWeight}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="type-hud-caption">Add a plate pair</p>
              <p className="type-hud-micro text-muted-foreground/45">One per side</p>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {[2.5, 5, 10, 25, 35, 45].map((plate) => (
                <button
                  key={plate}
                  type="button"
                  onClick={() => bumpTarget(plate * 2)}
                  className="group flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border border-white/[0.07] bg-white/[0.022] text-[10px] font-semibold tabular-nums text-muted-foreground/70 transition-all hover:border-white/15 hover:bg-white/[0.045] active:scale-[0.96] touch-manipulation"
                  aria-label={`Add one ${plate} pound plate per side`}
                >
                  <span
                    className="h-2.5 w-4 rounded-[2px] border border-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] transition-transform group-active:scale-90"
                    style={{ backgroundColor: PLATE_COLORS_LB[plate] ?? "#64748b" }}
                    aria-hidden
                  />
                  {plate}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 type-hud-caption">Bar</p>
            <div className="grid grid-cols-4 gap-1.5">
              {BAR_WEIGHT_OPTIONS_LB.map((lb) => (
                <button
                  key={lb}
                  type="button"
                  onClick={() => selectBarWeight(lb)}
                  className={cn(
                    "min-h-10 rounded-xl border px-2 py-2 text-xs font-semibold tabular-nums transition-all touch-manipulation active:scale-[0.97]",
                    barWeight === lb
                      ? "border-[#c4d632]/35 bg-[#c4d632]/10 text-[#dce95c] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                      : "border-white/[0.07] bg-white/[0.02] text-muted-foreground/65 hover:bg-white/[0.04]",
                  )}
                >
                  {lb} lb
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.035] to-transparent p-3.5">
            <div className="flex items-center gap-2">
              <Scale className="size-3.5 text-[#c4d632]/70" aria-hidden />
              <p className="type-hud-caption">Per side</p>
            </div>
            {result?.ok ? (
              <>
                {plateGroups.length === 0 ? (
                  <p className="mt-2 text-base font-medium text-foreground/90">Bar only</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {plateGroups.map(({ weight, count }) => (
                      <div
                        key={weight}
                        className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-black/20 px-2.5 py-2"
                      >
                        <span
                          className="size-3 shrink-0 rounded-sm ring-1 ring-black/10"
                          style={{ backgroundColor: PLATE_COLORS_LB[weight] ?? "#64748b" }}
                          aria-hidden
                        />
                        <span className="text-sm font-bold tabular-nums text-foreground">
                          {weight}
                          {count > 1 ? (
                            <span className="ml-0.5 text-xs font-semibold text-muted-foreground/70">
                              ×{count}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-xs text-muted-foreground/65">
                  {formatPlateSummary(result.perSide)} · {barWeight} lb bar ·{" "}
                  <span className="font-semibold text-foreground/85">
                    {result.totalWeight} lb total
                  </span>
                </p>
              </>
            ) : result?.ok === false ? (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground/70">
                {result.reason === "too_light"
                  ? `Weight must be at least ${barWeight} lb (empty bar).`
                  : result.reason === "not_loadable"
                    ? result.shortByLb != null
                      ? `Can't load exactly — add ${result.shortByLb} lb more (2.5 lb increments).`
                      : "Can't load exactly with standard plates."
                    : "Enter a target weight above the bar."}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground/55">
                Enter weight to see plates.
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2.5 border-t border-white/[0.07] bg-[#080b10]/92 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:px-5">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 min-h-12 flex-1 rounded-xl border-white/10 bg-white/[0.025] touch-manipulation text-base sm:text-sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="glass"
            size="lg"
            disabled={!result?.ok}
            className="h-12 min-h-12 flex-1 rounded-xl touch-manipulation text-base sm:text-sm press-scale"
            onClick={handleApply}
          >
            Apply weight
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
