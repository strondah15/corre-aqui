const CACHE_NAME = 'corre-aqui-static-v2'
const STATIC_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/corre-aqui-icon-192.png',
]
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const IS_LOCAL_DEV = LOCAL_HOSTS.has(self.location.hostname)

let firebaseMessagingReady = null
let firebaseMessagingImported = false
const recentNotificationTags = new Map()

try {
  importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js')
  importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js')
  firebaseMessagingImported = true
} catch (error) {
  console.warn('[Corre Aqui SW] Firebase Messaging scripts indisponiveis:', error)
}

function notificationTargetUrl(data = {}) {
  const url = data.url || data.click_action || data.link || '/'
  return typeof url === 'string' && url.startsWith('/') ? url : '/'
}

function showCorreNotification(payload = {}) {
  const notification = payload.notification || {}
  const data = payload.data || {}
  const title = notification.title || data.title || 'Corre Aqui'
  const body = notification.body || data.body || data.message || 'Você tem uma atualização.'
  const url = notificationTargetUrl(data)
  const tag = data.tag || data.pedidoId || 'corre-aqui'
  const now = Date.now()
  const lastShownAt = recentNotificationTags.get(tag) || 0

  if (now - lastShownAt < 1500) return Promise.resolve()
  recentNotificationTags.set(tag, now)

  return self.registration.showNotification(title, {
    body,
    icon: data.icon || '/corre-aqui-icon-192.png',
    badge: data.badge || '/corre-aqui-icon-192.png',
    tag,
    renotify: true,
    vibrate: [90, 40, 90],
    requireInteraction: data.requireInteraction === 'true',
    data: { url },
  })
}

function normalizePushPayload(event) {
  if (!event.data) return null

  try {
    const json = event.data.json()
    const data = json?.data || json?.webpush?.data || {}
    const notification = json?.notification || json?.webpush?.notification || {}

    return {
      notification,
      data: {
        ...data,
        title: data.title || notification.title || json.title,
        body: data.body || data.message || notification.body || json.body,
        url: data.url || data.click_action || json.fcmOptions?.link || json.link,
        tag: data.tag || notification.tag || json.collapse_key,
      },
    }
  } catch {
    const body = event.data.text()
    return {
      notification: {},
      data: {
        title: 'Corre Aqui',
        body,
        url: '/',
      },
    }
  }
}

async function initFirebaseMessaging() {
  if (firebaseMessagingReady) return firebaseMessagingReady

  firebaseMessagingReady = (async () => {
    try {
      if (!firebaseMessagingImported || !self.firebase?.messaging) return null

      const res = await fetch('/api/firebase-config', { cache: 'no-store' })
      if (!res.ok) return null

      const { config } = await res.json()
      if (!config?.apiKey || !config?.projectId || !config?.messagingSenderId) return null

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

self.addEventListener('push', (event) => {
  const payload = normalizePushPayload(event)
  const title = payload?.notification?.title || payload?.data?.title
  const body = payload?.notification?.body || payload?.data?.body || payload?.data?.message

  if (!title && !body) return

  event.waitUntil(showCorreNotification(payload))
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
