"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Syringe } from "lucide-react"
import {
  CategoryLogDialog,
  CategoryLogSubmitButton,
} from "@/components/trackers/CategoryLogDialog"
import { PeptideVialGraphic } from "@/components/PeptideVialGraphic"
import { GlassChip } from "@/components/GlassChip"
import { Label } from "@/components/ui/label"
import { useActiveDate } from "@/context/DateContext"
import { formatDisplayDate, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import {
  COMPOUNDS,
  DOSE_PRESETS_MG,
  INJECTION_SITES,
  PEPTIDE_COLOR,
  coerceInjectionSite,
  injectionSiteLabel,
  type InjectionSiteId,
} from "@/lib/peptides"

export interface LogPeptideInjectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (entry?: unknown) => void
  lastSiteUsed?: string | null
}

export function LogPeptideInjectionDialog({
  open,
  onOpenChange,
  onSaved,
  lastSiteUsed = null,
}: LogPeptideInjectionDialogProps) {
  const { activeDate } = useActiveDate()
  const [compound, setCompound] = useState("retatrutide")
  const [doseMg, setDoseMg] = useState(4)
  const [customDose, setCustomDose] = useState("")
  const [injectionSite, setInjectionSite] = useState<InjectionSiteId>("abd")
  const [injectionTime, setInjectionTime] = useState(() => format(new Date(), "HH:mm"))
  const [injectionNotes, setInjectionNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setCompound("retatrutide")
      setDoseMg(4)
      setCustomDose("")
      setInjectionTime(format(new Date(), "HH:mm"))
      setInjectionNotes("")
      setSubmitting(false)
      return
    }
    if (lastSiteUsed) {
      const last = coerceInjectionSite(lastSiteUsed)
      const order = INJECTION_SITES.map((s) => s.id)
      const idx = order.indexOf(last)
      setInjectionSite(order[(idx + 1) % order.length] ?? "abd")
    } else {
      setInjectionSite("abd")
    }
  }, [open, lastSiteUsed])

  const effectiveDose = customDose.trim() ? Number(customDose) : doseMg
  const valid = Number.isFinite(effectiveDose) && effectiveDose > 0
  const previewDoseMg = valid ? effectiveDose : null

  function selectDosePreset(mg: number) {
    setDoseMg(mg)
    setCustomDose("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || submitting) return

    setSubmitting(true)
    try {
      const [hh, mm] = injectionTime.split(":").map(Number)
      const injectedAt = new Date(`${activeDate}T00:00:00`)
      injectedAt.setHours(hh ?? 0, mm ?? 0, 0, 0)

      const res = await apiFetch("/api/peptides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: activeDate,
          injectedAt: injectedAt.toISOString(),
          compound,
          doseMg: effectiveDose,
          injectionSite,
          sideEffects: [],
          notes: injectionNotes || null,
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
      title="Log injection"
      description={`Retatrutide · ${formatDisplayDate(parseLocalDate(activeDate))}`}
      icon={Syringe}
      accentColor={PEPTIDE_COLOR}
      footer={
        <CategoryLogSubmitButton form="log-peptide-injection-form" disabled={submitting || !valid}>
          {submitting
            ? "Saving…"
            : valid
              ? `Log ${effectiveDose} mg · ${injectionSiteLabel(injectionSite)}`
              : "Log injection"}
        </CategoryLogSubmitButton>
      }
    >
      <form id="log-peptide-injection-form" onSubmit={handleSubmit} className="space-y-5">
        <div
          className="relative overflow-hidden rounded-2xl border border-border/25 bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-[#94a3b8]/[0.08] px-4 py-5 text-center"
        >
          <div className="mb-3 flex justify-center">
            <PeptideVialGraphic color={PEPTIDE_COLOR} doseMg={previewDoseMg} size="md" />
          </div>
          <p className="type-hud-label-soft mb-1">Dose</p>
          <p className="font-heading text-5xl font-semibold tabular-nums tracking-tight text-foreground">
            {valid ? effectiveDose : "—"}
          </p>
          <p className="type-hud-unit mt-1">mg</p>
          {lastSiteUsed ? (
            <p className="mt-3 type-hud-caption normal-case tracking-normal text-muted-foreground/65">
              Last site · {injectionSiteLabel(lastSiteUsed)} — rotate suggested
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label className="type-hud-label-soft">Compound</Label>
          <div className="flex flex-wrap gap-2">
            {COMPOUNDS.map((c) => (
              <GlassChip
                key={c.id}
                selected={compound === c.id}
                onClick={() => setCompound(c.id)}
              >
                {c.label}
              </GlassChip>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="type-hud-label-soft">Dose presets</Label>
          <div className="flex flex-wrap gap-2">
            {DOSE_PRESETS_MG.map((mg) => (
              <GlassChip
                key={mg}
                selected={doseMg === mg && !customDose}
                onClick={() => selectDosePreset(mg)}
              >
                {mg} mg
              </GlassChip>
            ))}
          </div>
          <input
            type="number"
            step="0.1"
            min="0.1"
            inputMode="decimal"
            placeholder="Custom dose (mg)"
            value={customDose}
            onChange={(e) => setCustomDose(e.target.value)}
            className="h-11 w-full rounded-xl border border-border/40 bg-glass-highlight/20 px-3 text-sm outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
          />
        </div>

        <div className="space-y-2">
          <Label className="type-hud-label-soft">Injection site</Label>
          <div className="flex flex-wrap gap-2">
            {INJECTION_SITES.map((site) => (
              <GlassChip
                key={site.id}
                selected={injectionSite === site.id}
                onClick={() => setInjectionSite(site.id)}
                className="min-w-[4.5rem]"
              >
                {site.shortLabel}
              </GlassChip>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="log-peptide-injection-time" className="type-hud-label-soft">
            Injection time
          </Label>
          <input
            id="log-peptide-injection-time"
            type="time"
            value={injectionTime}
            onChange={(e) => setInjectionTime(e.target.value)}
            className="h-11 w-full rounded-xl border border-border/40 bg-glass-highlight/20 px-3 text-lg tabular-nums tracking-widest outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="log-peptide-injection-notes" className="type-hud-label-soft">
            Notes
          </Label>
          <input
            id="log-peptide-injection-notes"
            type="text"
            placeholder="Optional — titration, vial, etc."
            value={injectionNotes}
            onChange={(e) => setInjectionNotes(e.target.value)}
            className="h-11 w-full rounded-xl border border-border/40 bg-glass-highlight/20 px-3 text-sm outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
          />
        </div>
      </form>
    </CategoryLogDialog>
  )
}
