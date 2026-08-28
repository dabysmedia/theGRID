import "server-only"

import {
  DEFAULT_WORK_CYCLE_ANCHOR,
  getTrackingPeriod,
  parseWorkCyclePattern,
} from "@/lib/work-cycle"
import {
  TRAINING_SPLIT_DEFINITIONS,
  normalizeTrainingSplit,
} from "@/lib/workouts/training-split"
import {
  TRAINING_STYLE_DEFINITIONS,
  normalizeTrainingStyle,
} from "@/lib/workouts/training-style"

export interface AgentTrainingProfile {
  trainingSplit: string
  trainingStyle: string
  workCycleEnabled: boolean
  workCycleAnchorDate: string | null
  workCycleLength: number
  workCyclePatternJson: string
  workoutGoalPerCycle: number
  birthDate: string | null
}

export interface AgentTrainingContext {
  split: { key: string; label: string; description: string; focuses: string[] }
  style: { key: string; label: string; description: string }
  /** Null when the user trains on a plain Mon–Sun week instead of a rotation. */
  workCycle: {
    enabled: true
    anchorDate: string
    length: number
    pattern: string[]
    workoutGoalPerCycle: number
    today: { phase: string; cycleDay: number; periodFrom: string; periodTo: string }
  } | null
}

export function buildTrainingContext(
  profile: AgentTrainingProfile,
  todayKey: string
): AgentTrainingContext {
  const splitKey = normalizeTrainingSplit(profile.trainingSplit)
  const splitDef = TRAINING_SPLIT_DEFINITIONS[splitKey]
  const styleKey = normalizeTrainingStyle(profile.trainingStyle)
  const styleDef = TRAINING_STYLE_DEFINITIONS[styleKey]

  let workCycle: AgentTrainingContext["workCycle"] = null
  if (profile.workCycleEnabled) {
    const anchorDate = profile.workCycleAnchorDate ?? DEFAULT_WORK_CYCLE_ANCHOR
    const period = getTrackingPeriod(todayKey, {
      enabled: true,
      anchorDate,
      length: profile.workCycleLength,
      patternJson: profile.workCyclePatternJson,
      goal: profile.workoutGoalPerCycle,
    })
    workCycle = {
      enabled: true,
      anchorDate,
      length: period.length,
      pattern: parseWorkCyclePattern(profile.workCyclePatternJson, profile.workCycleLength),
      workoutGoalPerCycle: period.goal,
      today: {
        phase: period.phaseLabel,
        cycleDay: period.dayNumber,
        periodFrom: period.startDate,
        periodTo: period.endDate,
      },
    }
  }

  return {
    split: {
      key: splitKey,
      label: splitDef.label,
      description: splitDef.description,
      focuses: splitDef.focuses.map((f) => `${f.label} — ${f.hint}`),
    },
    style: { key: styleKey, label: styleDef.label, description: styleDef.description },
    workCycle,
  }
}

export function formatTrainingSplitLines(
  profile: AgentTrainingProfile,
  todayKey: string
): string[] {
  const ctx = buildTrainingContext(profile, todayKey)
  const lines: string[] = [
    `Training split: ${ctx.split.label} (${ctx.split.key}) — ${ctx.split.description}`,
  ]
  for (const focus of ctx.split.focuses) {
    lines.push(`  - ${focus}`)
  }
  lines.push(`Progression model: ${ctx.style.label} (${ctx.style.key}) — ${ctx.style.description}`)

  if (ctx.workCycle) {
    const wc = ctx.workCycle
    lines.push(
      `Work rotation: ${wc.length}-day cycle [${wc.pattern.join(", ")}], anchored ${wc.anchorDate}, goal ${wc.workoutGoalPerCycle} workout(s) per cycle`
    )
    lines.push(
      `  today is cycle day ${wc.today.cycleDay} (${wc.today.phase}); current cycle runs ${wc.today.periodFrom} → ${wc.today.periodTo}`
    )
  } else {
    lines.push("Work rotation: off (training tracked on a Mon–Sun week)")
  }

  return lines
}
