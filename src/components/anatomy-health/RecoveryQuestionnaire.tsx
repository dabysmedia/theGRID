"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { CONDITIONS, type ConditionDef, getConditionById } from "@/lib/recovery-catalog"
import type { BodyRegionId } from "@/lib/anatomy-health/model"
import { DEFAULT_REGION_LABELS } from "@/lib/anatomy-health/region-labels"
import { DomsFullscreenPicker } from "./DomsFullscreenPicker"
import { InjuryFullscreenPicker, type InjurySiteLogDraft } from "./InjuryFullscreenPicker"
import { parseDomsSegments } from "@/lib/anatomy-health/derive-from-recovery"

const BODY_REGION_OPTIONS: { id: BodyRegionId; label: string }[] = (
  Object.entries(DEFAULT_REGION_LABELS) as [BodyRegionId, string][]
).map(([id, label]) => ({ id, label }))

export interface InjuryFollowUpAction {
  injuryId: string
  outcome: "recovered" | "mild" | "moderate" | "severe"
}

export interface NewHealthEventPayload {
  conditionKey: string
  customLabel?: string
  kind?: "injury" | "illness"
  severity: "mild" | "moderate" | "severe"
  bodyRegion: string | null
  seedSuggested: boolean
}

export interface NewInjurySitePayload {
  segmentKey: string
  conditionKey: string
  customLabel?: string
  severity: "mild" | "moderate" | "severe"
  seedSuggested: boolean
}

export interface RecoveryQuestionnaireValues {
  injuryFollowUps: InjuryFollowUpAction[]
  /** One API injury per segment, from the fullscreen body map (DOMS-style). */
  newInjurySites: NewInjurySitePayload[]
  newIllness: NewHealthEventPayload | null
  domsSegments: { key: string; score: number }[]
  /** Rolled up from DOMS segment map (higher = more sore). */
  soreness: number
  pain: number
  energy: number
  mood: number
  stress: number
  mobility: number
  sleepFeel: number
  sleepFromLog: boolean
  notes: string
}

function injuryRowTitle(row: { conditionKey: string; customLabel: string | null }): string {
  if (row.conditionKey === "custom") return row.customLabel || "Custom"
  return getConditionById(row.conditionKey)?.name ?? row.customLabel ?? row.conditionKey
}

function illnessFormDefaults(): {
  enabled: boolean
  search: string
  picked: ConditionDef | null
  customLabel: string
  bodyRegion: BodyRegionId | ""
  severity: "mild" | "moderate" | "severe"
  seedSuggested: boolean
} {
  return {
    enabled: false,
    search: "",
    picked: null,
    customLabel: "",
    bodyRegion: "",
    severity: "mild",
    seedSuggested: true,
  }
}

export interface ActiveInjuryRow {
  id: string
  conditionKey: string
  customLabel: string | null
  kind: string
  severity: string
  status: string
}

export interface RecoveryQuestionnaireProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dateLabel: string
  activeInjuries: ActiveInjuryRow[]
  initialDaily?: Partial<
    Pick<
      RecoveryQuestionnaireValues,
      "pain" | "energy" | "mood" | "stress" | "mobility" | "sleepFeel" | "notes"
    >
  > & { domsJson?: string | null }
  onSubmit: (values: RecoveryQuestionnaireValues) => void | Promise<void>
}

