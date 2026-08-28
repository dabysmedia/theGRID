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

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const userId = getActiveUserId()
  const headers = new Headers(init?.headers)
  if (userId) headers.set("x-user-id", userId)
  const response = await fetch(input, { ...init, headers, credentials: "same-origin" })
  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("grid:session-expired"))
  }
  return response
}
