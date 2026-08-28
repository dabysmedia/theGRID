export const TRAINING_SPLITS = [
  "push_pull_legs",
  "upper_lower",
  "full_body",
  "bro_split",
] as const

export type TrainingSplit = (typeof TRAINING_SPLITS)[number]

export const DEFAULT_TRAINING_SPLIT: TrainingSplit = "upper_lower"

export interface TrainingSplitFocus {
  id: string
  label: string
  hint: string
}

export const TRAINING_SPLIT_DEFINITIONS: Record<
  TrainingSplit,
  { label: string; description: string; focuses: TrainingSplitFocus[] }
> = {
  push_pull_legs: {
    label: "Push · Pull · Legs",
    description: "Pressing, pulling, and lower-body days.",
    focuses: [
      { id: "push", label: "Push", hint: "Chest · shoulders · triceps" },
      { id: "pull", label: "Pull", hint: "Back · biceps" },
      { id: "legs", label: "Legs", hint: "Quads · hamstrings · glutes" },
    ],
  },
  upper_lower: {
    label: "Upper · Lower",
    description: "A balanced two-day rotation.",
    focuses: [
      { id: "upper", label: "Upper", hint: "Push · pull · arms" },
      { id: "lower", label: "Lower", hint: "Squat · hinge · glutes" },
    ],
  },
  full_body: {
    label: "Full body",
    description: "Train the whole body in each session.",
    focuses: [{ id: "full_body", label: "Full body", hint: "Balanced head-to-toe session" }],
  },
  bro_split: {
    label: "Bro split",
    description: "Choose one main muscle group per session.",
    focuses: [
      { id: "chest", label: "Chest", hint: "Presses · flyes" },
      { id: "back", label: "Back", hint: "Rows · pulldowns" },
      { id: "shoulders_arms", label: "Shoulders & arms", hint: "Presses · raises · curls · extensions" },
      { id: "legs", label: "Legs", hint: "Quads · hamstrings · glutes" },
    ],
  },
}

export function normalizeTrainingSplit(value: unknown): TrainingSplit {
  return TRAINING_SPLITS.includes(value as TrainingSplit)
    ? (value as TrainingSplit)
    : DEFAULT_TRAINING_SPLIT
}

export function trainingSplitFocuses(split: TrainingSplit): TrainingSplitFocus[] {
  return TRAINING_SPLIT_DEFINITIONS[split].focuses
}
