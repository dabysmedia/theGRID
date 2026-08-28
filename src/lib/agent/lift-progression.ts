import "server-only"

import { estimate1Rm, normalizeExerciseKey } from "@/lib/workouts/progressive-overload"
import { storedEntryDayKey } from "@/lib/agent/timezone"
import { parseJsonArray, truncate } from "@/lib/agent/verbose-format"

/**
 * Only these sessions represent training that actually happened. "superseded"
 * is an abandoned live workout kept as recoverable history, "planned" has not
 * been done yet, and "active" is still in progress — counting any of them would
 * double-log or invent lifts.
 */
export const COMPLETED_SESSION_STATUS = "completed"

export interface AgentSessionLike {
  name: string
  date: Date
  status: string
  exercises: string
  bodyWeightLb: number | null
}

interface RawSet {
  weight: number | null
  reps: number | null
  type?: string
  completed?: boolean
}

interface RawExercise {
  name: string
  notes?: string
  category?: string
  sets?: RawSet[]
  primaryMuscles?: Array<{ name: string }>
}

export interface LiftSetPoint {
  weightLb: number
  reps: number
  est1RmLb: number | null
}

export interface LiftSessionPoint {
  date: string
  sessionName: string
  workingSets: number
  topSet: LiftSetPoint | null
  volumeLb: number
}

export interface LiftProgress {
  exercise: string
  muscles: string
  sessionsInWindow: number
  lastTrained: string
  firstTrainedInWindow: string
  workingSetsInWindow: number
  volumeInWindowLb: number
  bestSetInWindow: (LiftSetPoint & { date: string }) | null
  bestSetAllTime: (LiftSetPoint & { date: string }) | null
  /** Top-set load change across the window, first → last session. */
  loadTrend: { deltaLb: number; pctChange: number; from: string; to: string } | null
  /** Newest first. */
  history: LiftSessionPoint[]
}

function isWorkingSet(s: RawSet): boolean {
  // Warmups are excluded from load and volume; dropset/failure sets still count
  // as work performed, matching how the app reports session volume.
  return s.type !== "warmup"
}

function setPoint(s: RawSet): LiftSetPoint | null {
  if (s.weight == null || s.weight <= 0 || s.reps == null || s.reps <= 0) return null
  return { weightLb: s.weight, reps: s.reps, est1RmLb: estimate1Rm(s.weight, s.reps) }
}

/** Heaviest working set, breaking ties on reps. */
function bestOf<T extends LiftSetPoint>(sets: T[]): T | null {
  let best: T | null = null
  for (const s of sets) {
    if (
      !best ||
      s.weightLb > best.weightLb ||
      (s.weightLb === best.weightLb && s.reps > best.reps)
    ) {
      best = s
    }
  }
  return best
}

function muscleLabel(ex: RawExercise): string {
  const muscles = ex.primaryMuscles?.map((m) => m.name).filter(Boolean).join(", ")
  return muscles || ex.category || ""
}

/**
 * Per-exercise progress across completed sessions. `windowSessions` drives the
 * reported window; `allSessions` supplies the all-time best, so a PR set outside
 * the window still shows up as the bar to beat.
 */
