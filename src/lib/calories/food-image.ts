/** Keep food images render-safe while supporting hosted product art and local meal uploads. */
export function normalizeFoodImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (trimmed.startsWith("/uploads/") || trimmed.startsWith("/api/uploads/")) {
    return trimmed
  }

  try {
    const url = new URL(trimmed)
    return url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}
