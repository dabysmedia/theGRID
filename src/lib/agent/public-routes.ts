/** App routes that skip profile picker / PIN (public agent read surface). */
export const AGENT_PUBLIC_PATH_PREFIXES = ["/agents"] as const

export function isAgentPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return AGENT_PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}
