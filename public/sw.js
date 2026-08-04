const LEGACY_CACHE_PREFIX = "thegrid-"

self.addEventListener("install", (event) => {
  // THEGRID requires live API data, so this worker exists for web push rather
  // than offline page caching. Activate the cleanup worker immediately.
  event.waitUntil(self.skipWaiting())
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(LEGACY_CACHE_PREFIX))
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  )
})

// Web Push
// iOS 16.4+ delivers pushes to PWAs installed to the home screen. Every payload
// must result in a visible notification or iOS can revoke permission.
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
// The client will create a fresh subscription on its next successful open.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.pushManager
      .getSubscription()
      .then((sub) => sub && sub.unsubscribe().catch(() => {}))
  )
})
