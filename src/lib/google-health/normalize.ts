/** Google protobuf JSON encodes several integer fields as strings. */
export function optionalNonNegativeInt(value: unknown): number | undefined {
  if (value == null || value === "") return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return Math.round(parsed)
}
