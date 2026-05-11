const CACHE_NAME = "thegrid-v5"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        "/",
        "/weight",
        "/log",
        "/manifest.json",
        "/icons/icon.svg",
      ])
    )
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return

  const url = new URL(event.request.url)
  // Never cache API routes — stale dashboard JSON on mobile / PWA was showing zeros.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request))
    return
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        return response
      })
      .catch(() => caches.match(event.request))
  )
})

// ─── Web Push ─────────────────────────────────────────────────────────────
// iOS 16.4+ delivers pushes to PWAs installed to the home screen. Every payload
// MUST result in a visible notification or iOS revokes permission, so we always
// call showNotification() inside event.waitUntil.

self.addEventListener("push", (event) => {
  let payload = {}
  if (event.data) {
    try {
      payload = event.data.json()
    } catch {
      payload = { title: "THEGRID", body: event.data.text() }
    }
  }

  const title = payload.title || "THEGRID"
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icons/icon.svg",
    badge: payload.badge || "/icons/icon.svg",
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
    data: {
      url: payload.url || "/",
      type: payload.type || null,
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/"
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientsList) => {
        for (const client of clientsList) {
          try {
            const clientUrl = new URL(client.url)
            if (clientUrl.origin === self.location.origin && "focus" in client) {
              client.navigate(url).catch(() => {})
              return client.focus()
            }
          } catch {
            /* noop */
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url)
        }
      })
  )
})

// Some browsers fire `pushsubscriptionchange` when the subscription is rotated.
// We can't get hold of the active user here, so we just clear the subscription
// client-side. The PushNotificationManager will re-subscribe on next open.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.pushManager
      .getSubscription()
      .then((sub) => sub && sub.unsubscribe().catch(() => {}))
  )
})
