/** Uploaded routine cover images are stored under this URL prefix. */
export const ROUTINE_COVER_PREFIX = "/uploads/routine-covers/"

export function normalizeRoutineCoverUrl(raw: unknown): string | null {
  if (raw == null || raw === "") return null
  if (typeof raw !== "string") return null
  const t = raw.trim()
  if (!t) return null
  if (!t.startsWith(ROUTINE_COVER_PREFIX)) return null
  return t
}
