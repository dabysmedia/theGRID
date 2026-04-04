/** Default unit for weight-based goals, weigh-ins, and related UI (site-wide). */
export const DEFAULT_WEIGHT_UNIT = "lbs"

/** Running distance is stored in km (Prisma); UI uses miles. */
export const KM_PER_MILE = 1.609344

export function kmToMiles(km: number): number {
  return km / KM_PER_MILE
}

export function milesToKm(mi: number): number {
  return mi * KM_PER_MILE
}
