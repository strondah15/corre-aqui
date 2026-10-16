import { signOut } from 'firebase/auth'
import { ref, remove } from './firebaseDebug'

const SESSION_END_EVENT = 'corre-aqui:session-ending'
const SESSION_LOCAL_KEYS = [
  'meuId',
  'meuNome',
  'cadastroCompleto',
  'fotoURL',
  'fotoUrl',
  'avatarURL',
  'avatarEmoji',
  'emoji',
  'visivelNoMapa',
  'notifsAtivas',
  'modoApp',
  'correAqui.userOnlinePreference.v1',
]

function isBrowser() {
  return typeof window !== 'undefined'
}

async function notifySessionEnding(uid) {
  if (!isBrowser()) return

  const pendingCleanups = []
  const waitUntil = (cleanup) => {
    if (cleanup && typeof cleanup.then === 'function') {
      pendingCleanups.push(Promise.resolve(cleanup))
    }
  }

  window.dispatchEvent(new CustomEvent(SESSION_END_EVENT, { detail: { uid, waitUntil } }))
  if (pendingCleanups.length) await Promise.allSettled(pendingCleanups)
}

export function subscribeSessionEnding(uid, handler) {
  if (!isBrowser() || !uid || typeof handler !== 'function') return () => {}

  const onSessionEnding = (event) => {
    if (String(event?.detail?.uid || '') !== String(uid)) return
    try {
      const cleanup = handler()
      event?.detail?.waitUntil?.(cleanup)
    } catch (error) {
      event?.detail?.waitUntil?.(Promise.reject(error))
    }
  }
  window.addEventListener(SESSION_END_EVENT, onSessionEnding)
  return () => window.removeEventListener(SESSION_END_EVENT, onSessionEnding)
}

export function clearSessionLocalState(uid) {
  if (!isBrowser()) return

  for (const key of SESSION_LOCAL_KEYS) window.localStorage.removeItem(key)
  if (uid) {
    window.localStorage.removeItem(`cadastroCompleto:${uid}`)
    window.localStorage.removeItem(`correAqui:pushTokenKey:${uid}`)
  }

  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index)
    if (key === 'correAqui:returningToList' || key?.startsWith('correAqui:listState:v2:')) {
      window.sessionStorage.removeItem(key)
    }
  }
}

export async function logoutFirebaseSession({ auth, database, uid, removePushToken } = {}) {
  if (!auth || !database) throw new TypeError('logout exige auth e database')

  const currentUid = String(auth.currentUser?.uid || uid || '').trim()
  await notifySessionEnding(currentUid)

  if (currentUid) {
    await Promise.allSettled([
      remove(ref(database, `publicAvailability/${currentUid}`)),
      remove(ref(database, `presence/${currentUid}`)),
      remove(ref(database, `usuariosOnline/${currentUid}`)),
      typeof removePushToken === 'function' ? removePushToken(currentUid) : Promise.resolve(),
    ])
  }

  await signOut(auth)
  clearSessionLocalState(currentUid)
  return currentUid
}
