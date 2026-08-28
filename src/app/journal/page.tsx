"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import {
  format,
  parse,
} from "date-fns"
import {
  NotebookPen,
  Plus,
  Pencil,
  Trash2,
  ImagePlus,
  X,
  ChevronDown,
  ChevronUp,
  Footprints,
  Flame,
  Dumbbell,
  Moon,
  Scale,
  Timer,
  MapPin,
  ThumbsDown,
  ThumbsUp,
  Minus,
  CircleMinus,
  Sparkles,
  Activity,
  Camera,
  Droplets,
  Gauge,
  Users,
  UserRound,
  ChevronLeft,
} from "lucide-react"
import { cn, formatDate, glassPanelClass } from "@/lib/utils"
import { kmToMiles, DEFAULT_WEIGHT_UNIT } from "@/lib/units"
import { apiFetch } from "@/lib/api-fetch"
import { useUser } from "@/context/UserContext"
import { useActiveDate } from "@/context/DateContext"
import { UserProfileAvatar } from "@/components/ProfileSwitcher"
import { DatePicker } from "@/components/DatePicker"
import { ProfileHeaderTrigger } from "@/context/ProfileDialogContext"
import { Button } from "@/components/ui/button"
import {
  JOURNAL_CONTENT_MAX,
  JOURNAL_MAX_IMAGES,
  type AttachedStats,
} from "@/lib/journal"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

// ─── Types ────────────────────────────────────────────────────────────────────

interface EntryUser {
  id: string
  name: string
  avatarColor: string
  avatarUrl?: string | null
}

interface JournalEntry {
  id: string
  date: string
  content: string
  mood: number | null
  images: string[]
  attachedStats: AttachedStats
  userId: string | null
  user: EntryUser | null
  createdAt: string
  updatedAt: string
}

interface RawJournalEntry {
  id: string
  date: string
  content: string
  mood: number | null
  images: string
  attachedStats: string
  userId: string | null
  user: EntryUser | null
  createdAt: string
  updatedAt: string
}

// Available stats fetched from existing APIs
type AvailableStats = AttachedStats

// ─── Constants ────────────────────────────────────────────────────────────────

const MOODS: {
  value: number
  icon: "bad" | "worse" | "neutral" | "good" | "great"
  label: string
}[] = [
  { value: 1, icon: "worse", label: "Worse" },
  { value: 2, icon: "bad", label: "Bad" },
  { value: 3, icon: "neutral", label: "Neutral" },
  { value: 4, icon: "good", label: "Good" },
  { value: 5, icon: "great", label: "Great" },
]

const MOOD_COLORS: Record<number, string> = {
  1: "text-red-400",
  2: "text-orange-400",
  3: "text-yellow-400",
  4: "text-lime-400",
  5: "text-green-400",
}

function MoodIcon({
  icon,
  className,
}: {
  icon: "bad" | "worse" | "neutral" | "good" | "great"
  className?: string
}) {
  if (icon === "worse") return <CircleMinus className={className} />
  if (icon === "bad") return <ThumbsDown className={className} />
  if (icon === "good") return <ThumbsUp className={className} />
  if (icon === "great") return <Sparkles className={className} />
  return <Minus className={className} />
}

const MAX_IMAGES = JOURNAL_MAX_IMAGES

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseEntry(raw: RawJournalEntry): JournalEntry {
  return {
    ...raw,
    images: (() => {
      try {
        return JSON.parse(raw.images || "[]")
      } catch {
        return []
      }
    })(),
    attachedStats: (() => {
      try {
        return JSON.parse(raw.attachedStats || "{}")
      } catch {
        return {}
      }
    })(),
    userId: raw.userId,
    user: raw.user,
  }
}

