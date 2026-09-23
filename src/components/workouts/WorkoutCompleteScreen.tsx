"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { format } from "date-fns"
import {
  ArrowRight,
  Camera,
  Check,
  ImagePlus,
  Loader2,
  PersonStanding,
  RotateCcw,
  Trophy,
} from "lucide-react"
import { apiFetch } from "@/lib/api-fetch"
import { downscaleImageFile } from "@/lib/image-downscale"
import { JOURNAL_CONTENT_MAX, type AttachedStats } from "@/lib/journal"
import { cn, glassCtaButtonClass, parseLocalDate } from "@/lib/utils"
import type { WorkoutRecap } from "@/lib/workouts/workout-recap"
import { ActiveWorkoutSheet } from "@/components/workouts/ActiveWorkoutSheet"
import { useFullscreenOverlay } from "@/context/FullscreenOverlayContext"

const RING_RADIUS = 52
const RING_LENGTH = 2 * Math.PI * RING_RADIUS
const PHOTO_PROMPT_DELAY_MS = 1400
const accentButton = cn(
  glassCtaButtonClass,
  "flex items-center justify-center rounded-2xl text-sm font-semibold active:scale-[0.98] touch-manipulation",
)

type UploadState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string }

function formatDuration(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h}h ${String(min % 60).padStart(2, "0")}m`
}

function formatVolume(lb: number): string {
  if (lb >= 1000) return `${(lb / 1000).toFixed(1)}k lb`
  return `${Math.round(lb)} lb`
}

function releaseUpload(url: string | null) {
  if (!url) return
  void apiFetch(`/api/journal/upload?url=${encodeURIComponent(url)}`, { method: "DELETE" }).catch(
    () => {},
  )
}

export function WorkoutCompleteScreen({
  sessionName,
  dateKey,
  recap,
  bodyWeightLb,
  onDone,
  onOpenJournal,
}: {
  sessionName: string
  dateKey: string
  recap: WorkoutRecap
  bodyWeightLb: number | null
  onDone: () => void
  onOpenJournal: () => void
}) {
  const { setFullscreen } = useFullscreenOverlay()
  const [photoOpen, setPhotoOpen] = useState(false)
  const [stage, setStage] = useState<"capture" | "preview" | "posted">("capture")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [upload, setUpload] = useState<UploadState>({ status: "idle" })
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const durationLabel = formatDuration(recap.durationMin)
  const volumeLabel = formatVolume(recap.volume)
  const setsLabel = `${recap.setsDone} ${recap.setsDone === 1 ? "set" : "sets"}`
  const [caption, setCaption] = useState(
    `${sessionName} · ${durationLabel} · ${setsLabel} · ${volumeLabel}`,
  )
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  /** Uploaded but not yet attached to a post — cleaned up if the lifter walks away. */
  const orphanUrlRef = useRef<string | null>(null)
  const uploadTokenRef = useRef(0)

  const dateLabel = format(parseLocalDate(dateKey), "EEEE, MMM d")

  useEffect(() => {
    setFullscreen(true)
    return () => setFullscreen(false)
  }, [setFullscreen])

  useEffect(() => {
    const timer = window.setTimeout(() => setPhotoOpen(true), PHOTO_PROMPT_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    return () => {
      releaseUpload(orphanUrlRef.current)
      orphanUrlRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!previewUrl) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  async function handlePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    releaseUpload(orphanUrlRef.current)
    orphanUrlRef.current = null
    const token = ++uploadTokenRef.current
    setPreviewUrl(URL.createObjectURL(file))
    setStage("preview")
    setPostError(null)
    setUpload({ status: "uploading" })
    try {
      const small = await downscaleImageFile(file)
      const body = new FormData()
      body.append("file", small)
      const res = await apiFetch("/api/journal/upload", { method: "POST", body })
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? "Photo upload failed.")
      if (token !== uploadTokenRef.current) {
        releaseUpload(data.url)
        return
      }
      orphanUrlRef.current = data.url
      setUpload({ status: "ready", url: data.url })
    } catch (error) {
      if (token !== uploadTokenRef.current) return
      setUpload({
        status: "error",
        message: error instanceof Error ? error.message : "Photo upload failed.",
      })
    }
  }

  function retake() {
    uploadTokenRef.current += 1
    releaseUpload(orphanUrlRef.current)
    orphanUrlRef.current = null
    setPreviewUrl(null)
    setUpload({ status: "idle" })
    setPostError(null)
    setStage("capture")
  }

  async function post() {
    if (upload.status !== "ready" || posting) return
    setPosting(true)
    setPostError(null)
    const attachedStats: AttachedStats = {
      workouts: { count: 1 },
      ...(bodyWeightLb != null && bodyWeightLb > 0
        ? { weight: { value: Math.round(bodyWeightLb * 10) / 10, unit: "lb" as const } }
        : {}),
    }
    try {
      const res = await apiFetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateKey,
          content: caption.trim(),
          mood: null,
          images: [upload.url],
          attachedStats,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Could not post to the journal.")
      orphanUrlRef.current = null
      setStage("posted")
      window.dispatchEvent(new CustomEvent("grid:log-saved"))
    } catch (error) {
      setPostError(error instanceof Error ? error.message : "Could not post to the journal.")
    } finally {
      setPosting(false)
    }
  }

  const posted = stage === "posted"

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="workout-complete-title"
      className="fixed inset-0 z-[120] flex h-[100dvh] flex-col overflow-hidden bg-[#05070a] sm:items-center sm:justify-center sm:bg-background/55 sm:p-4 sm:backdrop-blur-xl"
    >
      <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#070a0e] sm:h-[min(56rem,calc(100dvh-2rem))] sm:max-w-lg sm:flex-none sm:rounded-[1.75rem] sm:border sm:border-white/[0.1]">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_70%_80%_at_50%_0%,rgba(196,214,50,0.16),transparent_70%)]"
          aria-hidden
        />

        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-[max(2.5rem,calc(env(safe-area-inset-top)+1.5rem))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex flex-col items-center text-center">
            <div className="relative size-32">
              <span className="aw-burst absolute inset-3 rounded-full border-2 border-primary/60" aria-hidden />
              <svg viewBox="0 0 128 128" className="size-32 -rotate-90" aria-hidden>
                <circle cx="64" cy="64" r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
                <circle
                  cx="64"
                  cy="64"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  className="aw-ring-draw"
                  style={{ "--aw-ring-length": RING_LENGTH } as CSSProperties}
                />
              </svg>
              <svg viewBox="0 0 48 48" className="absolute inset-0 m-auto size-14 text-primary" aria-hidden>
                <path
                  d="M12 25 l8 8 l16 -18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="aw-check-draw"
                />
              </svg>
            </div>
            <p className="aw-rise type-hud-micro mt-5 text-primary/80" style={{ "--aw-delay": "260ms" } as CSSProperties}>
              Session saved
            </p>
            <h1
              id="workout-complete-title"
              className="aw-rise mt-1.5 font-heading text-[2rem] font-semibold leading-tight tracking-tight text-foreground"
              style={{ "--aw-delay": "320ms" } as CSSProperties}
            >
              Workout complete
            </h1>
            <p className="aw-rise mt-1 text-sm text-muted-foreground/70" style={{ "--aw-delay": "380ms" } as CSSProperties}>
              {sessionName} · {dateLabel}
            </p>
          </div>

          <dl
            className="aw-rise mt-8 grid grid-cols-3 border-y border-white/[0.07]"
            style={{ "--aw-delay": "460ms" } as CSSProperties}
          >
            {[
              { label: "Duration", value: durationLabel },
              { label: "Volume", value: volumeLabel },
              { label: "Sets", value: `${recap.setsDone}` },
            ].map((stat, index) => (
              <div
                key={stat.label}
                className={cn("px-2 py-4 text-center", index > 0 && "border-l border-white/[0.07]")}
              >
                <dd className="font-heading text-[1.35rem] font-semibold tabular-nums leading-none text-foreground">
                  {stat.value}
                </dd>
                <dt className="type-hud-micro mt-2 text-muted-foreground/55">{stat.label}</dt>
              </div>
            ))}
          </dl>

          {recap.prCount > 0 ? (
            <p
              className="aw-rise mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-primary"
              style={{ "--aw-delay": "540ms" } as CSSProperties}
            >
              <Trophy className="size-4" aria-hidden />
              {recap.prCount === 1 ? "New personal record" : `${recap.prCount} new personal records`}
            </p>
          ) : null}

          {recap.movements.length > 0 ? (
            <section className="mt-7" aria-labelledby="recap-movements">
              <h2
                id="recap-movements"
                className="aw-rise type-hud-subsection"
                style={{ "--aw-delay": "580ms" } as CSSProperties}
              >
                Movements
              </h2>
              <ul className="mt-2">
                {recap.movements.map((movement, index) => (
                  <li
                    key={`${movement.name}-${index}`}
                    className="aw-rise flex items-center gap-3 border-b border-white/[0.05] py-3 last:border-b-0"
                    style={{ "--aw-delay": `${620 + index * 55}ms` } as CSSProperties}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-foreground/92">{movement.name}</p>
                      <p className="mt-0.5 text-[12px] tabular-nums text-muted-foreground/60">
                        {movement.setsDone} {movement.setsDone === 1 ? "set" : "sets"}
                        {movement.bestSet
                          ? ` · best ${movement.bestSet.weight} × ${movement.bestSet.reps}`
                          : ""}
                      </p>
                    </div>
                    {movement.isPr ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                        <Trophy className="size-3" aria-hidden />
                        PR
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {posted && previewUrl ? (
            <div
              className="aw-rise mt-7 flex items-center gap-3 border-t border-white/[0.07] pt-5"
              style={{ "--aw-delay": "60ms" } as CSSProperties}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Progress photo posted</p>
                <p className="text-[12px] text-muted-foreground/60">Saved to your journal for {dateLabel}.</p>
              </div>
              <Check className="size-5 shrink-0 text-primary" aria-hidden />
            </div>
          ) : null}
        </div>

        <div className="relative shrink-0 border-t border-white/[0.06] bg-[#070a0e]/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
          <div className="flex gap-2.5">
            {!posted ? (
              <button
                type="button"
                onClick={() => setPhotoOpen(true)}
                className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/[0.1] bg-white/[0.04] text-sm font-semibold text-foreground transition-[background-color,transform] active:scale-[0.98] touch-manipulation"
              >
                <Camera className="size-4" aria-hidden />
                Progress photo
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenJournal}
                className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/[0.1] bg-white/[0.04] text-sm font-semibold text-foreground transition-[background-color,transform] active:scale-[0.98] touch-manipulation"
              >
                View journal
              </button>
            )}
            <button
              type="button"
              onClick={onDone}
              className={cn(accentButton, "h-14 flex-1 gap-2")}
            >
              Done
              <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        <ActiveWorkoutSheet
          open={photoOpen}
          onClose={() => setPhotoOpen(false)}
          title={posted ? "Posted to your journal" : "Capture your progress"}
          description={
            posted
              ? undefined
              : "Snap a quick progress photo while the pump is on. It posts straight to your journal."
          }
        >
          {posted ? (
            <div className="flex flex-col items-center pb-2 pt-2 text-center">
              <span className="aw-check-pop flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-inset ring-primary/40 shadow-[0_0_40px_-8px_rgba(196,214,50,0.5)]">
                <Check className="size-8" aria-hidden />
              </span>
              <p className="mt-4 text-sm text-muted-foreground/70">
                Your photo and today&apos;s session are on your timeline.
              </p>
              <div className="mt-6 flex w-full gap-2.5">
                <button
                  type="button"
                  onClick={onOpenJournal}
                  className="flex h-13 flex-1 items-center justify-center rounded-2xl border border-white/[0.1] bg-white/[0.04] text-sm font-semibold text-foreground touch-manipulation active:scale-[0.98]"
                >
                  View journal
                </button>
                <button
                  type="button"
                  onClick={onDone}
                  className={cn(accentButton, "h-13 flex-1")}
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div className="pb-2">
              <div className="relative mx-auto aspect-[4/5] w-full max-w-[20rem] overflow-hidden rounded-[1.6rem] bg-[radial-gradient(ellipse_at_50%_35%,#161c23,#07090c_75%)] ring-1 ring-inset ring-white/[0.07]">
                {stage === "preview" && previewUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={previewUrl}
                      src={previewUrl}
                      alt="Your progress photo"
                      className="aw-photo-reveal absolute inset-0 size-full object-cover"
                    />
                    <span key={`${previewUrl}-flash`} className="aw-shutter absolute inset-0 bg-white" aria-hidden />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-4 pt-14">
                      <p className="type-hud-micro text-primary/90">{dateLabel}</p>
                      <p className="mt-1 truncate font-heading text-lg font-semibold text-white">{sessionName}</p>
                      <p className="mt-0.5 text-[12px] tabular-nums text-white/70">
                        {durationLabel} · {setsLabel} · {volumeLabel}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "absolute right-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-md",
                        upload.status === "ready"
                          ? "bg-primary/85 text-primary-foreground"
                          : upload.status === "error"
                            ? "bg-destructive/85 text-white"
                            : "bg-black/55 text-white/85",
                      )}
                    >
                      {upload.status === "uploading" ? (
                        <>
                          <Loader2 className="size-3 animate-spin" aria-hidden />
                          Uploading
                        </>
                      ) : upload.status === "ready" ? (
                        <>
                          <Check className="size-3" aria-hidden />
                          Ready
                        </>
                      ) : upload.status === "error" ? (
                        "Upload failed"
                      ) : null}
                    </span>
                  </>
                ) : (
                  <>
                    <div
                      className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:33.333%_33.333%]"
                      aria-hidden
                    />
                    <PersonStanding
                      className="absolute left-1/2 top-[44%] size-40 -translate-x-1/2 -translate-y-1/2 text-white/[0.07]"
                      strokeWidth={1}
                      aria-hidden
                    />
                    <span
                      className="aw-scan bg-gradient-to-r from-transparent via-primary/70 to-transparent shadow-[0_0_14px_rgba(196,214,50,0.6)]"
                      aria-hidden
                    />
                    <p className="absolute inset-x-0 bottom-5 text-center text-[11px] font-medium tracking-wide text-white/45">
                      Same spot · same light · same pose
                    </p>
                  </>
                )}
                {(["left-3 top-3 border-l-2 border-t-2 rounded-tl-xl", "right-3 top-3 border-r-2 border-t-2 rounded-tr-xl", "left-3 bottom-3 border-l-2 border-b-2 rounded-bl-xl", "right-3 bottom-3 border-r-2 border-b-2 rounded-br-xl"] as const).map((corner) => (
                  <span
                    key={corner}
                    className={cn(
                      "pointer-events-none absolute size-7 border-primary/80",
                      corner,
                      stage === "preview" && corner.includes("right-3 top-3") && "opacity-0",
                    )}
                    aria-hidden
                  />
                ))}
              </div>

              {stage === "preview" ? (
                <div className="mt-5 space-y-3">
                  <label className="block">
                    <span className="type-hud-micro text-muted-foreground/55">Caption</span>
                    <textarea
                      value={caption}
                      onChange={(event) => setCaption(event.target.value)}
                      maxLength={JOURNAL_CONTENT_MAX}
                      rows={2}
                      className="mt-1.5 w-full resize-none border-b border-white/[0.1] bg-transparent pb-2 text-[15px] leading-snug text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/60"
                      placeholder="How did it feel?"
                    />
                  </label>
                  {upload.status === "error" ? (
                    <p className="text-[12px] text-destructive" role="alert">
                      {upload.message}
                    </p>
                  ) : null}
                  {postError ? (
                    <p className="text-[12px] text-destructive" role="alert">
                      {postError}
                    </p>
                  ) : null}
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={retake}
                      className="flex h-13 items-center justify-center gap-2 rounded-2xl border border-white/[0.1] bg-white/[0.04] px-5 text-sm font-semibold text-foreground touch-manipulation active:scale-[0.98]"
                    >
                      <RotateCcw className="size-4" aria-hidden />
                      Retake
                    </button>
                    <button
                      type="button"
                      onClick={() => void post()}
                      disabled={upload.status !== "ready" || posting}
                      className={cn(accentButton, "h-13 flex-1 gap-2 disabled:opacity-45")}
                    >
                      {posting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                      {posting ? "Posting" : "Post to journal"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => cameraRef.current?.click()}
                      className={cn(accentButton, "h-14 flex-1 gap-2")}
                    >
                      <Camera className="size-4.5" aria-hidden />
                      Take photo
                    </button>
                    <button
                      type="button"
                      onClick={() => libraryRef.current?.click()}
                      className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-white/[0.1] bg-white/[0.04] px-5 text-sm font-semibold text-foreground touch-manipulation active:scale-[0.98]"
                    >
                      <ImagePlus className="size-4.5" aria-hidden />
                      Library
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPhotoOpen(false)}
                    className="mx-auto block py-2 text-[13px] font-medium text-muted-foreground/60 transition-colors hover:text-foreground touch-manipulation"
                  >
                    Not today
                  </button>
                </div>
              )}
              <input
                ref={cameraRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="user"
                className="hidden"
                onChange={(event) => void handlePick(event)}
              />
              <input
                ref={libraryRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => void handlePick(event)}
              />
            </div>
          )}
        </ActiveWorkoutSheet>
      </div>
    </div>
  )
}
