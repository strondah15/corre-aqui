'use client'

import app, { auth, database } from '@/lib/firebase'
import { get, ref, serverTimestamp, update, remove } from './firebaseDebug'
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'

export const MESSAGING_SW_PATH = '/firebase-messaging-sw.js'
const TOKEN_KEY_STORAGE = 'correAqui:pushTokenKey'
let resolvedVapidConfig = null
let resolvedVapidConfigPromise = null
const removedTokenUids = new Set()

function tokenKey(token) {
  return String(token || '')
    .replace(/[.#$/[\]\u0000-\u001F\u007F]/g, '_')
    .slice(0, 180)
}

function platformInfo() {
  if (typeof window === 'undefined') return {}

  return {
    userAgent: window.navigator?.userAgent || '',
    standalone: Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone),
    language: window.navigator?.language || 'pt-BR',
    origin: window.location.origin,
  }
}

function saveLocalTokenKey(uid, key) {
  try {
    if (uid && key) localStorage.setItem(`${TOKEN_KEY_STORAGE}:${uid}`, key)
  } catch {}
}

function readLocalTokenKey(uid) {
  try {
    return uid ? localStorage.getItem(`${TOKEN_KEY_STORAGE}:${uid}`) || '' : ''
  } catch {
    return ''
  }
}

function clearLocalTokenKey(uid) {
  try {
    if (uid) localStorage.removeItem(`${TOKEN_KEY_STORAGE}:${uid}`)
  } catch {}
}

async function persistPushRegistration(uid, token, permission = 'granted', { includeCreatedAt = false } = {}) {
  const key = tokenKey(token)
  if (!uid || !key) throw new Error('Token FCM invalido.')

  const info = platformInfo()
  const tokenPayload = {
    token,
    enabled: true,
    active: true,
    provider: 'firebase_messaging',
    updatedAt: serverTimestamp(),
    ...info,
  }
  if (includeCreatedAt) tokenPayload.createdAt = serverTimestamp()

  await update(ref(database, `users/${uid}`), { notificacoes: true })
  await update(ref(database, `users/${uid}/push`), {
    enabled: true,
    permission,
    provider: 'firebase_messaging',
    tokenKey: key,
    updatedAt: serverTimestamp(),
    ...info,
  })
  await update(ref(database, `users/${uid}/profile`), { notificacoes: true })
  await update(ref(database, `users/${uid}/profile/pushNotifications`), {
    enabled: true,
    permission,
    provider: 'firebase_messaging',
    tokenKey: key,
    updatedAt: serverTimestamp(),
  })
  await update(ref(database, `userPrivate/${uid}`), {
    push: {
      enabled: true,
      permission,
      provider: 'firebase_messaging',
      tokenKey: key,
      updatedAt: serverTimestamp(),
      ...info,
    },
    [`pushTokens/${key}`]: tokenPayload,
  })

  saveLocalTokenKey(uid, key)
  removedTokenUids.delete(uid)
  return { token, tokenKey: key, permission, swPath: MESSAGING_SW_PATH }
}

async function getVapidConfig() {
  if (resolvedVapidConfig) return resolvedVapidConfig
  if (typeof window === 'undefined') return { key: '', configured: false }

  if (!resolvedVapidConfigPromise) {
    resolvedVapidConfigPromise = fetch('/api/firebase-config', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return { key: '', configured: false }
        const data = await response.json().catch(() => ({}))
        const key = String(data?.vapidKey || '').trim()
        const configured = Boolean(data?.vapidKeyConfigured && key)
        if (process.env.NODE_ENV !== 'production') {
          console.log('[PUSH CONFIG]', {
            vapidKeyConfigured: data?.vapidKeyConfigured,
            hasVapidKey: Boolean(key),
          })
        }
        return { key, configured }
      })
      .catch(() => ({ key: '', configured: false }))
  }

  resolvedVapidConfig = await resolvedVapidConfigPromise
  return resolvedVapidConfig
}

async function getVapidKey() {
  const config = await getVapidConfig()
  return config.configured ? config.key : ''
}