function formatDurationMins(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatRunDuration(secs: number): string {
  return formatDurationMins(Math.round(secs / 60))
}

function formatRunDistanceMi(distanceKm: number): string {
  return `${kmToMiles(distanceKm).toFixed(1)} mi`
}

// ─── Stat Chips ───────────────────────────────────────────────────────────────

function StatChips({ stats }: { stats: AttachedStats }) {
  const chips: { icon: React.ReactNode; label: string; key: string }[] = []

  if (stats.run) {
    chips.push({
      key: "run",
      icon: <MapPin className="size-3" />,
      label: `${formatRunDistanceMi(stats.run.distance)} · ${formatRunDuration(stats.run.duration)}`,
    })
  }
  if (stats.calories) {
    chips.push({
      key: "calories",
      icon: <Flame className="size-3" />,
      label: `${stats.calories.total.toLocaleString()} kcal`,
    })
  }
  if (stats.steps) {
    chips.push({
      key: "steps",
      icon: <Footprints className="size-3" />,
      label: `${stats.steps.count.toLocaleString()} steps`,
    })
  }
  if (stats.weight) {
    chips.push({
      key: "weight",
      icon: <Scale className="size-3" />,
      label: `${stats.weight.value} ${stats.weight.unit}`,
    })
  }
  if (stats.sleep) {
    chips.push({
      key: "sleep",
      icon: <Moon className="size-3" />,
      label: formatDurationMins(stats.sleep.durationMins),
    })
  }
  if (stats.water) {
    chips.push({
      key: "water",
      icon: <Droplets className="size-3" />,
      label: `${stats.water.amountOz} oz water`,
    })
  }
  if (stats.workouts) {
    chips.push({
      key: "workouts",
      icon: <Dumbbell className="size-3" />,
      label: `${stats.workouts.count} ${stats.workouts.count === 1 ? "workout" : "workouts"}`,
    })
  }
  if (stats.recovery) {
    chips.push({
      key: "recovery",
      icon: <Activity className="size-3" />,
      label: `${stats.recovery.score}/10 recovery`,
    })
  }
  if (stats.readiness) {
    chips.push({
      key: "readiness",
      icon: <Gauge className="size-3" />,
      label: `${stats.readiness.score} readiness`,
    })
  }

  if (chips.length === 0) return null

  return (
    <div className="mt-3 grid grid-cols-2 border-y border-white/[0.055] sm:grid-cols-3">
      {chips.map((c, index) => (
        <div
          key={c.key}
          className={cn(
            "flex min-w-0 items-center gap-2 py-2.5 text-muted-foreground/65",
            index % 2 === 0 ? "pr-2" : "border-l border-white/[0.05] pl-3 sm:border-l",
            index % 3 === 0 && "sm:border-l-0 sm:pl-0",
          )}
        >
          <span className="shrink-0 text-primary/75">{c.icon}</span>
          <span className="truncate text-[10px] font-medium tabular-nums tracking-wide">{c.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Entry Card ───────────────────────────────────────────────────────────────

function EntryCard({
  entry,
  onEdit,
  onDelete,
  currentUserId,
}: {
  entry: JournalEntry
  onEdit: (e: JournalEntry) => void
  onDelete: (id: string) => void
  currentUserId: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [lightboxImg, setLightboxImg] = useState<string | null>(null)
  const isLong = entry.content.length > 200
  const isOwner = currentUserId != null && entry.userId === currentUserId

  const mood = MOODS.find((m) => m.value === entry.mood)
  const dateLabel = format(new Date(entry.date), "MMM d, yyyy")
  const timeLabel = format(new Date(entry.createdAt), "h:mm a")
  const author = entry.user

  return (
    <>
      <article className="relative border-b border-white/[0.065] py-5 last:border-b-0 sm:py-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {author && (
              <UserProfileAvatar user={author} size="sm" noPhotoStyle="color" />
            )}
            <div className="min-w-0">
              {author && (
                <p className="truncate text-[12px] font-semibold tracking-wide text-foreground/90">{author.name}</p>
              )}
              <p className="mt-0.5 type-hud-caption normal-case tracking-normal text-muted-foreground/50">
                {dateLabel} &middot; {timeLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {mood && (
              <span
                className={cn("mr-1 inline-flex items-center gap-1.5 type-hud-micro", MOOD_COLORS[mood.value])}
                title={mood.label}
              >
                <MoodIcon icon={mood.icon} className="size-3.5" />
                <span className="hidden sm:inline">{mood.label}</span>
              </span>
            )}
            {isOwner && (
              <>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onEdit(entry)}
                  aria-label="Edit entry"
                  className="text-muted-foreground/45 hover:text-foreground"
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onDelete(entry.id)}
                  aria-label="Delete entry"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </>
            )}
          </div>
        </div>

        {entry.images.length > 0 && (
          <div
            className={cn(
              "journal-photo-reveal mt-3 grid overflow-hidden rounded-[1.15rem] bg-black/20",
              entry.images.length > 1 && "gap-px",
              entry.images.length === 1 ? "grid-cols-1" : "grid-cols-2",
            )}
          >
            {entry.images.map((url, i) => (
              <button
                key={i}
                onClick={() => setLightboxImg(url)}
                className={cn(
                  "group relative w-full overflow-hidden bg-white/[0.025]",
                  entry.images.length === 1 ? "aspect-[16/11]" : "aspect-square",
                  entry.images.length === 3 && i === 0 && "row-span-2 aspect-auto min-h-full",
                )}
                aria-label={`View image ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`${author?.name ?? "Profile"} progress photo ${i + 1}`}
                  className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,0.7,0.18,1)] group-hover:scale-[1.025]"
                />
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-white/[0.025]" aria-hidden />
              </button>
            ))}
          </div>
        )}

        <div className={entry.images.length > 0 ? "pt-3.5" : "pt-3"}>
          {entry.content && (
            <div>
              <p
                className={cn(
                  "whitespace-pre-wrap text-[13px] leading-[1.65] text-foreground/82 sm:text-sm",
                  !expanded && isLong && "line-clamp-3"
                )}
              >
                {entry.content}
              </p>
              {isLong && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-1.5 flex items-center gap-1 type-hud-micro text-primary/75 transition-colors hover:text-primary"
                >
                  {expanded ? (
                    <>
                      <ChevronUp className="size-3" /> Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="size-3" /> Show more
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          <StatChips stats={entry.attachedStats} />
        </div>
      </article>

      {/* Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/88 backdrop-blur-md"
          onClick={() => setLightboxImg(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxImg}
            alt=""
            className="max-h-[90dvh] max-w-[95vw] rounded-[1.15rem] object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 rounded-full bg-black/50 p-2 text-white"
            onClick={() => setLightboxImg(null)}
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
      )}
    </>
  )
}

// ─── Stats Picker ─────────────────────────────────────────────────────────────

function StatsPicker({
  date,
  selected,
  onChange,
}: {
  date: string
  selected: AttachedStats
  onChange: (s: AttachedStats) => void
}) {
  const [available, setAvailable] = useState<AvailableStats>({})
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const fetched = useRef(false)

  useEffect(() => {
    fetched.current = false
    setAvailable({})
    setOpen(false)
  }, [date])

  const fetchStats = useCallback(async () => {
    if (fetched.current) return
    fetched.current = true
    setLoading(true)
    try {
      const [runRes, calRes, stepsRes, weightRes, sleepRes, waterRes, dashboardRes] = await Promise.allSettled([
        apiFetch(`/api/running?date=${date}`).then((r) => r.json()),
        apiFetch(`/api/calories?date=${date}`).then((r) => r.json()),
        apiFetch(`/api/steps?date=${date}`).then((r) => r.json()),
        apiFetch(`/api/weigh-in?d=${date}`).then((r) => r.json()),
        apiFetch(`/api/sleep?date=${date}`).then((r) => r.json()),
        apiFetch(`/api/water?date=${date}`).then((r) => r.json()),
        apiFetch(`/api/dashboard?d=${date}`).then((r) => r.json()),
      ])

      const s: AvailableStats = {}

      if (runRes.status === "fulfilled" && Array.isArray(runRes.value) && runRes.value.length > 0) {
        const run = runRes.value[0]
        s.run = { distance: run.distance, duration: run.duration, environment: run.environment }
      }

      if (calRes.status === "fulfilled" && Array.isArray(calRes.value) && calRes.value.length > 0) {
        const total = calRes.value.reduce((sum: number, e: { calories: number }) => sum + e.calories, 0)
        const protein = calRes.value.reduce((sum: number, e: { protein: number | null }) => sum + (e.protein ?? 0), 0)
        s.calories = { total, protein: Math.round(protein) }
      }

      if (stepsRes.status === "fulfilled" && Array.isArray(stepsRes.value) && stepsRes.value.length > 0) {
        const count = stepsRes.value.reduce((sum: number, e: { count: number }) => sum + e.count, 0)
        s.steps = { count }
      }

      if (
        weightRes.status === "fulfilled" &&
        weightRes.value?.todayEntry
      ) {
        s.weight = {
          value: weightRes.value.todayEntry.value,
          unit: weightRes.value.unit ?? DEFAULT_WEIGHT_UNIT,
        }
      }

      if (sleepRes.status === "fulfilled" && Array.isArray(sleepRes.value) && sleepRes.value.length > 0) {
        const sl = sleepRes.value[0]
        const bedtime = new Date(sl.bedtime)
        const wake = new Date(sl.wakeTime)
        const durationMins = Math.round((wake.getTime() - bedtime.getTime()) / 60000)
        s.sleep = { durationMins, quality: sl.quality }
      }

      if (waterRes.status === "fulfilled" && Number.isFinite(waterRes.value?.totalOz)) {
        s.water = {
          amountOz: waterRes.value.totalOz,
          ...(Number.isFinite(waterRes.value.goalOz) ? { goalOz: waterRes.value.goalOz } : {}),
        }
      }

      if (dashboardRes.status === "fulfilled") {
        const dashboard = dashboardRes.value
        if (Number.isFinite(dashboard?.workouts?.todayValue)) {
          s.workouts = { count: dashboard.workouts.todayValue }
        }
        if (Number.isFinite(dashboard?.recovery?.todayValue) && dashboard.recovery.todayValue > 0) {
          s.recovery = { score: dashboard.recovery.todayValue }
        }
        if (Number.isFinite(dashboard?.readiness?.todayValue)) {
          s.readiness = {
            score: dashboard.readiness.todayValue,
            ...(Number.isFinite(dashboard.readiness.hrvMs) ? { hrvMs: dashboard.readiness.hrvMs } : {}),
            ...(Number.isFinite(dashboard.readiness.restingHeartRate)
              ? { restingHeartRate: dashboard.readiness.restingHeartRate }
              : {}),
          }
        }
      }

      setAvailable(s)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [date])

  const toggle = (key: keyof AvailableStats) => {
    if (selected[key]) {
      const next = { ...selected }
      delete next[key]
      onChange(next)
    } else if (available[key]) {
      onChange({ ...selected, [key]: available[key] })
    }
  }

  const statDefs: {
    key: keyof AvailableStats
    icon: React.ReactNode
    label: string
    summary: (v: AvailableStats) => string
  }[] = [
    {
      key: "run",
      icon: <MapPin className="size-3.5" />,
      label: "Run",
      summary: (v) =>
        v.run ? `${formatRunDistanceMi(v.run.distance)} · ${formatRunDuration(v.run.duration)}` : "",
    },
    {
      key: "calories",
      icon: <Flame className="size-3.5" />,
      label: "Calories",
      summary: (v) =>
        v.calories
          ? `${v.calories.total.toLocaleString()} kcal · ${v.calories.protein}g protein`
          : "",
    },
    {
      key: "steps",
      icon: <Footprints className="size-3.5" />,
      label: "Steps",
      summary: (v) => (v.steps ? `${v.steps.count.toLocaleString()} steps` : ""),
    },
    {
      key: "weight",
      icon: <Scale className="size-3.5" />,
      label: "Weight",
      summary: (v) => (v.weight ? `${v.weight.value} ${v.weight.unit}` : ""),
    },
    {
      key: "sleep",
      icon: <Moon className="size-3.5" />,
      label: "Sleep",
      summary: (v) =>
        v.sleep
          ? `${formatDurationMins(v.sleep.durationMins)} · quality ${v.sleep.quality}/5`
          : "",
    },
    {
      key: "water",
      icon: <Droplets className="size-3.5" />,
      label: "Water",
      summary: (v) => (v.water ? `${v.water.amountOz} oz${v.water.goalOz ? ` / ${v.water.goalOz} oz` : ""}` : ""),
    },
    {
      key: "workouts",
      icon: <Dumbbell className="size-3.5" />,
      label: "Training",
      summary: (v) => (v.workouts ? `${v.workouts.count} session${v.workouts.count === 1 ? "" : "s"}` : ""),
    },
    {
      key: "recovery",
      icon: <Activity className="size-3.5" />,
      label: "Recovery",
      summary: (v) => (v.recovery ? `${v.recovery.score}/10` : ""),
    },
    {
      key: "readiness",
      icon: <Gauge className="size-3.5" />,
      label: "Readiness",
      summary: (v) => (v.readiness ? `${v.readiness.score}/100` : ""),
    },
  ]

  const hasAny = Object.keys(available).length > 0

  return (
    <div className="border-y border-white/[0.06]">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          if (!open) fetchStats()
        }}
        className="flex min-h-11 w-full items-center justify-between py-2.5 text-left text-foreground transition-colors hover:text-primary"
      >
        <span className="flex items-center gap-2">
          <Activity className="size-3.5 text-primary/75" />
          <span className="type-hud-label-soft text-foreground/75">Attach day signals</span>
          {Object.keys(selected).length > 0 && (
            <span className="text-[10px] font-semibold tabular-nums text-primary">
              {Object.keys(selected).length}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-white/[0.05] py-2">
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-2 animate-pulse">
              Loading stats…
            </p>
          ) : !hasAny ? (
            <p className="text-xs text-muted-foreground text-center py-2">
              No stats logged for {date} yet.
            </p>
          ) : (
            <div className="divide-y divide-white/[0.045]">
              {statDefs.map((def) => {
                if (!available[def.key]) return null
                const isOn = !!selected[def.key]
                return (
                  <button
                    key={def.key}
                    type="button"
                    onClick={() => toggle(def.key)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2.5 py-2 text-left text-xs transition-colors",
                      isOn
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className={isOn ? "text-primary" : "text-muted-foreground"}>
                      {def.icon}
                    </span>
                    <span className="font-medium min-w-14">{def.label}</span>
                    <span className={cn("flex-1", isOn ? "text-primary/80" : "text-muted-foreground")}>
                      {def.summary(available)}
                    </span>
                    <span className={cn("ml-auto size-1.5 shrink-0 rounded-full", isOn ? "bg-primary shadow-[0_0_7px_var(--primary)]" : "bg-white/10")} aria-hidden />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Compose Dialog ───────────────────────────────────────────────────────────

interface ComposeDialogProps {
  open: boolean
  onClose: () => void
  date: string // YYYY-MM-DD
  editEntry?: JournalEntry | null
  onSaved: () => void
}

function ComposeDialog({ open, onClose, date, editEntry, onSaved }: ComposeDialogProps) {
  const [content, setContent] = useState("")
  const [mood, setMood] = useState<number | null>(null)
  const [images, setImages] = useState<string[]>([])
  const [attachedStats, setAttachedStats] = useState<AttachedStats>({})
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadedDuringSession = useRef(new Set<string>())

  // Populate form when editing
  useEffect(() => {
    if (open) {
      if (editEntry) {
        setContent(editEntry.content)
        setMood(editEntry.mood)
        setImages(editEntry.images)
        setAttachedStats(editEntry.attachedStats)
      } else {
        setContent("")
        setMood(null)
        setImages([])
        setAttachedStats({})
      }
      uploadedDuringSession.current.clear()
      setError(null)
    }
  }, [open, editEntry])

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    if (images.length + files.length > MAX_IMAGES) {
      setError(`You can attach up to ${MAX_IMAGES} images.`)
      return
    }
    setUploading(true)
    setError(null)
    try {
      const uploaded: string[] = []
      for (const file of files) {
        const fd = new FormData()
        fd.append("file", file)
        const res = await apiFetch("/api/journal/upload", { method: "POST", body: fd })
        if (!res.ok) {
          const j = await res.json()
          throw new Error(j.error ?? "Upload failed")
        }
        const { url } = await res.json()
        uploaded.push(url)
        uploadedDuringSession.current.add(url)
      }
      setImages((prev) => [...prev, ...uploaded])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const removeImage = async (url: string) => {
    setImages((prev) => prev.filter((u) => u !== url))
    if (uploadedDuringSession.current.delete(url)) {
      apiFetch(`/api/journal/upload?url=${encodeURIComponent(url)}`, { method: "DELETE" }).catch(() => {})
    }
  }

  const handleClose = () => {
    for (const url of uploadedDuringSession.current) {
      apiFetch(`/api/journal/upload?url=${encodeURIComponent(url)}`, { method: "DELETE" }).catch(() => {})
    }
    uploadedDuringSession.current.clear()
    onClose()
  }

  const handleSave = async () => {
    if (!content.trim() && images.length === 0 && Object.keys(attachedStats).length === 0) {
      setError("Write something or attach an image before saving.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = { date, content, mood, images, attachedStats }
      const res = editEntry
        ? await apiFetch("/api/journal", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, id: editEntry.id }),
          })
        : await apiFetch("/api/journal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? "Failed to save")
      }
      uploadedDuringSession.current.clear()
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.")
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col">
      <div className="mb-[var(--hub-section-gap)] flex h-7 shrink-0 items-center justify-between">
        <button
          type="button"
          onClick={handleClose}
          className="group flex h-7 min-w-0 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/25"
        >
          <ChevronLeft className="size-3.5 shrink-0 text-muted-foreground/55 transition-colors group-hover:text-foreground/80" aria-hidden />
          <span className="status-dot shrink-0 opacity-70" aria-hidden />
          <span className="type-hud-title truncate text-foreground/85">Timeline</span>
        </button>
        <span className="type-hud-eyebrow truncate pl-3">
          {format(parse(date, "yyyy-MM-dd", new Date()), "EEE, MMM d").toUpperCase()}
        </span>
      </div>

      <div className="journal-compose-enter min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 scrollbar-none">
        <div className="border-b border-white/[0.06] pb-4">
          <p className="type-hud-subsection">{editEntry ? "Revise signal" : "New progress signal"}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground/60">
            Pair a clear visual with the smallest useful amount of context.
          </p>
        </div>

        <section className="border-b border-white/[0.06] py-4">
          <p className="type-hud-label-soft mb-2.5">How it felt</p>
          <div className="grid grid-cols-5">
            {MOODS.map((m) => {
              const active = mood === m.value
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMood(active ? null : m.value)}
                  className={cn(
                    "relative flex min-h-14 flex-col items-center justify-center gap-1 border-r border-white/[0.045] text-muted-foreground transition-colors last:border-r-0 hover:text-foreground",
                    active && "text-primary",
                  )}
                  title={m.label}
                >
                  <MoodIcon icon={m.icon} className={cn("size-4.5", active ? MOOD_COLORS[m.value] : "text-current")} />
                  <span className="type-hud-micro normal-case tracking-wide text-current">{m.label}</span>
                  <span className={cn("absolute inset-x-3 bottom-0 h-px", active ? "bg-primary shadow-[0_0_8px_var(--primary)]" : "bg-transparent")} aria-hidden />
                </button>
              )
            })}
          </div>
        </section>

        <section className="border-b border-white/[0.06] py-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="type-hud-label-soft">Field note</p>
            <span className="type-hud-caption tabular-nums">{content.length}/{JOURNAL_CONTENT_MAX}</span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What changed? Record the win, the lesson, or the next move…"
            rows={5}
            maxLength={JOURNAL_CONTENT_MAX}
            className="w-full resize-none border-0 bg-transparent py-1 text-[15px] leading-relaxed text-foreground/88 placeholder:text-muted-foreground/35 outline-none"
          />
        </section>

        <section className="border-b border-white/[0.06] py-4">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <p className="type-hud-label-soft">Progress photos</p>
            <span className="type-hud-caption tabular-nums">{images.length}/{MAX_IMAGES}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {images.map((url, i) => (
              <div key={i} className="journal-photo-reveal relative h-24 w-24 overflow-hidden rounded-[1rem]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(url)}
                  className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full border border-white/15 bg-black/65 text-white backdrop-blur-md transition-colors hover:bg-black/85"
                  aria-label="Remove image"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}

            {images.length < MAX_IMAGES && (
              <div className="grid h-24 grid-cols-2 overflow-hidden rounded-[1rem] border border-white/[0.08] bg-white/[0.02]">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={uploading}
                  className="flex w-20 flex-col items-center justify-center gap-1.5 text-muted-foreground/65 transition-colors hover:bg-primary/[0.05] hover:text-primary disabled:opacity-50"
                  aria-label="Take progress photo"
                >
                  <Camera className="size-4.5" />
                  <span className="type-hud-micro">Camera</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex w-20 flex-col items-center justify-center gap-1.5 border-l border-white/[0.06] text-muted-foreground/65 transition-colors hover:bg-primary/[0.05] hover:text-primary disabled:opacity-50"
                  aria-label="Upload progress photos"
                >
                  {uploading ? <Timer className="size-4.5 animate-spin" /> : <ImagePlus className="size-4.5" />}
                  <span className="type-hud-micro">Library</span>
                </button>
              </div>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={handleImagePick} />
          <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={handleImagePick} />
        </section>

        <section className="py-4">
          <StatsPicker date={date} selected={attachedStats} onChange={setAttachedStats} />
        </section>
      </div>

      <div className="relative z-20 shrink-0 border-t border-white/[0.07] pt-3">
        {error ? <p className="mb-2 text-[11px] text-destructive" role="alert">{error}</p> : null}
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="h-10 px-3 type-hud-micro text-muted-foreground/65 transition-colors hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || uploading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.075] type-hud-chip text-primary transition-colors hover:border-primary/40 hover:bg-primary/[0.12] disabled:opacity-50"
          >
            <Plus className="size-3.5" aria-hidden />
            {saving ? "Publishing…" : editEntry ? "Update signal" : "Publish signal"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function JournalPage() {
  const { user } = useUser()
  const { activeDate } = useActiveDate()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [scope, setScope] = useState<"everyone" | "mine">("everyone")
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [feedError, setFeedError] = useState("")
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeDate, setComposeDate] = useState<string>(activeDate)
  const [editEntry, setEditEntry] = useState<JournalEntry | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchEntries = useCallback(async (cursor?: string) => {
    if (!user?.id) {
      setEntries([])
      setNextCursor(null)
      setLoading(false)
      return
    }
    if (cursor) setLoadingMore(true)
    else setLoading(true)
    setFeedError("")
    try {
      const params = new URLSearchParams()
      if (scope === "mine") params.set("scope", "mine")
      if (cursor) params.set("cursor", cursor)
      const res = await apiFetch(`/api/journal${params.size ? `?${params}` : ""}`, { cache: "no-store" })
      const data = (await res.json()) as {
        items?: RawJournalEntry[]
        nextCursor?: string | null
        error?: string
      }
      if (!res.ok) throw new Error(data.error || "Could not load the timeline.")
      const parsed = Array.isArray(data.items) ? data.items.map(parseEntry) : []
      setEntries((previous) => (cursor ? [...previous, ...parsed] : parsed))
      setNextCursor(data.nextCursor ?? null)
    } catch (caught) {
      if (!cursor) setEntries([])
      setFeedError(caught instanceof Error ? caught.message : "Could not load the timeline.")
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [scope, user?.id])

  useEffect(() => {
    void fetchEntries()
  }, [fetchEntries])

  const openCompose = (date: string, entry?: JournalEntry) => {
    setComposeDate(date)
    setEditEntry(entry ?? null)
    setComposeOpen(true)
  }

  const handleEdit = (entry: JournalEntry) => {
    openCompose(formatDate(new Date(entry.date)), entry)
  }

  const handleDeleteConfirm = async (id: string) => {
    try {
      const response = await apiFetch(`/api/journal?id=${id}`, { method: "DELETE" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not delete the post.")
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } catch (caught) {
      setFeedError(caught instanceof Error ? caught.message : "Could not delete the post.")
    } finally {
      setDeleteConfirm(null)
    }
  }

  return (
    <>
      <div
        className={cn(
          glassPanelClass,
          "flex min-h-0 flex-1 flex-col !overflow-clip !rounded-[1.35rem] border border-white/[0.09] p-4 max-sm:!rounded-b-[2.65rem] max-lg:px-3 max-lg:pt-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] lg:p-5",
        )}
      >
        <div className="pointer-events-none absolute inset-0 rounded-[inherit]" aria-hidden style={{ background: "linear-gradient(180deg, oklch(0.20 0.01 250 / 10%) 0rem, oklch(0.14 0.008 250 / 14%) 20rem, oklch(0.08 0.005 250 / 22%) 38rem, oklch(0.08 0.005 250 / 22%) 100%)" }} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.10]" aria-hidden style={{ backgroundImage: "linear-gradient(to right, oklch(0.30 0.01 250 / 18%) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.30 0.01 250 / 12%) 1px, transparent 1px)", backgroundSize: "22px 22px", maskImage: "linear-gradient(180deg, black 0%, transparent 62%)" }} />
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/14 to-transparent" aria-hidden />
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-70" aria-hidden style={{ background: "radial-gradient(ellipse 75% 34% at 50% -5%, oklch(0.72 0.02 250 / 10%), transparent 68%), radial-gradient(ellipse 45% 30% at 100% 100%, oklch(0.45 0.04 220 / 7%), transparent 72%)", boxShadow: "inset 0 1px 0 oklch(1 0 0 / 7%), inset 0 -1px 0 oklch(0 0 0 / 45%)" }} />

        <div className="relative z-20 mb-[var(--hub-section-gap)] shrink-0 border-b border-white/[0.07] pb-2 sm:pb-2.5">
          <div className="flex min-w-0 items-center gap-2 px-0.5 sm:gap-3 sm:px-1">
            <h1 className="font-kelly-slab min-w-0 shrink-0 text-lg font-semibold leading-none tracking-[-0.03em] sm:text-xl">
              <span className="text-gradient-glass title-underline-accent block truncate">THEGRID</span>
            </h1>
            <div className="flex min-w-0 flex-1 justify-end overflow-hidden"><DatePicker compact /></div>
            {!composeOpen ? (
              <button
                type="button"
                onClick={() => openCompose(activeDate)}
                aria-label="Share a progress update"
                title="New progress signal"
                className="group relative flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/[0.055] text-primary transition-all hover:border-primary/35 hover:bg-primary/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 active:scale-95"
              >
                <Plus className="size-4" strokeWidth={1.9} aria-hidden />
                <span className="pointer-events-none absolute right-0.5 top-0.5 size-1.5 rounded-full bg-primary/80 shadow-[0_0_7px_var(--primary)]" aria-hidden />
              </button>
            ) : null}
            <ProfileHeaderTrigger className="!mt-0 min-h-9 min-w-9" />
          </div>
        </div>

        {composeOpen ? (
          <ComposeDialog
            open
            onClose={() => {
              setComposeOpen(false)
              setEditEntry(null)
            }}
            date={composeDate}
            editEntry={editEntry}
            onSaved={() => void fetchEntries()}
          />
        ) : (
          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            <div className="mb-[var(--hub-section-gap)] flex h-7 shrink-0 items-center justify-between gap-3">
              <Link href="/" className="group flex h-7 min-w-0 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/25">
                <ChevronLeft className="size-3.5 shrink-0 text-muted-foreground/55 transition-colors group-hover:text-foreground/80" aria-hidden />
                <span className="status-dot shrink-0 opacity-70" aria-hidden />
                <span className="type-hud-title truncate text-foreground/85">Overview</span>
              </Link>
              <div className="flex shrink-0 items-center" role="tablist" aria-label="Timeline filter">
                {([
                  { value: "everyone", label: "Everyone", Icon: Users },
                  { value: "mine", label: "Mine", Icon: UserRound },
                ] as const).map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={scope === value}
                    onClick={() => setScope(value)}
                    className={cn(
                      "relative flex h-7 items-center gap-1.5 px-2 type-hud-micro transition-colors sm:px-2.5",
                      scope === value ? "text-primary" : "text-muted-foreground/50 hover:text-foreground/80",
                    )}
                  >
                    <Icon className="size-3" aria-hidden />
                    <span className="hidden sm:inline">{label}</span>
                    <span className={cn("absolute inset-x-2 bottom-0 h-px", scope === value ? "bg-primary/80 shadow-[0_0_6px_var(--primary)]" : "bg-transparent")} aria-hidden />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 items-end justify-between gap-4 border-b border-white/[0.07] pb-3 pt-1">
              <div className="min-w-0">
                <p className="type-hud-subsection">Progress timeline</p>
                <p className="mt-1 type-hud-caption normal-case tracking-normal text-muted-foreground/55">
                  {loading ? "Scanning signals…" : `${entries.length} loaded · ${entries.filter((entry) => entry.images.length > 0).length} visual · ${new Set(entries.map((entry) => entry.userId).filter(Boolean)).size} people`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openCompose(activeDate)}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 type-hud-micro text-muted-foreground/80 transition-colors hover:border-primary/25 hover:bg-primary/[0.055] hover:text-primary"
              >
                <Plus className="size-3" aria-hidden />
                Signal
              </button>
            </div>

            {feedError ? <p className="shrink-0 border-b border-destructive/20 py-2.5 text-[11px] text-destructive" role="alert">{feedError}</p> : null}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 scrollbar-none">
              {loading ? (
                <div className="divide-y divide-white/[0.055]">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="space-y-3 py-5">
                      <div className="flex items-center gap-2.5"><div className="size-8 animate-pulse rounded-full bg-white/[0.055]" /><div className="h-2.5 w-24 animate-pulse rounded-full bg-white/[0.055]" /></div>
                      <div className="aspect-[16/8] animate-pulse rounded-[1.15rem] bg-white/[0.035]" />
                      <div className="h-2.5 w-3/4 animate-pulse rounded-full bg-white/[0.045]" />
                    </div>
                  ))}
                </div>
              ) : entries.length === 0 ? (
                <div className="flex min-h-full flex-col items-center justify-center px-6 py-12 text-center motion-safe:animate-fade-up motion-reduce:animate-none">
                  <div className="relative mb-5 flex size-20 items-center justify-center">
                    <div className="absolute inset-0 rounded-full border border-primary/15 bg-primary/[0.035] shadow-[0_0_38px_oklch(0.78_0.17_110/0.08)]" />
                    <NotebookPen className="relative size-7 text-primary/75" strokeWidth={1.4} aria-hidden />
                  </div>
                  <p className="type-hud-title">{scope === "mine" ? "No personal signals" : "Timeline clear"}</p>
                  <p className="mt-2 max-w-xs text-[12px] leading-relaxed text-muted-foreground/55">Add a photo, a field note, or a compact snapshot from the day.</p>
                  <button type="button" onClick={() => openCompose(activeDate)} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.055] px-4 type-hud-micro text-primary transition-colors hover:border-primary/35 hover:bg-primary/[0.1]"><Plus className="size-3.5" aria-hidden />Create first signal</button>
                </div>
              ) : (
                <div className="journal-feed-enter">
                  {entries.map((entry) => (
                    <EntryCard key={entry.id} entry={entry} onEdit={handleEdit} onDelete={(id) => setDeleteConfirm(id)} currentUserId={user?.id ?? null} />
                  ))}
                  {nextCursor ? (
                    <button type="button" disabled={loadingMore} onClick={() => void fetchEntries(nextCursor)} className="my-3 inline-flex h-10 w-full items-center justify-center type-hud-micro text-muted-foreground/60 transition-colors hover:text-primary disabled:opacity-50">
                      {loadingMore ? "Scanning…" : "Load earlier signals"}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!deleteConfirm} onOpenChange={(o: boolean) => !o && setDeleteConfirm(null)}>
        <DialogContent className="glass-frost mx-auto inset-0 m-auto h-fit max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete progress post?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This post and its attached photos will be permanently removed.
          </p>
          <DialogFooter className="flex-row">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setDeleteConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => deleteConfirm && handleDeleteConfirm(deleteConfirm)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
