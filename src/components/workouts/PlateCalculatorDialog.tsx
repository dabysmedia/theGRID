"use client"

import { useEffect, useMemo, useState } from "react"
import { Calculator, Minus, Plus } from "lucide-react"
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

export function PlateCalculatorDialog({
  open,
  onOpenChange,
  initialWeight,
  onApply,
}: PlateCalculatorDialogProps) {
  const [targetWeight, setTargetWeight] = useState("")
  const [barWeight, setBarWeight] = useState(loadBarWeightLb)

  useEffect(() => {
    if (!open) return
    setBarWeight(loadBarWeightLb())
    setTargetWeight(
      initialWeight != null && Number.isFinite(initialWeight) && initialWeight > 0
        ? String(initialWeight)
        : "",
    )
  }, [open, initialWeight])

  const targetNum = parseFloat(targetWeight)
  const result = useMemo(
    () =>
      Number.isFinite(targetNum) && targetNum > 0
        ? calculatePlatesPerSide(targetNum, barWeight)
        : null,
    [targetNum, barWeight],
  )

  const plateGroups =
    result?.ok === true ? groupPlatesPerSide(result.perSide) : []

  function bumpTarget(delta: number) {
    const base =
      Number.isFinite(targetNum) && targetNum > 0 ? targetNum : barWeight
    const next = Math.max(barWeight, Math.round((base + delta) * 2) / 2)
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
          "glass-frost max-w-sm gap-0 p-0",
          "[&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3",
        )}
      >
        <div className="space-y-1 px-4 pb-2 pt-4 pr-12">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Calculator className="size-4" aria-hidden />
              </div>
              <DialogTitle>Plate calculator</DialogTitle>
            </div>
            <DialogDescription>
              Enter target weight — plates shown per side of the bar.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-4 pb-4">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/65">
              Bar weight
            </p>
            <div className="flex flex-wrap gap-2">
              {BAR_WEIGHT_OPTIONS_LB.map((lb) => (
                <button
                  key={lb}
                  type="button"
                  onClick={() => selectBarWeight(lb)}
                  className={cn(
                    "min-h-11 flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold tabular-nums transition-colors touch-manipulation sm:flex-none sm:min-w-[4.25rem]",
                    barWeight === lb
                      ? "bg-primary/20 text-primary ring-1 ring-primary/35"
                      : "bg-muted/30 text-muted-foreground/80 hover:bg-muted/45 active:scale-[0.98]",
                  )}
                >
                  {lb} lb
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/65">
              Target total (lb)
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-12 min-h-12 min-w-12 shrink-0 rounded-xl touch-manipulation"
                aria-label="Decrease weight by 5 lb"
                onClick={() => bumpTarget(-5)}
              >
                <Minus className="size-5" />
              </Button>
              <Input
                type="number"
                inputMode="decimal"
                placeholder={String(barWeight)}
                value={targetWeight}
                onChange={(e) => setTargetWeight(e.target.value)}
                className="h-14 min-h-14 flex-1 border-primary/25 bg-background/50 text-center text-2xl font-semibold tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-12 min-h-12 min-w-12 shrink-0 rounded-xl touch-manipulation"
                aria-label="Increase weight by 5 lb"
                onClick={() => bumpTarget(5)}
              >
                <Plus className="size-5" />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[2.5, 5, 10].map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => bumpTarget(delta)}
                  className="min-h-9 rounded-lg bg-muted/25 px-3 py-1.5 text-xs font-semibold tabular-nums text-muted-foreground/80 touch-manipulation hover:bg-muted/40"
                >
                  +{delta}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/20 bg-muted/10 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/65">
              Per side
            </p>
            {result?.ok ? (
              <>
                {plateGroups.length === 0 ? (
                  <p className="mt-2 text-base font-medium text-foreground/90">Bar only</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {plateGroups.map(({ weight, count }) => (
                      <div
                        key={weight}
                        className="flex items-center gap-1.5 rounded-xl border border-border/20 bg-background/50 px-2.5 py-2"
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
                <p className="mt-3 text-xs text-muted-foreground/70">
                  {formatPlateSummary(result.perSide)} · {barWeight} lb bar ·{" "}
                  <span className="font-semibold text-foreground/85">
                    {result.totalWeight} lb total
                  </span>
                </p>
              </>
            ) : result?.ok === false ? (
              <p className="mt-2 text-sm text-muted-foreground/75">
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

        <div className="flex gap-2.5 border-t border-border/15 px-4 py-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 min-h-12 flex-1 touch-manipulation text-base sm:text-sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="glass"
            size="lg"
            disabled={!result?.ok}
            className="h-12 min-h-12 flex-1 touch-manipulation text-base sm:text-sm press-scale"
            onClick={handleApply}
          >
            Apply weight
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
