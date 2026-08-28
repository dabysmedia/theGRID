import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  resolveGoogleRedirectUri,
  resolvePublicOrigin,
} from "@/lib/google-health/config"
import { parseOAuthState } from "@/lib/google-health/oauth-state"
import { exchangeAuthorizationCode, revokeGoogleToken } from "@/lib/google-health/tokens"
import { syncGoogleHealthForUser } from "@/lib/google-health/sync"
import { resolveSessionUserId } from "@/lib/user-session"

function redirectToMore(req: NextRequest, params: Record<string, string>) {
  // Never base redirects on req.url — on Railway it is often http://0.0.0.0:8080
  const url = new URL("/more", `${resolvePublicOrigin(req)}/`)
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
    const sessionUserId = await resolveSessionUserId(req)
    if (!sessionUserId || sessionUserId !== userId) {
      return redirectToMore(req, {
        google_health: "error",
        message: "The profile session changed during Google authorization. Start the connection again.",
      })
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) {
      return redirectToMore(req, {
        google_health: "error",
        message: "User not found for OAuth state.",
      })
    }

    const redirectUri = resolveGoogleRedirectUri(req)
    const tokens = await exchangeAuthorizationCode({ code, redirectUri })

    if (!tokens.googleSubject) {
      await revokeGoogleToken(tokens.accessToken)
      return redirectToMore(req, {
        google_health: "error",
        message: "Google did not return a verifiable account identity. Please reconnect and approve profile access.",
      })
    }

    const existingOwner = await prisma.googleHealthConnection.findFirst({
      where: {
        NOT: { userId },
        OR: [
          { googleSubject: tokens.googleSubject },
          ...(tokens.googleAccount ? [{ googleAccount: tokens.googleAccount }] : []),
        ],
      },
      select: { userId: true },
    })
    if (existingOwner) {
      await revokeGoogleToken(tokens.accessToken)
      return redirectToMore(req, {
        google_health: "error",
        message: "That Google account is already connected to another THEGRID profile.",
      })
    }

    await prisma.googleHealthConnection.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope ?? null,
        googleAccount: tokens.googleAccount ?? null,
        googleSubject: tokens.googleSubject,
      },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope ?? null,
        googleAccount: tokens.googleAccount ?? null,
        googleSubject: tokens.googleSubject,
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
