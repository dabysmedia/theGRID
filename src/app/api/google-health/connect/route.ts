import { NextRequest, NextResponse } from "next/server"
import { resolveUserId, UserError } from "@/lib/current-user"
import {
  getGoogleOAuthCredentials,
  GOOGLE_AUTH_URL,
  GOOGLE_HEALTH_SCOPES,
  isGoogleHealthConfigured,
  resolveGoogleRedirectUri,
} from "@/lib/google-health/config"
import { createOAuthState } from "@/lib/google-health/oauth-state"

export async function GET(req: NextRequest) {
  try {
    if (!isGoogleHealthConfigured()) {
      return NextResponse.json(
        { error: "Google Health OAuth is not configured on the server." },
        { status: 503 },
      )
    }
    const userId = await resolveUserId(req)
    const { clientId } = getGoogleOAuthCredentials()
    const redirectUri = resolveGoogleRedirectUri(req)
    const state = createOAuthState(userId)

    const url = new URL(GOOGLE_AUTH_URL)
    url.searchParams.set("client_id", clientId)
    url.searchParams.set("redirect_uri", redirectUri)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("access_type", "offline")
    url.searchParams.set("prompt", "consent")
    url.searchParams.set("include_granted_scopes", "false")
    url.searchParams.set("scope", GOOGLE_HEALTH_SCOPES.join(" "))
    url.searchParams.set("state", state)

    return NextResponse.json({ url: url.toString(), redirectUri })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    const message = e instanceof Error ? e.message : "Failed to start OAuth"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
