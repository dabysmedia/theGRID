export const TRACKING_TARGET_DEFAULTS = {
  calories: 2000,
  steps: 10000,
  sleep: 8,
  water: 32,
  recovery: 7,
} as const

export type CoreTrackingTarget = keyof typeof TRACKING_TARGET_DEFAULTS
