"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, ChevronDown, RefreshCcw, Sparkles, X } from "lucide-react"
import { apiFetch } from "@/lib/api-fetch"
import { cn } from "@/lib/utils"
import type {
  CoachCalorieEstimateItem,
  CoachCalorieEstimateResponse,
} from "@/lib/coach/types"

/**
 * Pre-fill payload pushed back into the parent's Log Food form.
 * Mirrors the shape that `FoodSearch.onSelect` already supports so the parent
 * handler can be a thin one-liner (description + macros).
 */
export interface PhotoEstimatePrefill {
  description: string
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  imageUrl: string | null
}

interface PhotoCalorieEstimatorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When the user picks an item or "Use total", parent fills its form. */
  onUsePrefill: (prefill: PhotoEstimatePrefill) => void
  /** Disable everything (e.g. vacation mode, edit mode). */
  disabled?: boolean
  /** Skip the collapsible header and always show the estimator body. */
  embedded?: boolean
}

const CONFIDENCE_TONE: Record<
  CoachCalorieEstimateResponse["confidence"],
  string
> = {
  low: "text-amber-300",
  med: "text-primary",
  high: "text-emerald-300",
}

const CONFIDENCE_LABEL: Record<
  CoachCalorieEstimateResponse["confidence"],
  string
> = {
  low: "Low confidence",
  med: "Medium confidence",
  high: "High confidence",
}