export async function getPushCapabilities() {
  if (typeof window === 'undefined') {
    return { supported: false, permission: 'unsupported', reason: 'Disponivel apenas no navegador.' }
  }

  if (!('Notification' in window)) {
    return { supported: false, permission: 'unsupported', reason: 'Este navegador nao tem notificacoes web.' }
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return {
      supported: false,
      permission: Notification.permission,
      reason: 'Este navegador nao suporta push web.',
    }
  }

  if (!window.isSecureContext) {
    const hostname = window.location?.hostname || ''
    const isLanHost = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname)

    return {
      supported: false,
      permission: Notification.permission,
      reason: isLanHost
        ? 'No celular pelo IP local o Chrome bloqueia notificacoes. Use o link HTTPS da Vercel para ativar.'
        : 'Push real exige HTTPS. Teste pelo deploy da Vercel ou dominio seguro.',
    }
  }

  const messagingSupported = await isSupported().catch(() => false)
  if (!messagingSupported) {
    return {
      supported: false,
      permission: Notification.permission,
      reason: 'Firebase Messaging nao suporta este navegador.',
    }
  }

  const vapidConfig = await getVapidConfig()
  if (!vapidConfig.configured || !vapidConfig.key) {
    return {
      supported: false,
      permission: Notification.permission,
      reason: 'Chave VAPID de notificacoes nao esta configurada no servidor.',
      vapidConfigured: false,
    }
  }

  return {
    supported: true,
    permission: Notification.permission,
    reason: '',
    vapidConfigured: true,
    vapidSource: 'server',
  }
}

export async function getServiceWorkerRegistration() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error('Service worker indisponivel.')
  }

  const registration = await navigator.serviceWorker.register(MESSAGING_SW_PATH, { scope: '/' })
  await navigator.serviceWorker.ready.catch(() => null)
  registration.update?.().catch(() => {})
  return registration
}

export async function ativarPushNotifications(uid) {
  if (!uid) throw new Error('Entre no app antes de ativar notificacoes.')

  const caps = await getPushCapabilities()
  if (!caps.supported) throw new Error(caps.reason || 'Push indisponivel neste navegador.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    await update(ref(database, `users/${uid}/push`), {
      enabled: false,
      permission,
      updatedAt: serverTimestamp(),
    }).catch(() => {})

    throw new Error(permission === 'denied' ? 'Notificacoes bloqueadas no navegador.' : 'Permissao de notificacao nao liberada.')
  }

  const registration = await getServiceWorkerRegistration()
  const messaging = getMessaging(app)
  const vapidKey = await getVapidKey()
  if (!vapidKey) throw new Error('Chave VAPID de notificacoes nao esta configurada no servidor.')

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  })

  if (!token) throw new Error('Firebase nao retornou token FCM.')

  return persistPushRegistration(uid, token, permission, { includeCreatedAt: true })
}

export async function sincronizarPushNotifications(uid) {
  if (!uid || typeof window === 'undefined' || !('Notification' in window)) {
    return { synced: false, reason: 'unavailable' }
  }
  if (Notification.permission !== 'granted') {
    return { synced: false, reason: Notification.permission }
  }

  const configuredState = await get(ref(database, `users/${uid}/push`)).catch(() => null)
  if (configuredState?.exists?.() && configuredState.val()?.enabled === false) {
    return { synced: false, reason: 'disabled_by_user' }
  }

  const caps = await getPushCapabilities()
  if (!caps.supported) return { synced: false, reason: caps.reason || 'unsupported' }

  const registration = await getServiceWorkerRegistration()
  const vapidKey = await getVapidKey()
  if (!vapidKey) return { synced: false, reason: 'missing_vapid' }

  const messaging = getMessaging(app)
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration })
  if (!token) return { synced: false, reason: 'missing_token' }

  const previousKey = readLocalTokenKey(uid)
  const nextKey = tokenKey(token)
  const result = await persistPushRegistration(uid, token, 'granted', {
    includeCreatedAt: !previousKey || previousKey !== nextKey,
  })

  if (previousKey && previousKey !== nextKey) {
    await remove(ref(database, `userPrivate/${uid}/pushTokens/${previousKey}`)).catch(() => {})
  }

  return { ...result, synced: true, rotated: Boolean(previousKey && previousKey !== nextKey) }
}

