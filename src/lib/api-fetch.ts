const STORAGE_KEY = "theGRID_activeUser"

function getActiveUserId(): string | null {
  if (typeof window === "undefined") return null
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v) {
      const parsed = JSON.parse(v) as { id?: string }
      return parsed.id ?? null
    }
  } catch {}
  return null
}

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const userId = getActiveUserId()
  const headers = new Headers(init?.headers)
  if (userId) headers.set("x-user-id", userId)
  return fetch(input, { ...init, headers })
}
