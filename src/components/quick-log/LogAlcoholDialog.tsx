"use client"

import { useEffect, useState } from "react"
import { Beer } from "lucide-react"
import {
  CategoryLogDialog,
  CategoryLogSubmitButton,
} from "@/components/trackers/CategoryLogDialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useActiveDate } from "@/context/DateContext"
import { cn, formatDisplayDate, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"

const AMBER = "#f59e0b"
const DRINK_TYPES = ["beer", "wine", "spirits", "cocktail", "other"] as const

export interface LogAlcoholDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (entry?: unknown) => void
}

export function LogAlcoholDialog({ open, onOpenChange, onSaved }: LogAlcoholDialogProps) {
  const { activeDate } = useActiveDate()
  const [drinkType, setDrinkType] = useState<string>("beer")
  const [quantity, setQuantity] = useState("1")
  const [units, setUnits] = useState("1")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setDrinkType("beer")
      setQuantity("1")
      setUnits("1")
      setSubmitting(false)
    }
  }, [open])

  const qty = parseFloat(quantity)
  const unitN = parseFloat(units)
  const valid =
    Number.isFinite(qty) && qty > 0 && Number.isFinite(unitN) && unitN > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || submitting) return

    setSubmitting(true)
    try {
      const res = await apiFetch("/api/alcohol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: activeDate,
          drinkType,
          quantity: qty,
          units: unitN,
        }),
      })

      if (res.ok) {
        const entry = await res.json().catch(() => null)
        onOpenChange(false)
        onSaved?.(entry)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CategoryLogDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Log drink"
      description={formatDisplayDate(parseLocalDate(activeDate))}
      icon={Beer}
      accentColor={AMBER}
      footer={
        <CategoryLogSubmitButton form="log-alcohol-form" disabled={submitting || !valid}>
          {submitting
            ? "Saving…"
            : valid
              ? `Log ${unitN} unit${unitN === 1 ? "" : "s"}`
              : "Log drink"}
        </CategoryLogSubmitButton>
      }
    >
      <form id="log-alcohol-form" onSubmit={handleSubmit} className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {DRINK_TYPES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDrinkType(d)}
              className={cn(
                "rounded-full px-3.5 py-2 text-[12px] font-semibold capitalize tracking-wide transition-all touch-manipulation",
                drinkType === d
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/25 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              {d}
            </button>
          ))}
        </div>

        <div
          className="relative overflow-hidden rounded-2xl border border-border/25 bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-[#f59e0b]/[0.08] px-4 py-6 text-center"
        >
          <p className="type-hud-label-soft mb-2">Standard units</p>
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            placeholder="0"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            autoFocus
            className="w-full bg-transparent text-center font-heading text-5xl font-semibold tabular-nums tracking-tight text-foreground outline-none placeholder:text-muted-foreground/25"
            aria-label="Standard units"
          />
          <p className="type-hud-unit mt-1">units · {drinkType}</p>
        </div>

        <div className="space-y-2">
          <Label className="type-hud-label-soft">Quantity</Label>
          <div className="grid grid-cols-4 gap-2">
            {["0.5", "1", "2", "3"].map((n) => (
              <Button
                key={n}
                type="button"
                variant={quantity === n ? "default" : "outline"}
                onClick={() => setQuantity(n)}
                className="h-11 rounded-xl touch-manipulation"
              >
                {n}x
              </Button>
            ))}
          </div>
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="h-11 w-full rounded-xl border border-border/40 bg-glass-highlight/20 px-3 text-sm tabular-nums outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
            aria-label="Custom quantity"
          />
        </div>
      </form>
    </CategoryLogDialog>
  )
}
