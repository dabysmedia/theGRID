/** App routes that skip the profile picker / PIN (public agent read surface). */
export const AGENT_PUBLIC_PATH_PREFIXES: readonly string[] = ["/agents"]

export function isAgentPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return AGENT_PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}
