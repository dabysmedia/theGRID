/** No health-data route bypasses the profile picker or authenticated session. */
export const AGENT_PUBLIC_PATH_PREFIXES: readonly string[] = []

export function isAgentPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return AGENT_PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}
