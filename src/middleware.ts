import { NextResponse, type NextRequest } from "next/server"
import { isAgentRangeSlug } from "@/lib/agent/range-presets"

/**
 * Bounces junk /agents/<slug> URLs to the index with a real 308 before the page
 * renders. Next's streaming responses can't set a status after the shell is
 * flushed, so validating here is what keeps crawlers off soft-404 dead ends.
 */
export function middleware(req: NextRequest) {
  const match = /^\/agents\/(.+?)\/?$/.exec(req.nextUrl.pathname)
  if (!match) return NextResponse.next()

  let slug = match[1]!
  try {
    slug = decodeURIComponent(slug)
  } catch {
    // Malformed escape — fall through to the redirect below.
  }
  if (isAgentRangeSlug(slug)) return NextResponse.next()

  return NextResponse.redirect(new URL("/agents", req.url), 308)
}

export const config = {
  matcher: "/agents/:path*",
}
