const CACHE_NAME = 'corre-aqui-static-v2'
const STATIC_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/corre-aqui-icon-192.png',
]
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const IS_LOCAL_DEV = LOCAL_HOSTS.has(self.location.hostname)

let firebaseMessagingReady = null

function notificationTargetUrl(data = {}) {
  const url = data.url || data.click_action || data.link || '/'
  return typeof url === 'string' && url.startsWith('/') ? url : '/'
}

function showCorreNotification(payload = {}) {
  const notification = payload.notification || {}
  const data = payload.data || {}
  const title = notification.title || data.title || 'Corre Aqui'
  const body = notification.body || data.body || data.message || 'Voce tem uma atualizacao.'
  const url = notificationTargetUrl(data)

  return self.registration.showNotification(title, {
    body,
    icon: data.icon || '/corre-aqui-icon-192.png',
    badge: data.badge || '/corre-aqui-icon-192.png',
    tag: data.tag || data.pedidoId || 'corre-aqui',
    renotify: true,
    requireInteraction: data.requireInteraction === 'true',
    data: { url },
  })
}

async function initFirebaseMessaging() {
  if (firebaseMessagingReady) return firebaseMessagingReady

  firebaseMessagingReady = (async () => {
    try {
      const res = await fetch('/api/firebase-config', { cache: 'no-store' })
      if (!res.ok) return null

      const { config } = await res.json()
      if (!config?.apiKey || !config?.projectId || !config?.messagingSenderId) return null

      importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js')
      importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js')

      if (!self.firebase?.apps?.length) {
        self.firebase.initializeApp(config)
      }

      const messaging = self.firebase.messaging()
      messaging.onBackgroundMessage((payload) => {
        showCorreNotification(payload)
      })

      return messaging
    } catch (error) {
      console.warn('[Corre Aqui SW] Firebase Messaging indisponivel:', error)
      return null
    }
  })()

  return firebaseMessagingReady
}

self.addEventListener('install', (event) => {
  if (IS_LOCAL_DEV) {
    event.waitUntil(self.skipWaiting())
    return
  }

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => initFirebaseMessaging())
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return
  if (!request.url.startsWith(self.location.origin)) return
  if (IS_LOCAL_DEV) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')))
    return
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification?.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const sameOriginUrl = new URL(url, self.location.origin).href
      const existing = clients.find((client) => client.url === sameOriginUrl || client.url === `${self.location.origin}/`)

      if (existing) {
        existing.focus()
        if ('navigate' in existing) return existing.navigate(sameOriginUrl)
        return existing
      }

      return self.clients.openWindow(sameOriginUrl)
    })
  )
})

initFirebaseMessaging()
