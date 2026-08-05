import "server-only"

import { prisma } from "@/lib/prisma"
import {
  getGoogleOAuthCredentials,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
} from "@/lib/google-health/config"

export type TokenBundle = {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  scope?: string | null
}

export async function exchangeAuthorizationCode(input: {
  code: string
  redirectUri: string
}): Promise<TokenBundle & { googleAccount?: string | null }> {
  const { clientId, clientSecret } = getGoogleOAuthCredentials()
  const body = new URLSearchParams({
    code: input.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    error?: string
    error_description?: string
  }
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Token exchange failed")
  }
  if (!data.refresh_token) {
    throw new Error(
      "No refresh token returned. Revoke prior consent or ensure access_type=offline and prompt=consent.",
    )
  }

  let googleAccount: string | null = null
  try {
    const ui = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    })
    if (ui.ok) {
      const profile = (await ui.json()) as { email?: string }
      googleAccount = profile.email ?? null
    }
  } catch {
    /* optional */
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    scope: data.scope ?? null,
    googleAccount,
  }
}

async function refreshAccessToken(refreshToken: string): Promise<TokenBundle> {
  const { clientId, clientSecret } = getGoogleOAuthCredentials()
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  })
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    scope?: string
    refresh_token?: string
    error?: string
    error_description?: string
  }
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Token refresh failed")
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    scope: data.scope ?? null,
  }
}

/** Returns a valid access token for the user, refreshing if needed. */
export async function getValidAccessToken(userId: string): Promise<string> {
  const conn = await prisma.googleHealthConnection.findUnique({ where: { userId } })
  if (!conn) throw new Error("Google Health is not connected.")

  const skewMs = 60_000
  if (conn.expiresAt.getTime() - skewMs > Date.now()) {
    return conn.accessToken
  }

  const refreshed = await refreshAccessToken(conn.refreshToken)
  await prisma.googleHealthConnection.update({
    where: { userId },
    data: {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
      scope: refreshed.scope ?? conn.scope,
    },
  })
  return refreshed.accessToken
}

export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })
  } catch {
    /* best-effort */
  }
}