export function RecoveryQuestionnaire({
  open,
  onOpenChange,
  dateLabel,
  activeInjuries,
  initialDaily,
  onSubmit,
}: RecoveryQuestionnaireProps) {
  const [step, setStep] = useState(0)
  const [notes, setNotes] = useState("")
  const [followUps, setFollowUps] = useState<Record<string, InjuryFollowUpAction["outcome"] | null>>({})
  const [injurySitesBySegment, setInjurySitesBySegment] = useState<Record<string, InjurySiteLogDraft>>({})
  const [injurySeedTreatments, setInjurySeedTreatments] = useState(true)
  const [illnessForm, setIllnessForm] = useState(illnessFormDefaults)
  const [domsRecord, setDomsRecord] = useState<Record<string, number>>({})
  const [domsPickerOpen, setDomsPickerOpen] = useState(false)
  const [injuryPickerOpen, setInjuryPickerOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const initialRef = useRef(initialDaily)
  initialRef.current = initialDaily

  const needsFollowUp = useMemo(
    () => activeInjuries.filter((i) => i.status !== "recovered"),
    [activeInjuries]
  )

  const stepIds = useMemo(() => {
    const ids: string[] = ["intro"]
    if (needsFollowUp.length) ids.push("followup")
    ids.push("new_injury", "illness", "doms", "notes", "commit")
    return ids
  }, [needsFollowUp.length])

  const currentStepId = stepIds[step] ?? "commit"
  const totalSteps = stepIds.length
  const progress = ((step + 1) / totalSteps) * 100

  useEffect(() => {
    if (!open) return
    setSubmitError(null)
    setStep(0)
    const init = initialRef.current
    setNotes(init?.notes ?? "")
    setFollowUps({})
    setInjurySitesBySegment({})
    setInjurySeedTreatments(true)
    setIllnessForm(illnessFormDefaults())
    const doms = parseDomsSegments(init?.domsJson ?? null)
    setDomsRecord(Object.fromEntries(doms.map((d) => [d.key, d.score])))
  }, [open])

  const illnessConditions = useMemo(
    () => CONDITIONS.filter((c) => c.kind === "illness"),
    []
  )

  const filteredIllness = useMemo(() => {
    const q = illnessForm.search.trim().toLowerCase()
    if (!q) return illnessConditions
    return illnessConditions.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.region?.toLowerCase().includes(q) || c.id.includes(q)
    )
  }, [illnessForm.search, illnessConditions])

  function buildIllnessPayload(form: ReturnType<typeof illnessFormDefaults>): NewHealthEventPayload | null {
    if (!form.enabled) return null
    const picked = form.picked
    const conditionKey = picked?.id ?? "custom"
    if (conditionKey === "custom" && !form.customLabel.trim()) return null
    return {
      conditionKey,
      customLabel: conditionKey === "custom" ? form.customLabel.trim() || "Custom" : undefined,
      kind: conditionKey === "custom" ? "illness" : undefined,
      severity: form.severity,
      bodyRegion: form.bodyRegion || null,
      seedSuggested: form.seedSuggested,
    }
  }

  function sorenessFromDoms(): number {
    const vals = Object.values(domsRecord)
    if (vals.length === 0) return 3
    return Math.min(10, Math.max(1, Math.round(Math.max(...vals))))
  }

  async function handleCommit() {
    const followList: InjuryFollowUpAction[] = []
    for (const inj of needsFollowUp) {
      const o = followUps[inj.id]
      if (o) followList.push({ injuryId: inj.id, outcome: o })
    }

    const domsSegments = Object.entries(domsRecord).map(([key, score]) => ({ key, score }))

    const newInjurySites: NewInjurySitePayload[] = Object.entries(injurySitesBySegment).map(
      ([segmentKey, d]) => ({
        segmentKey,
        conditionKey: d.conditionKey,
        customLabel: d.customLabel,
        severity: d.severity,
        seedSuggested: injurySeedTreatments,
      })
    )

    const persisted = initialRef.current
    const payload: RecoveryQuestionnaireValues = {
      injuryFollowUps: followList,
      newInjurySites,
      newIllness: buildIllnessPayload(illnessForm),
      domsSegments,
      soreness: sorenessFromDoms(),
      pain: persisted?.pain ?? 5,
      energy: persisted?.energy ?? 5,
      mood: persisted?.mood ?? 5,
      stress: persisted?.stress ?? 5,
      mobility: persisted?.mobility ?? 5,
      sleepFeel: persisted?.sleepFeel ?? 5,
      sleepFromLog: false,
      notes,
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      await onSubmit(payload)
      onOpenChange(false)
      setStep(0)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save this evaluation."
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  function next() {
    setStep((s) => Math.min(s + 1, totalSteps - 1))
  }

  function back() {
    setStep((s) => Math.max(0, s - 1))
  }

  const illnessBlocked =
    illnessForm.enabled &&
    !illnessForm.picked &&
    !illnessForm.customLabel.trim()

  const canNext = () => {
    if (currentStepId === "illness" && illnessBlocked) return false
    return true
  }

  function renderStep() {
    switch (currentStepId) {
      case "intro":
        return (
          <div className="space-y-3 py-1">
            <p className="text-sm text-foreground leading-relaxed">
              This evaluation focuses on <span className="font-medium">injuries, illness, and muscle soreness (DOMS)</span>{" "}
              for the selected day.
            </p>
            <p className="text-[11px] text-muted-foreground">Not medical advice — self-tracking only.</p>
          </div>
        )
      case "followup":
        return (
          <div className="space-y-4 py-1 max-h-[min(52vh,420px)] overflow-y-auto pr-1">
            <p className="text-xs text-muted-foreground">
              For each open record, how does it feel <span className="text-foreground">today</span>?{" "}
              <span className="font-medium text-foreground">Cleared</span> marks it recovered.
            </p>
            {needsFollowUp.map((inj) => (
              <div key={inj.id} className="rounded-lg border border-border/40 bg-black/20 p-3 space-y-2">
                <p className="text-sm font-medium text-foreground">{injuryRowTitle(inj)}</p>
                <p className="text-[10px] font-sans uppercase tracking-wide text-muted-foreground">
                  {inj.kind} · was {inj.severity}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["recovered", "Cleared"],
                      ["mild", "Mild"],
                      ["moderate", "Moderate"],
                      ["severe", "Severe"],
                    ] as const
                  ).map(([outcome, label]) => (
                    <Button
                      key={outcome}
                      type="button"
                      size="sm"
                      variant={followUps[inj.id] === outcome ? "glass" : "outline"}
                      className={cn(
                        "type-hud-chip h-8 font-sans",
                        followUps[inj.id] !== outcome && "border-border/50 bg-background/30"
                      )}
                      onClick={() =>
                        setFollowUps((prev) => ({
                          ...prev,
                          [inj.id]: outcome,
                        }))
                      }
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      case "new_injury":
        return (
          <div className="space-y-3 py-1">
            <p className="text-xs text-muted-foreground leading-relaxed">
              New injuries? Open the full-screen body map. Tap each sore area — a panel asks for{" "}
              <span className="text-foreground font-medium">injury type</span> (matched to that spot) and{" "}
              <span className="text-foreground font-medium">severity</span>, same idea as DOMS.
            </p>
            <p className="text-[11px] text-foreground">
              {Object.keys(injurySitesBySegment).length === 0
                ? "No injury sites marked yet."
                : `${Object.keys(injurySitesBySegment).length} site(s) marked — reopen the map to edit.`}
            </p>
            <Button type="button" variant="glass" className="w-full press-scale" onClick={() => setInjuryPickerOpen(true)}>
              Open injury body map
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setInjurySitesBySegment({})}
            >
              Clear all injury sites
            </Button>
            <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
              <input
                type="checkbox"
                checked={injurySeedTreatments}
                onChange={(e) => setInjurySeedTreatments(e.target.checked)}
                className="rounded border-border/45"
              />
              Seed care checklist for new injuries logged today
            </label>
          </div>
        )
      case "illness":
        return (
          <NewEventStep
            title="Illness or feeling unwell?"
            variant="illness"
            form={illnessForm}
            setForm={setIllnessForm}
            filtered={filteredIllness}
          />
        )
      case "doms":
        return (
          <div className="space-y-3 py-1">
            <p className="text-xs text-muted-foreground">
              Delayed-onset muscle soreness (DOMS)? Open the full-screen body map to tag sore muscles and
              intensity.
            </p>
            <p className="text-[11px] text-foreground">
              {Object.keys(domsRecord).length === 0
                ? "No muscles marked yet."
                : `${Object.keys(domsRecord).length} area(s) marked · aggregate soreness will be ~${sorenessFromDoms()}/10`}
            </p>
            <Button type="button" variant="glass" className="w-full press-scale" onClick={() => setDomsPickerOpen(true)}>
              Open body map
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setDomsRecord({})}
            >
              Clear all muscle marks
            </Button>
          </div>
        )
      case "notes":
        return (
          <div className="space-y-2 py-1">
            <Label htmlFor="rq-notes" className="text-xs uppercase text-muted-foreground">
              Notes (optional)
            </Label>
            <Input
              id="rq-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context, training, anything else…"
              className="bg-background/40 border-border/50"
            />
          </div>
        )
      case "commit":
        return (
          <div className="space-y-2 py-1 text-sm text-muted-foreground">
            <p>Ready to save this check-in for {dateLabel}.</p>
            <ul className="text-[11px] space-y-1 list-disc pl-4">
              {needsFollowUp.length > 0 && (
                <li>{Object.keys(followUps).filter((id) => followUps[id]).length} follow-up update(s)</li>
              )}
              {Object.keys(injurySitesBySegment).length > 0 && (
                <li>
                  New injuries: {Object.keys(injurySitesBySegment).length} site(s) (saved as separate records)
                </li>
              )}
              {buildIllnessPayload(illnessForm) && <li>New illness logged</li>}
              <li>
                DOMS: {Object.keys(domsRecord).length} segment(s) · soreness metric {sorenessFromDoms()}/10
              </li>
            </ul>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <>
      <InjuryFullscreenPicker
        open={injuryPickerOpen}
        onOpenChange={setInjuryPickerOpen}
        initialBySegment={injurySitesBySegment}
        onConfirm={setInjurySitesBySegment}
      />
      <DomsFullscreenPicker
        open={domsPickerOpen}
        onOpenChange={setDomsPickerOpen}
        initialScores={domsRecord}
        onConfirm={setDomsRecord}
      />
      <Dialog
        open={open}
        onOpenChange={(o) => {
          onOpenChange(o)
          if (!o) setStep(0)
        }}
      >
        <DialogContent
          className={cn("glass hud-corners max-h-[90vh] overflow-hidden flex flex-col border-border/40 sm:max-w-lg")}
          showCloseButton
        >
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-sm uppercase tracking-[0.18em] text-foreground flex items-center gap-2">
              <span className="status-dot" style={{ width: 5, height: 5 }} />
              Recovery check-in
            </DialogTitle>
            <DialogDescription className="text-xs">Session · {dateLabel}</DialogDescription>
          </DialogHeader>

          <div className="h-1 w-full shrink-0 rounded-full bg-muted/50 overflow-hidden border border-border/30">
            <div
              className="h-full bg-primary/80 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider shrink-0">
            Step {step + 1} / {totalSteps}
          </p>

          <div className="min-h-0 flex-1 overflow-y-auto">{renderStep()}</div>

          {submitError ? (
            <p className="shrink-0 text-xs text-amber-200/95 leading-snug px-0.5" role="alert">
              {submitError}
            </p>
          ) : null}

          <div className="flex shrink-0 gap-2 pt-2 border-t border-border/30">
            <Button type="button" variant="outline" className="flex-1 border-border/50" disabled={step === 0} onClick={back}>
              Back
            </Button>
            {currentStepId === "commit" ? (
              <Button
                type="button"
                variant="glass"
                className="flex-1 press-scale"
                disabled={submitting}
                onClick={() => void handleCommit()}
              >
                {submitting ? "Submitting…" : "Submit evaluation"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="glass"
                className="flex-1 press-scale"
                disabled={!canNext()}
                onClick={next}
              >
                Next
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function NewEventStep({
  title,
  variant,
  form,
  setForm,
  filtered,
}: {
  title: string
  variant: "illness"
  form: ReturnType<typeof illnessFormDefaults>
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof illnessFormDefaults>>>
  filtered: ConditionDef[]
}) {
  return (
    <div className="space-y-3 py-1 max-h-[min(48vh,400px)] overflow-y-auto pr-1">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
          className="rounded border-border/45"
        />
        Yes — log a new illness / symptom cluster
      </label>
      {form.enabled && (
        <>
          <div className="space-y-1.5">
            <Label className="type-hud-label">Search</Label>
            <Input
              value={form.search}
              onChange={(e) => setForm((f) => ({ ...f, search: e.target.value }))}
              className="bg-black/30 border-border/45"
              placeholder="Filter catalog…"
            />
          </div>
          <div className="max-h-28 overflow-y-auto rounded-md border border-border/45 p-1 space-y-0.5">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, picked: null, search: "" }))}
              className={cn(
                "w-full text-left rounded px-2 py-1.5 text-xs",
                form.picked === null ? "bg-primary/15 text-primary" : "hover:bg-white/5"
              )}
            >
              Custom…
            </button>
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setForm((f) => ({ ...f, picked: c, search: c.name }))}
                className={cn(
                  "w-full text-left rounded px-2 py-1.5 text-xs",
                  form.picked?.id === c.id ? "bg-primary/15 text-primary" : "hover:bg-white/5"
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
          {form.picked === null && (
            <Input
              value={form.customLabel}
              onChange={(e) => setForm((f) => ({ ...f, customLabel: e.target.value }))}
              placeholder="Label"
              className="bg-black/30 border-border/45"
            />
          )}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Body sector (optional)</Label>
            <select
              className="w-full rounded-md border border-border/45 bg-black/30 text-sm py-2 px-2"
              value={form.bodyRegion}
              onChange={(e) =>
                setForm((f) => ({ ...f, bodyRegion: (e.target.value as BodyRegionId) || "" }))
              }
            >
              <option value="">Auto</option>
              {BODY_REGION_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Severity</Label>
            <div className="flex flex-wrap gap-1">
              {(["mild", "moderate", "severe"] as const).map((s) => (
                <Button
                  key={s}
                  type="button"
                  size="sm"
                  variant={form.severity === s ? "glass" : "outline"}
                  className={cn("text-[10px] uppercase", form.severity !== s && "bg-background/30")}
                  onClick={() => setForm((f) => ({ ...f, severity: s }))}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={form.seedSuggested}
              onChange={(e) => setForm((f) => ({ ...f, seedSuggested: e.target.checked }))}
              className="rounded border-border/45"
            />
            Seed care checklist
          </label>
          {form.enabled && !form.picked && !form.customLabel.trim() && (
            <p className="text-[10px] text-amber-200/90">Enter a custom label or pick from the catalog.</p>
          )}
        </>
      )}
    </div>
  )
}
