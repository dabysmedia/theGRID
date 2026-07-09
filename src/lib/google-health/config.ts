import "server-only"

export const GOOGLE_HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
] as const

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
export const GOOGLE_HEALTH_API = "https://health.googleapis.com/v4"
export const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

export const GOOGLE_HEALTH_SOURCE = "google-health"

export function getGoogleOAuthCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google Health OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    )
  }
  return { clientId, clientSecret }
}

/** Prefer explicit env; otherwise derive from the incoming request (Railway proxies). */
export function resolveGoogleRedirectUri(req: Request): string {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim()
  if (configured) return configured.replace(/\/$/, "")

  const h = new Headers(req.headers)
  const host = h.get("x-forwarded-host") ?? h.get("host")
  if (!host) {
    throw new Error("Cannot determine redirect URI. Set GOOGLE_REDIRECT_URI.")
  }
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https")
  return `${proto}://${host}/api/google-health/callback`
}

export function isGoogleHealthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim())
}