export function buildLiftProgression(
  windowSessions: AgentSessionLike[],
  allSessions: AgentSessionLike[]
): LiftProgress[] {
  const completedWindow = windowSessions.filter((s) => s.status === COMPLETED_SESSION_STATUS)
  const completedAll = allSessions.filter((s) => s.status === COMPLETED_SESSION_STATUS)

  const allTimeBest = new Map<string, LiftSetPoint & { date: string }>()
  for (const session of completedAll) {
    const day = storedEntryDayKey(session.date)
    for (const ex of parseJsonArray<RawExercise>(session.exercises)) {
      if (!ex?.name) continue
      const points = (ex.sets ?? [])
        .filter(isWorkingSet)
        .map(setPoint)
        .filter((p): p is LiftSetPoint => p != null)
        .map((p) => ({ ...p, date: day }))
      const best = bestOf(points)
      if (!best) continue
      const key = normalizeExerciseKey(ex.name)
      const prior = allTimeBest.get(key)
      if (
        !prior ||
        best.weightLb > prior.weightLb ||
        (best.weightLb === prior.weightLb && best.reps > prior.reps)
      ) {
        allTimeBest.set(key, best)
      }
    }
  }

  const byExercise = new Map<
    string,
    {
      name: string
      muscles: string
      points: LiftSessionPoint[]
      bestSets: Array<LiftSetPoint & { date: string }>
    }
  >()

  for (const session of completedWindow) {
    const day = storedEntryDayKey(session.date)
    for (const ex of parseJsonArray<RawExercise>(session.exercises)) {
      if (!ex?.name) continue
      const points = (ex.sets ?? [])
        .filter(isWorkingSet)
        .map(setPoint)
        .filter((p): p is LiftSetPoint => p != null)
      if (points.length === 0) continue

      const key = normalizeExerciseKey(ex.name)
      const volume = points.reduce((sum, p) => sum + p.weightLb * p.reps, 0)
      const top = bestOf(points)
      const bucket = byExercise.get(key) ?? {
        name: ex.name,
        muscles: muscleLabel(ex),
        points: [],
        bestSets: [],
      }
      if (!bucket.muscles) bucket.muscles = muscleLabel(ex)
      bucket.points.push({
        date: day,
        sessionName: session.name,
        workingSets: points.length,
        topSet: top,
        volumeLb: Math.round(volume),
      })
      if (top) bucket.bestSets.push({ ...top, date: day })
      byExercise.set(key, bucket)
    }
  }

  const result: LiftProgress[] = []
  for (const [key, bucket] of byExercise) {
    // The same movement can appear twice in one session (a second block); keep
    // both points and sort oldest→newest so the trend reads in time order.
    const chronological = [...bucket.points].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    )
    const first = chronological[0]!
    const last = chronological[chronological.length - 1]!

    let loadTrend: LiftProgress["loadTrend"] = null
    if (chronological.length > 1 && first.topSet && last.topSet && first.date !== last.date) {
      const deltaLb = Math.round((last.topSet.weightLb - first.topSet.weightLb) * 10) / 10
      loadTrend = {
        deltaLb,
        pctChange:
          first.topSet.weightLb > 0 ? Math.round((deltaLb / first.topSet.weightLb) * 1000) / 10 : 0,
        from: first.date,
        to: last.date,
      }
    }

    result.push({
      exercise: bucket.name,
      muscles: bucket.muscles,
      sessionsInWindow: new Set(bucket.points.map((p) => p.date)).size,
      lastTrained: last.date,
      firstTrainedInWindow: first.date,
      workingSetsInWindow: bucket.points.reduce((s, p) => s + p.workingSets, 0),
      volumeInWindowLb: bucket.points.reduce((s, p) => s + p.volumeLb, 0),
      bestSetInWindow: bestOf(bucket.bestSets),
      bestSetAllTime: allTimeBest.get(key) ?? null,
      loadTrend,
      history: [...chronological].reverse(),
    })
  }

  // Most-trained first, then heaviest — the movements the user actually drives.
  return result.sort(
    (a, b) =>
      b.sessionsInWindow - a.sessionsInWindow ||
      b.volumeInWindowLb - a.volumeInWindowLb ||
      a.exercise.localeCompare(b.exercise)
  )
}

function fmtSet(s: LiftSetPoint | null): string {
  if (!s) return "—"
  return `${s.weightLb}lb × ${s.reps}${s.est1RmLb != null ? ` (est 1RM ${s.est1RmLb}lb)` : ""}`
}

export function formatLiftProgressionLines(progress: LiftProgress[]): string[] {
  if (progress.length === 0) {
    return ["Lift progression: (no completed strength sessions in this window)"]
  }
  const lines: string[] = [
    `Lift progression (${progress.length} movement(s), completed sessions only):`,
  ]
  for (const p of progress) {
    lines.push(
      `  ${p.exercise}${p.muscles ? ` (${p.muscles})` : ""} — ${p.sessionsInWindow} session(s), ${p.workingSetsInWindow} working set(s), ${p.volumeInWindowLb}lb volume, last ${p.lastTrained}`
    )
    lines.push(
      `      best this window: ${fmtSet(p.bestSetInWindow)}${p.bestSetInWindow ? ` on ${p.bestSetInWindow.date}` : ""}`
    )
    if (p.bestSetAllTime) {
      const isPr =
        p.bestSetInWindow != null &&
        p.bestSetAllTime.date === p.bestSetInWindow.date &&
        p.bestSetAllTime.weightLb === p.bestSetInWindow.weightLb &&
        p.bestSetAllTime.reps === p.bestSetInWindow.reps
      lines.push(
        `      all-time best: ${fmtSet(p.bestSetAllTime)} on ${p.bestSetAllTime.date}${isPr ? " ← set in this window (PR)" : ""}`
      )
    }
    if (p.loadTrend) {
      const dir = p.loadTrend.deltaLb > 0 ? "up" : p.loadTrend.deltaLb < 0 ? "down" : "flat"
      lines.push(
        `      top-set load ${dir} ${p.loadTrend.deltaLb > 0 ? "+" : ""}${p.loadTrend.deltaLb}lb (${p.loadTrend.pctChange > 0 ? "+" : ""}${p.loadTrend.pctChange}%) from ${p.loadTrend.from} to ${p.loadTrend.to}`
      )
    }
    lines.push(`      by session (newest first):`)
    for (const h of p.history) {
      lines.push(
        `        ${h.date} [${truncate(h.sessionName, 40)}]: top ${fmtSet(h.topSet)}, ${h.workingSets} set(s), ${h.volumeLb}lb`
      )
    }
  }
  return lines
}
