/**
 * Public origin for self-referencing links. Behind Railway's proxy the request
 * URL carries the internal host (0.0.0.0:PORT), so the forwarded headers win.
 */
export function agentBaseFromRequest(req: Request): string {
  const url = new URL(req.url)
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : url.protocol.replace(":", ""))
  return `${proto}://${host}`
}
