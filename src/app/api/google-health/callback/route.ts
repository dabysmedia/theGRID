import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveGoogleRedirectUri } from "@/lib/google-health/config"
import { parseOAuthState } from "@/lib/google-health/oauth-state"
import { exchangeAuthorizationCode } from "@/lib/google-health/tokens"
import { syncGoogleHealthForUser } from "@/lib/google-health/sync"

function redirectToMore(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/more", req.url)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const error = searchParams.get("error")
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (error) {
    return redirectToMore(req, {
      google_health: "error",
      message: searchParams.get("error_description") || error,
    })
  }
  if (!code || !state) {
    return redirectToMore(req, {
      google_health: "error",
      message: "Missing authorization code.",
    })
  }

  try {
    const { userId } = parseOAuthState(state)
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) {
      return redirectToMore(req, {
        google_health: "error",
        message: "User not found for OAuth state.",
      })
    }

    const redirectUri = resolveGoogleRedirectUri(req)
    const tokens = await exchangeAuthorizationCode({ code, redirectUri })

    await prisma.googleHealthConnection.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope ?? null,
        googleAccount: tokens.googleAccount ?? null,
      },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope ?? null,
        googleAccount: tokens.googleAccount ?? null,
        lastSyncError: null,
      },
    })

    try {
      await syncGoogleHealthForUser(userId, { days: 30 })
    } catch (syncErr) {
      const msg = syncErr instanceof Error ? syncErr.message : "Initial sync failed"
      await prisma.googleHealthConnection.update({
        where: { userId },
        data: { lastSyncError: msg },
      })
      return redirectToMore(req, {
        google_health: "connected",
        sync: "partial",
        message: msg,
      })
    }

    return redirectToMore(req, { google_health: "connected", sync: "ok" })
  } catch (e) {
    const message = e instanceof Error ? e.message : "OAuth callback failed"
    return redirectToMore(req, { google_health: "error", message })
  }
}
