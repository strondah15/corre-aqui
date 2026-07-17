const CACHE_NAME = 'corre-aqui-static-v3'
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
const recentNotificationKeys = new Map()

try {
  importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js')
  importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js')
  firebaseMessagingImported = true
} catch (error) {
  console.warn('[Corre Aqui SW] Firebase Messaging scripts indisponiveis:', error)
}

function notificationTargetUrl(data = {}) {
  const value = data.url || data.click_action || data.link || '/'
  if (typeof value !== 'string' || !value.startsWith('/')) return '/'

  try {
    const url = new URL(value, self.location.origin)
    if (url.origin !== self.location.origin) return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

function asBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function parseActions(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function notificationKey(payload = {}) {
  const data = payload.data || {}
  return String(
    data.eventId ||
      data.tag ||
      [data.type || data.tipo || '', data.pedidoId || '', data.conversaId || '', data.timestamp || '', data.body || ''].join('|'),
  )
}

function cleanupRecentNotifications(now) {
  for (const [entry, timestamp] of recentNotificationTags.entries()) {
    if (now - timestamp > 60000) recentNotificationTags.delete(entry)
  }
  for (const [entry, timestamp] of recentNotificationKeys.entries()) {
    if (now - timestamp > 60000) recentNotificationKeys.delete(entry)
  }
}

function showCorreNotification(payload = {}) {
  const notification = payload.notification || {}
  const data = payload.data || {}
  const title = notification.title || data.title || 'Corre Aqui'
  const body = notification.body || data.body || data.message || 'Voce tem uma atualizacao.'
  const url = notificationTargetUrl(data)
  const tag = data.tag || data.pedidoId || 'corre-aqui'
  const key = notificationKey(payload)
  const now = Date.now()
  const lastShownAt = recentNotificationTags.get(tag) || 0
  const lastKeyAt = recentNotificationKeys.get(key) || 0

  if (now - lastShownAt < 3000 || now - lastKeyAt < 3000) return Promise.resolve()

  recentNotificationTags.set(tag, now)
  recentNotificationKeys.set(key, now)
  cleanupRecentNotifications(now)

  const actions = parseActions(data.actions)
    .map((action, index) => ({
      action: String(action?.action || `open_${index}`).slice(0, 32),
      title: String(action?.title || action?.label || '').slice(0, 36),
      url: notificationTargetUrl({ url: action?.url || url }),
    }))
    .filter((action) => action.title)
    .slice(0, 2)

  return self.registration.getNotifications(tag).then((existing) => {
    if (existing.length) return null

    return self.registration.showNotification(title, {
    body,
    icon: data.icon || '/corre-aqui-icon-192.png',
    badge: data.badge || '/corre-aqui-icon-192.png',
    image: data.image || undefined,
    tag,
    renotify: data.renotify === undefined || asBoolean(data.renotify),
    vibrate: [90, 40, 90],
    requireInteraction: asBoolean(data.requireInteraction),
    actions: actions.map(({ action, title }) => ({ action, title })),
    data: {
      url,
      type: data.type || data.tipo || '',
      pedidoId: data.pedidoId || '',
      conversaId: data.conversaId || '',
      fromUid: data.fromUid || '',
      toUid: data.toUid || '',
      eventId: data.eventId || '',
      actionLabel: data.actionLabel || '',
      actionScreen: data.actionScreen || '',
      actionId: data.actionId || '',
      actions,
    },
    })
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
        icon: data.icon || notification.icon || json.icon,
        badge: data.badge || notification.badge || json.badge,
        image: data.image || notification.image || json.image,
        actions: data.actions || notification.actions || json.actions,
        renotify: data.renotify ?? notification.renotify ?? json.renotify,
        requireInteraction: data.requireInteraction ?? notification.requireInteraction ?? json.requireInteraction,
      },
    }
  } catch {
    return {
      notification: {},
      data: {
        title: 'Corre Aqui',
        body: event.data.text(),
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

      if (!self.firebase?.apps?.length) self.firebase.initializeApp(config)

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
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => initFirebaseMessaging())
      .then(() => self.clients.claim()),
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
  const notificationData = event.notification?.data || {}
  const selectedAction = (notificationData.actions || []).find((item) => item.action === event.action)
  const url = notificationTargetUrl({ url: selectedAction?.url || notificationData.url || '/' })

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const targetUrl = new URL(url, self.location.origin).href
      const existing = clients.find((client) => client.url === targetUrl) || clients.find((client) => client.url.startsWith(self.location.origin))

      if (existing) {
        return existing.focus().then(() => {
          if ('navigate' in existing) return existing.navigate(targetUrl)
          return existing
        })
      }

      return self.clients.openWindow(targetUrl)
    }),
  )
})

initFirebaseMessaging()
