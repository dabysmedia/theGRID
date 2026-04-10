/** Default unit for weight-based goals, weigh-ins, and related UI (site-wide). */
export const DEFAULT_WEIGHT_UNIT = "lbs"

/** Running distance is stored in km in the DB; all UI shows miles. */
export const KM_PER_MILE = 1.609344

export function kmToMiles(km: number): number {
  return km / KM_PER_MILE
}

export function milesToKm(mi: number): number {
  return mi * KM_PER_MILE
}

/** Steps credited from running distance on the Steps tab (1,500 steps per mile). */
export const STEPS_PER_MILE_FROM_RUN = 1500

/** `distanceKm` is stored distance on RunEntry (km). */
export function runKmToStepsFromRun(distanceKm: number): number {
  return Math.round(kmToMiles(distanceKm) * STEPS_PER_MILE_FROM_RUN)
}
