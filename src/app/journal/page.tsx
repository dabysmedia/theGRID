"use client"

import { useState, useEffect, useRef, useCallback } from "react"
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
} from "lucide-react"
import { cn, formatDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import { useUser } from "@/context/UserContext"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttachedStats {
  run?: { distance: number; duration: number; environment: string }
  calories?: { total: number; protein: number }
  steps?: { count: number }
  weight?: { value: number; unit: string }
  sleep?: { durationMins: number; quality: number }
}

interface EntryUser {
  id: string
  name: string
  avatarColor: string
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
interface AvailableStats {
  run?: { distance: number; duration: number; environment: string }
  calories?: { total: number; protein: number }
  steps?: { count: number }
  weight?: { value: number; unit: string }
  sleep?: { durationMins: number; quality: number }
}

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

const MAX_IMAGES = 5

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

// ─── Stat Chips ───────────────────────────────────────────────────────────────

function StatChips({ stats }: { stats: AttachedStats }) {
  const chips: { icon: React.ReactNode; label: string; key: string }[] = []

  if (stats.run) {
    chips.push({
      key: "run",
      icon: <MapPin className="size-3" />,
      label: `${stats.run.distance.toFixed(1)} km · ${formatRunDuration(stats.run.duration)}`,
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

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/8 px-2 py-0.5 text-[10px] font-medium text-primary tracking-wide"
        >
          {c.icon}
          {c.label}
        </span>
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
      <article className="glass-frost overflow-hidden rounded-2xl border border-border/30 shadow-sm transition-all">
        <div className="flex items-center justify-between gap-2 px-3.5 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {author && (
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: author.avatarColor }}
              >
                {author.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              {author && (
                <p className="truncate text-xs font-semibold text-foreground/90">{author.name}</p>
              )}
              <p className="text-[11px] text-muted-foreground">
                {dateLabel} &middot; {timeLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {mood && (
              <span
                className={cn(
                  "rounded-full border border-border/40 bg-muted/40 px-2 py-1 leading-none",
                  MOOD_COLORS[mood.value]
                )}
                title={mood.label}
              >
                <MoodIcon icon={mood.icon} className="size-4" />
              </span>
            )}
            {isOwner && (
              <>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onEdit(entry)}
                  aria-label="Edit entry"
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

        {entry.images.length > 0 ? (
          <div className="grid gap-0.5 bg-black/25">
            {entry.images.map((url, i) => (
              <button
                key={i}
                onClick={() => setLightboxImg(url)}
                className="group relative aspect-square w-full overflow-hidden bg-muted/30"
                aria-label={`View image ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
              </button>
            ))}
          </div>
        ) : (
          <div className="mx-3.5 mb-3 rounded-xl border border-dashed border-border/35 bg-muted/25 p-5 text-center text-xs text-muted-foreground">
            No image attached
          </div>
        )}

        <div className="px-3.5 pb-3 pt-3">
          {entry.content && (
            <div>
              <p
                className={cn(
                  "whitespace-pre-wrap text-sm leading-relaxed text-foreground/90",
                  !expanded && isLong && "line-clamp-3"
                )}
              >
                {entry.content}
              </p>
              {isLong && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary transition-colors hover:text-primary/80"
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
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxImg(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxImg}
            alt=""
            className="max-h-[90dvh] max-w-[95vw] rounded-xl object-contain shadow-2xl"
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

  const fetchStats = useCallback(async () => {
    if (fetched.current) return
    fetched.current = true
    setLoading(true)
    try {
      const [runRes, calRes, stepsRes, weightRes, sleepRes] = await Promise.allSettled([
        apiFetch(`/api/running?date=${date}`).then((r) => r.json()),
        apiFetch(`/api/calories?date=${date}`).then((r) => r.json()),
        apiFetch(`/api/steps?date=${date}`).then((r) => r.json()),
        apiFetch(`/api/weigh-in?d=${date}`).then((r) => r.json()),
        apiFetch(`/api/sleep?date=${date}`).then((r) => r.json()),
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
        s.weight = { value: weightRes.value.todayEntry.value, unit: weightRes.value.unit ?? "kg" }
      }

      if (sleepRes.status === "fulfilled" && Array.isArray(sleepRes.value) && sleepRes.value.length > 0) {
        const sl = sleepRes.value[0]
        const bedtime = new Date(sl.bedtime)
        const wake = new Date(sl.wakeTime)
        const durationMins = Math.round((wake.getTime() - bedtime.getTime()) / 60000)
        s.sleep = { durationMins, quality: sl.quality }
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
        v.run ? `${v.run.distance.toFixed(1)} km · ${formatRunDuration(v.run.duration)}` : "",
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
  ]

  const hasAny = Object.keys(available).length > 0

  return (
    <div className="rounded-xl border border-border/40 bg-muted/30">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          if (!open) fetchStats()
        }}
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-foreground"
      >
        <span className="flex items-center gap-2">
          <Dumbbell className="size-4 text-primary" />
          Attach today&apos;s stats
          {Object.keys(selected).length > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold w-4 h-4">
              {Object.keys(selected).length}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border/30 px-3 py-3">
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-2 animate-pulse">
              Loading today&apos;s stats…
            </p>
          ) : !hasAny ? (
            <p className="text-xs text-muted-foreground text-center py-2">
              No stats logged for {date} yet.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {statDefs.map((def) => {
                if (!available[def.key]) return null
                const isOn = !!selected[def.key]
                return (
                  <button
                    key={def.key}
                    type="button"
                    onClick={() => toggle(def.key)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-colors",
                      isOn
                        ? "bg-primary/12 border border-primary/30 text-primary"
                        : "border border-border/30 bg-background/40 text-muted-foreground hover:text-foreground hover:border-border/60"
                    )}
                  >
                    <span className={isOn ? "text-primary" : "text-muted-foreground"}>
                      {def.icon}
                    </span>
                    <span className="font-medium min-w-14">{def.label}</span>
                    <span className={cn("flex-1", isOn ? "text-primary/80" : "text-muted-foreground")}>
                      {def.summary(available)}
                    </span>
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded-full border text-[9px] font-semibold px-1.5 py-0.5 leading-none tracking-wider",
                        isOn
                          ? "border-primary/40 bg-primary/15 text-primary"
                          : "border-border/40 text-muted-foreground"
                      )}
                    >
                      {isOn ? "ON" : "OFF"}
                    </span>
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
    // Best-effort delete from disk
    apiFetch(`/api/journal/upload?url=${encodeURIComponent(url)}`, { method: "DELETE" }).catch(() => {})
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
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="inset-x-0 bottom-0 top-auto translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl max-w-none w-full max-h-[92dvh] flex flex-col p-0 gap-0"
      >
        {/* Handle bar */}
        <div className="flex shrink-0 items-center justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-border/60" />
        </div>

        {/* Header */}
        <DialogHeader className="shrink-0 px-4 pb-2 pt-1">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold">
              {editEntry ? "Edit entry" : "New entry"}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {format(parse(date, "yyyy-MM-dd", new Date()), "EEEE, MMM d")}
              </span>
            </DialogTitle>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-2 flex flex-col gap-4">
          {/* Mood selector */}
          <div>
            <p className="mb-2 text-[11px] font-medium text-muted-foreground tracking-widest uppercase">
              Mood
            </p>
            <div className="flex gap-1.5">
              {MOODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMood(mood === m.value ? null : m.value)}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-0.5 rounded-xl border py-2.5 text-xl transition-all",
                    mood === m.value
                      ? "border-primary/40 bg-primary/10 shadow-inner"
                      : "border-border/30 bg-muted/20 hover:border-border/60 hover:bg-muted/40"
                  )}
                  title={m.label}
                >
                  <MoodIcon
                    icon={m.icon}
                    className={cn(
                      "size-5",
                      mood === m.value ? MOOD_COLORS[m.value] : "text-muted-foreground"
                    )}
                  />
                  <span
                    className={cn(
                      "text-[9px] font-medium tracking-wide",
                      mood === m.value ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {m.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Text area */}
          <div>
            <p className="mb-2 text-[11px] font-medium text-muted-foreground tracking-widest uppercase">
              Entry
            </p>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your thoughts, reflections, wins, setbacks…"
              rows={6}
              className="w-full resize-none rounded-xl border border-border/40 bg-muted/20 px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all leading-relaxed"
            />
          </div>

          {/* Images */}
          <div>
            <p className="mb-2 text-[11px] font-medium text-muted-foreground tracking-widest uppercase">
              Photos {images.length > 0 && `(${images.length}/${MAX_IMAGES})`}
            </p>
            <div className="flex flex-wrap gap-2">
              {images.map((url, i) => (
                <div
                  key={i}
                  className="relative h-20 w-20 overflow-hidden rounded-xl border border-border/30"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(url)}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition-opacity hover:bg-black/80"
                    aria-label="Remove image"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}

              {images.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className={cn(
                    "flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border/50 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary",
                    uploading && "opacity-50"
                  )}
                  aria-label="Add photo"
                >
                  {uploading ? (
                    <Timer className="size-5 animate-spin" />
                  ) : (
                    <>
                      <ImagePlus className="size-5" />
                      <span className="text-[10px] font-medium">Add</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={handleImagePick}
            />
          </div>

          {/* Stats picker */}
          <StatsPicker date={date} selected={attachedStats} onChange={setAttachedStats} />
        </div>

        {/* Footer */}
        <DialogFooter className="shrink-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom,1rem))]">
          {error && (
            <p className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="glass"
              className="flex-1"
              onClick={handleSave}
              disabled={saving || uploading}
            >
              {saving ? "Saving…" : editEntry ? "Update" : "Save entry"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function JournalPage() {
  const { user } = useUser()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeDate, setComposeDate] = useState<string>(formatDate(new Date()))
  const [editEntry, setEditEntry] = useState<JournalEntry | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const todayStr = formatDate(new Date())

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch("/api/journal")
      const data: RawJournalEntry[] = await res.json()
      const parsed = Array.isArray(data) ? data.map(parseEntry) : []
      parsed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setEntries(parsed)
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEntries()
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
      await apiFetch(`/api/journal?id=${id}`, { method: "DELETE" })
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } catch {
      // silently fail
    } finally {
      setDeleteConfirm(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <PageHeader title="Journal" icon={NotebookPen} iconColor="oklch(0.70 0.14 250)" />

      {/* Entries feed */}
      {loading ? (
        <div className="flex flex-col gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass-frost overflow-hidden rounded-2xl border border-border/20">
              <div className="aspect-square animate-pulse bg-muted/40" />
              <div className="space-y-2 p-3">
                <div className="h-3 w-1/3 animate-pulse rounded bg-muted/40" />
                <div className="h-3 w-full animate-pulse rounded bg-muted/40" />
              </div>
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/40 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/30 bg-muted/30">
            <NotebookPen className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-foreground">No journal posts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tap the + button to write your first journal entry.
            </p>
          </div>
          <Button
            variant="glass"
            size="sm"
            onClick={() => openCompose(todayStr)}
          >
            <Plus className="size-4" />
            Write entry
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5 pb-4">
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onEdit={handleEdit}
              onDelete={(id) => setDeleteConfirm(id)}
              currentUserId={user?.id ?? null}
            />
          ))}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => openCompose(todayStr)}
        className={cn(
          "fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-[max(1rem,env(safe-area-inset-right,1rem))]",
          "flex h-14 w-14 items-center justify-center rounded-2xl shadow-xl shadow-black/30",
          "border border-primary/30 bg-gradient-to-b from-primary/20 via-primary/10 to-transparent backdrop-blur-md",
          "text-primary transition-all hover:from-primary/30 hover:border-primary/50 active:scale-95",
          "z-40"
        )}
        aria-label="New journal entry"
      >
        <Plus className="size-6" strokeWidth={2.5} />
      </button>

      {/* Compose / Edit dialog */}
      <ComposeDialog
        open={composeOpen}
        onClose={() => {
          setComposeOpen(false)
          setEditEntry(null)
        }}
        date={composeDate}
        editEntry={editEntry}
        onSaved={fetchEntries}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o: boolean) => !o && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm mx-auto inset-0 m-auto h-fit">
          <DialogHeader>
            <DialogTitle>Delete entry?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This entry and its attached images will be permanently removed.
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
    </div>
  )
}
