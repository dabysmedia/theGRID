"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { Syringe } from "lucide-react"
import {
  CategoryLogDialog,
  CategoryLogSubmitButton,
} from "@/components/trackers/CategoryLogDialog"
import { PeptideVialGraphic } from "@/components/PeptideVialGraphic"
import { GlassChip } from "@/components/GlassChip"
import { SectionRail } from "@/components/SectionRail"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActiveDate } from "@/context/DateContext"
import { formatDisplayDate, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import {
  COMPOUNDS,
  DOSE_PRESETS_MG,
  INJECTION_SITE_REGIONS,
  INJECTION_SITES,
  PEPTIDE_COLOR,
  SIDE_EFFECTS,
  injectionSiteLabel,
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
  const [injectionSite, setInjectionSite] = useState("abdomen_upper_right")
  const [siteRegion, setSiteRegion] = useState("abdomen")
  const [injectionSideEffects, setInjectionSideEffects] = useState<string[]>([])
  const [injectionTime, setInjectionTime] = useState(() => format(new Date(), "HH:mm"))
  const [injectionNotes, setInjectionNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setCompound("retatrutide")
      setDoseMg(4)
      setCustomDose("")
      setInjectionSite("abdomen_upper_right")
      setSiteRegion("abdomen")
      setInjectionSideEffects([])
      setInjectionTime(format(new Date(), "HH:mm"))
      setInjectionNotes("")
      setSubmitting(false)
    }
  }, [open])

  const sitesInRegion = useMemo(
    () => INJECTION_SITES.filter((s) => s.region === siteRegion),
    [siteRegion],
  )

  const effectiveDose = customDose.trim() ? Number(customDose) : doseMg
  const valid = Number.isFinite(effectiveDose) && effectiveDose > 0
  const previewDoseMg = valid ? effectiveDose : null
  const effectiveDoseLabel = customDose.trim() ? customDose : String(doseMg)

  function toggleInjectionSideEffect(id: string) {
    setInjectionSideEffects((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function selectDosePreset(mg: number) {
    setDoseMg(mg)
    setCustomDose("")
  }

  function selectSiteRegion(region: string) {
    setSiteRegion(region)
    const first = INJECTION_SITES.find((s) => s.region === region)
    if (first) setInjectionSite(first.id)
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
          sideEffects: injectionSideEffects,
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
      description={`Retatrutide · typically every 5–7 days · ${formatDisplayDate(parseLocalDate(activeDate))}`}
      icon={Syringe}
      accentColor={PEPTIDE_COLOR}
      footer={
        <CategoryLogSubmitButton form="log-peptide-injection-form" disabled={submitting || !valid}>
          {submitting
            ? "Saving…"
            : valid
              ? `Log ${effectiveDose} mg injection`
              : "Log injection"}
        </CategoryLogSubmitButton>
      }
    >
      <form id="log-peptide-injection-form" onSubmit={handleSubmit} className="space-y-5">
        <div className="flex justify-center py-1">
          <PeptideVialGraphic color={PEPTIDE_COLOR} doseMg={previewDoseMg} size="lg" />
        </div>

        {lastSiteUsed && (
          <p className="type-hud-caption -mt-1 normal-case">
            Last site:{" "}
            <span className="text-foreground/90">{injectionSiteLabel(lastSiteUsed)}</span>
            {" — rotate for next shot"}
          </p>
        )}

        <div className="space-y-3">
          <SectionRail label="Dose & time" />
          <div className="glass-subtle space-y-3 rounded-xl p-3.5">
            <div className="space-y-1.5">
              <Label className="type-hud-label">Compound</Label>
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

            <div className="space-y-1.5">
              <Label className="type-hud-label">Dose · {effectiveDoseLabel} mg</Label>
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
              <Input
                type="number"
                step="0.1"
                min="0.1"
                placeholder="Custom dose (mg)..."
                value={customDose}
                onChange={(e) => setCustomDose(e.target.value)}
                className="bg-background/40 border-glass-border"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="log-peptide-injection-time"
                className="type-hud-label flex items-center gap-1.5"
              >
                <span className="status-dot" style={{ width: 4, height: 4 }} />
                Injection time
              </Label>
              <Input
                id="log-peptide-injection-time"
                type="time"
                value={injectionTime}
                onChange={(e) => setInjectionTime(e.target.value)}
                className="tabular-nums text-lg tracking-widest bg-background/40 border-primary/15 focus-visible:border-primary/40 focus-visible:ring-primary/15"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <SectionRail label="Injection site" />
          <div className="glass-subtle space-y-3 rounded-xl p-3.5">
            <div className="flex flex-wrap gap-2">
              {INJECTION_SITE_REGIONS.map((region) => (
                <GlassChip
                  key={region.id}
                  selected={siteRegion === region.id}
                  onClick={() => selectSiteRegion(region.id)}
                >
                  {region.label}
                </GlassChip>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {sitesInRegion.map((site) => (
                <GlassChip
                  key={site.id}
                  selected={injectionSite === site.id}
                  onClick={() => setInjectionSite(site.id)}
                >
                  {site.shortLabel}
                </GlassChip>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <SectionRail label="Shot day" />
          <div className="glass-subtle space-y-3 rounded-xl p-3.5">
            <div className="space-y-1.5">
              <Label className="type-hud-label">Side effects</Label>
              <div className="flex flex-wrap gap-2">
                {SIDE_EFFECTS.map((fx) => (
                  <GlassChip
                    key={fx.id}
                    selected={injectionSideEffects.includes(fx.id)}
                    onClick={() => toggleInjectionSideEffect(fx.id)}
                  >
                    {fx.label}
                  </GlassChip>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="log-peptide-injection-notes" className="type-hud-label">
                Injection notes
              </Label>
              <Input
                id="log-peptide-injection-notes"
                placeholder="Optional — titration, vial, etc."
                value={injectionNotes}
                onChange={(e) => setInjectionNotes(e.target.value)}
                className="bg-background/40 border-glass-border"
              />
            </div>
          </div>
        </div>
      </form>
    </CategoryLogDialog>
  )
}