function mensagemErroPushApi(data, fallback = 'Nao consegui enviar o push de teste agora.') {
  const reason = data?.reason || data?.error || ''
  const code = data?.code || data?.failures?.[0]?.code || ''

  if (reason === 'invalid_push_response') {
    return `A rota de push respondeu sem JSON valido (HTTP ${data?.status || 'erro'}). Veja o terminal do servidor.`
  }

  if (reason === 'firebase_admin_not_configured') {
    return 'Firebase Admin nao esta configurado no servidor da Vercel.'
  }

  if (reason === 'firebase_admin_init_failed') {
    return 'Firebase Admin falhou ao iniciar. Confira FIREBASE_ADMIN_PRIVATE_KEY, FIREBASE_ADMIN_CLIENT_EMAIL e FIREBASE_ADMIN_PROJECT_ID.'
  }

  if (reason === 'fcm_project_mismatch' || code === 'messaging/mismatched-credential') {
    return 'O token FCM e a credencial Admin parecem ser de projetos Firebase diferentes.'
  }

  if (reason === 'fcm_auth_error' || code === 'messaging/third-party-auth-error') {
    return 'O FCM recusou a credencial do servidor. Confira Cloud Messaging e permissoes do Firebase Admin.'
  }

  if (code === 'messaging/invalid-registration-token' || code === 'messaging/registration-token-not-registered') {
    return 'Token FCM antigo ou invalido. Desative e ative as notificacoes novamente.'
  }

  if (reason === 'no_push_tokens') {
    return 'Token FCM nao encontrado. Toque em Ativar notificacoes e teste novamente.'
  }

  if (reason === 'user_notifications_disabled') {
    return 'Notificacoes estao desativadas neste perfil.'
  }

  if (reason === 'missing_auth_token' || reason === 'invalid_auth_token') {
    return 'Sessao expirada. Entre novamente para testar.'
  }

  if (reason === 'forbidden_push_context') {
    return 'A rota recusou o teste para este usuario.'
  }

  if (data?.failureCount && Array.isArray(data.failures) && data.failures.length) {
    return `${fallback} (${code || 'fcm_failed'})`
  }

  return reason || code ? `${fallback} (${reason || code})` : fallback
}

export async function testarPushNotification(uid) {
  if (!uid) throw new Error('Faça login para testar.')

  const currentUser = auth.currentUser
  if (!currentUser?.getIdToken) throw new Error('Faça login para testar.')
  if (currentUser.uid !== uid) throw new Error('Usuario atual nao bate com o perfil aberto.')

  const idToken = await currentUser.getIdToken()
  const response = await fetch('/api/push/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: uid,
      title: '🔔 Teste Corre Aqui',
      body: 'Sua notificação chegou com sucesso!',
      url: '/',
      tipo: 'push_teste',
      test: true,
      prioridade: 'alta',
    }),
  })
  const raw = await response.text().catch(() => '')
  let data = {}

  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    data = { ok: false, reason: 'invalid_push_response', status: response.status }
  }

  if (!response.ok || data?.ok === false) {
    throw new Error(mensagemErroPushApi(data))
  }

  return data
}

export async function removerPushTokenDoDispositivo(uid) {
  if (!uid) return
  if (removedTokenUids.has(uid)) return

  let key = readLocalTokenKey(uid)
  const messagingSupported = await isSupported().catch(() => false)
  const messaging = messagingSupported ? getMessaging(app) : null

  if (!key && messaging && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    const vapidKey = await getVapidKey()
    if (vapidKey) {
      const registration = await getServiceWorkerRegistration().catch(() => null)
      const token = registration ? await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration }).catch(() => '') : ''
      key = tokenKey(token)
    }
  }

  if (messaging) await deleteToken(messaging).catch(() => {})

  if (key) await remove(ref(database, `userPrivate/${uid}/pushTokens/${key}`))

  clearLocalTokenKey(uid)
  removedTokenUids.add(uid)
}

export async function desativarPushNotifications(uid) {
  if (!uid) return

  await removerPushTokenDoDispositivo(uid)

  await update(ref(database, `users/${uid}`), { notificacoes: false })
  await update(ref(database, `users/${uid}/push`), {
    enabled: false,
    disabledAt: serverTimestamp(),
  })
  await update(ref(database, `users/${uid}/profile`), { notificacoes: false })
  await update(ref(database, `users/${uid}/profile/pushNotifications`), {
    enabled: false,
    disabledAt: serverTimestamp(),
  })
}

export async function onForegroundPush(callback) {
  const caps = await getPushCapabilities().catch(() => ({ supported: false }))
  if (!caps.supported) return () => {}

  const messaging = getMessaging(app)
  return onMessage(messaging, (payload) => {
    callback?.(payload)
  })
}
