import "server-only"

import webpush from "web-push"

let configured = false
let configuredError: string | null = null

export function configureVapid(): { ok: true } | { ok: false; error: string } {
  if (configured) return { ok: true }
  if (configuredError) return { ok: false, error: configuredError }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const contact = process.env.VAPID_CONTACT_EMAIL || "mailto:admin@thegrid.local"

  if (!publicKey || !privateKey) {
    configuredError =
      "VAPID keys missing. Run `npx web-push generate-vapid-keys` and set NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY."
    return { ok: false, error: configuredError }
  }

  try {
    webpush.setVapidDetails(contact, publicKey, privateKey)
    configured = true
    return { ok: true }
  } catch (e) {
    configuredError = e instanceof Error ? e.message : String(e)
    return { ok: false, error: configuredError }
  }
}

export { webpush }