export function PhotoCalorieEstimator({
  open,
  onOpenChange,
  onUsePrefill,
  disabled = false,
  embedded = false,
}: PhotoCalorieEstimatorProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<CoachCalorieEstimateResponse | null>(
    null
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  const cleanupImage = useCallback(async (url: string | null) => {
    if (!url) return
    try {
      await apiFetch(`/api/coach/uploads?url=${encodeURIComponent(url)}`, {
        method: "DELETE",
      })
    } catch {
      /* best-effort */
    }
  }, [])

  const reset = useCallback(
    async (opts: { keepImage?: boolean } = {}) => {
      setEstimate(null)
      setError(null)
      if (!opts.keepImage) {
        const prevUrl = imageUrl
        setImageUrl(null)
        await cleanupImage(prevUrl)
      }
    },
    [cleanupImage, imageUrl]
  )

  const runEstimate = useCallback(
    async (file: File) => {
      setError(null)
      setBusy(true)
      // Replace any previous image / estimate so we don't leave orphan files on disk.
      const prevUrl = imageUrl
      setImageUrl(null)
      setEstimate(null)
      try {
        const fd = new FormData()
        fd.append("file", file)
        const upRes = await apiFetch("/api/coach/uploads", {
          method: "POST",
          body: fd,
        })
        const upData = await upRes.json()
        if (!upRes.ok) throw new Error(upData?.error || "Upload failed.")
        const newUrl = String(upData.url)
        setImageUrl(newUrl)

        const estRes = await apiFetch("/api/coach/estimate-calories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imagePath: newUrl }),
        })
        const estData = await estRes.json()
        if (!estRes.ok) {
          throw new Error(estData?.error || "Estimate failed.")
        }
        setEstimate(estData as CoachCalorieEstimateResponse)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Estimate failed.")
      } finally {
        setBusy(false)
        // Clean up the previous photo (if any) once the new flow is settled.
        if (prevUrl) void cleanupImage(prevUrl)
      }
    },
    [cleanupImage, imageUrl]
  )

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file) return
      void runEstimate(file)
    },
    [runEstimate]
  )

  const handleUseItem = useCallback(
    (item: CoachCalorieEstimateItem) => {
      const desc = item.qty ? `${item.qty} ${item.name}`.trim() : item.name
      onUsePrefill({
        description: desc,
        calories: Math.round(item.kcal),
        protein: Number.isFinite(item.protein_g) ? item.protein_g : null,
        carbs: Number.isFinite(item.carbs_g) ? item.carbs_g : null,
        fat: Number.isFinite(item.fat_g) ? item.fat_g : null,
        imageUrl,
      })
    },
    [imageUrl, onUsePrefill]
  )

  const handleUseTotal = useCallback(() => {
    if (!estimate) return
    const description =
      estimate.items.length === 1
        ? `${estimate.items[0].qty || ""} ${estimate.items[0].name}`.trim() ||
          "Photo meal"
        : `Photo meal (${estimate.items.length} items): ${estimate.items
            .map((i) => i.name)
            .join(", ")}`
    onUsePrefill({
      description: description.slice(0, 200),
      calories: Math.round(estimate.totals.kcal),
      protein: Number.isFinite(estimate.totals.protein_g)
        ? estimate.totals.protein_g
        : null,
      carbs: Number.isFinite(estimate.totals.carbs_g)
        ? estimate.totals.carbs_g
        : null,
      fat: Number.isFinite(estimate.totals.fat_g) ? estimate.totals.fat_g : null,
      imageUrl,
    })
  }, [estimate, imageUrl, onUsePrefill])

  const handleToggle = useCallback(() => {
    if (disabled) return
    if (open) {
      // Closing — leave the result/image in place; reopening should restore it.
      onOpenChange(false)
      return
    }
    onOpenChange(true)
    // If neither file picker nor estimate has been used yet, trigger picker on open.
    if (!busy && !estimate && !imageUrl) {
      window.setTimeout(() => fileInputRef.current?.click(), 0)
    }
  }, [busy, disabled, estimate, imageUrl, onOpenChange, open])

  const triggerPicker = useCallback(() => {
    if (busy || disabled) return
    fileInputRef.current?.click()
  }, [busy, disabled])

  // In embedded mode, open the camera/file picker once when first shown.
  const autoPickRef = useRef(false)
  useEffect(() => {
    if (!embedded || disabled || busy || estimate || imageUrl || autoPickRef.current) return
    autoPickRef.current = true
    const t = window.setTimeout(() => fileInputRef.current?.click(), 50)
    return () => window.clearTimeout(t)
  }, [embedded, disabled, busy, estimate, imageUrl])

  return (
    <div className="space-y-2">
      {!embedded && (
        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          aria-expanded={open}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-xl border border-border/25 bg-glass-highlight/[0.04] py-2.5 px-3 text-left text-[11px] font-medium text-muted-foreground transition-colors",
            "hover:text-foreground hover:bg-glass-highlight/10",
            "disabled:pointer-events-none disabled:opacity-45",
            (estimate || imageUrl) && "border-primary/30 text-foreground"
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Camera className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className="truncate">
              {estimate
                ? "Photo estimate ready"
                : imageUrl
                ? "Photo uploaded"
                : "Estimate from photo"}
            </span>
            <span className="shrink-0 text-[9px] uppercase tracking-wider text-primary/70">
              AI
            </span>
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 opacity-40 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFile}
      />

      {(open || embedded) && (
        <div
          className={cn(
            "space-y-2.5",
            !embedded &&
              "rounded-xl border border-border/25 bg-glass-highlight/[0.04] p-3 animate-in fade-in slide-in-from-top-1 duration-200"
          )}
        >
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
              {error}
            </div>
          )}

          {!imageUrl && !busy && !estimate && (
            <button
              type="button"
              onClick={triggerPicker}
              disabled={disabled}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-45"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/15 text-primary">
                <Camera className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-sm font-medium text-foreground">
                Snap or choose a meal photo
              </span>
              <span className="max-w-[18rem] text-[11px] leading-snug text-muted-foreground">
                The AI Coach will estimate calories and macros. Review before
                logging — estimates can be off.
              </span>
            </button>
          )}

          {imageUrl && (
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Meal photo"
                className="h-20 w-20 shrink-0 rounded-lg border border-glass-border object-cover"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                {busy && (
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Sparkles className="h-3 w-3 animate-pulse text-primary" aria-hidden />
                    Estimating macros…
                  </p>
                )}
                {!busy && estimate && (
                  <p className="text-[11px] text-muted-foreground">
                    <span
                      className={cn(
                        "font-semibold uppercase tracking-wider",
                        CONFIDENCE_TONE[estimate.confidence]
                      )}
                    >
                      {CONFIDENCE_LABEL[estimate.confidence]}
                    </span>
                    {estimate.caveats && (
                      <span className="block text-[10px] italic leading-snug text-muted-foreground/70">
                        {estimate.caveats}
                      </span>
                    )}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={triggerPicker}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md border border-border/30 bg-background/40 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-border/55 hover:text-foreground disabled:opacity-45"
                  >
                    <RefreshCcw className="h-3 w-3" aria-hidden />
                    Re-take
                  </button>
                  <button
                    type="button"
                    onClick={() => void reset()}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground/70 transition-colors hover:text-destructive disabled:opacity-45"
                  >
                    <X className="h-3 w-3" aria-hidden />
                    Discard
                  </button>
                </div>
              </div>
            </div>
          )}

          {!busy && estimate && (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-glass-border bg-glass-highlight/30 p-2 text-center">
                <Stat label="kcal" value={Math.round(estimate.totals.kcal).toString()} />
                <Stat label="P (g)" value={fmt(estimate.totals.protein_g)} />
                <Stat label="C (g)" value={fmt(estimate.totals.carbs_g)} />
                <Stat label="F (g)" value={fmt(estimate.totals.fat_g)} />
              </div>

              <ul className="space-y-1">
                {estimate.items.map((it, idx) => (
                  <li
                    key={`${it.name}-${idx}`}
                    className="flex items-center gap-2 rounded-lg border border-glass-border/40 bg-glass-highlight/[0.04] px-2.5 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-foreground">
                        {it.name}
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {it.qty} · {Math.round(it.kcal)} kcal · P {fmt(it.protein_g)} · C{" "}
                        {fmt(it.carbs_g)} · F {fmt(it.fat_g)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUseItem(it)}
                      className="shrink-0 rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary transition-colors hover:border-primary/40 hover:bg-primary/18"
                    >
                      Use
                    </button>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  Pre-fills the form below — review before adding.
                </span>
                <button
                  type="button"
                  onClick={handleUseTotal}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/15 px-3 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-primary/22"
                >
                  Use total · {Math.round(estimate.totals.kcal).toLocaleString()} cal
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-heading text-sm font-semibold tabular-nums text-foreground">
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  )
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0"
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
