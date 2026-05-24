'use client'

import app, { auth, database } from '@/lib/firebase'
import { ref, serverTimestamp, update } from 'firebase/database'
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'

export const MESSAGING_SW_PATH = '/firebase-messaging-sw.js'
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || ''

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
    return {
      supported: false,
      permission: Notification.permission,
      reason: 'Push real exige HTTPS. Teste pelo deploy da Vercel ou domínio seguro.',
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

  if (!VAPID_KEY) {
    return {
      supported: false,
      permission: Notification.permission,
      reason: 'NEXT_PUBLIC_FIREBASE_VAPID_KEY nao esta configurada no build.',
      vapidConfigured: false,
    }
  }

  return {
    supported: true,
    permission: Notification.permission,
    reason: '',
    vapidConfigured: true,
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
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  })

  if (!token) throw new Error('Firebase nao retornou token FCM.')

  const key = tokenKey(token)
  const info = platformInfo()

  await update(ref(database), {
    [`users/${uid}/notificacoes`]: true,
    [`users/${uid}/push`]: {
      enabled: true,
      permission,
      provider: 'firebase_messaging',
      tokenKey: key,
      updatedAt: serverTimestamp(),
      ...info,
    },
    [`users/${uid}/profile/notificacoes`]: true,
    [`users/${uid}/profile/pushNotifications`]: {
      enabled: true,
      permission,
      provider: 'firebase_messaging',
      tokenKey: key,
      updatedAt: serverTimestamp(),
    },
    [`users/${uid}/pushTokens/${key}`]: {
      token,
      enabled: true,
      active: true,
      provider: 'firebase_messaging',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...info,
    },
  })

  return { token, tokenKey: key, permission, swPath: MESSAGING_SW_PATH }
}

function mensagemErroPushApi(data, fallback = 'Nao consegui enviar o push de teste agora.') {
  const reason = data?.reason || data?.error || ''

  if (reason === 'firebase_admin_not_configured') {
    return 'Firebase Admin nao esta configurado no servidor da Vercel.'
  }

  if (reason === 'no_push_tokens') {
    return 'Token não encontrado.'
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

  return reason ? `${fallback} (${reason})` : fallback
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
  const data = await response.json().catch(() => ({}))

  if (!response.ok || data?.ok === false) {
    throw new Error(mensagemErroPushApi(data))
  }

  return data
}

export async function desativarPushNotifications(uid) {
  if (!uid) return

  const messagingSupported = await isSupported().catch(() => false)
  if (messagingSupported) {
    await deleteToken(getMessaging(app)).catch(() => {})
  }

  await update(ref(database), {
    [`users/${uid}/push/enabled`]: false,
    [`users/${uid}/push/disabledAt`]: serverTimestamp(),
    [`users/${uid}/profile/pushNotifications/enabled`]: false,
    [`users/${uid}/profile/pushNotifications/disabledAt`]: serverTimestamp(),
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
