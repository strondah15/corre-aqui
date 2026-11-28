import { signOut } from 'firebase/auth'
import { ref, remove } from './firebaseDebug'

const SESSION_END_EVENT = 'corre-aqui:session-ending'
const REMOTE_CLEANUP_TIMEOUT_MS = 2_000
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

  try {
    for (const key of SESSION_LOCAL_KEYS) window.localStorage.removeItem(key)
    if (uid) {
      window.localStorage.removeItem(`cadastroCompleto:${uid}`)
      window.localStorage.removeItem(`correAqui:pushTokenKey:${uid}`)
    }
  } catch {}

  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index)
      if (key === 'correAqui:returningToList' || key?.startsWith('correAqui:listState:v2:')) {
        window.sessionStorage.removeItem(key)
      }
    }
  } catch {}
}

export async function logoutFirebaseSession({ auth, database, uid, removePushToken } = {}) {
  if (!auth || !database) throw new TypeError('logout exige auth e database')

  const user = auth.currentUser
  const currentUid = String(user?.uid || '').trim()
  const expectedUid = String(uid || currentUid).trim()
  const sessionChanged = () => new Error('A conta ativa mudou. Tente sair novamente na conta atual.')
  if (user && currentUid !== expectedUid) throw sessionChanged()

  if (currentUid) {
    let allowCleanup = true
    let timer
    const canContinue = () => allowCleanup && auth.currentUser === user
    // RTDB writes wait for a server response even after updating the local cache.
    const timeout = new Promise((resolve) => {
      timer = setTimeout(resolve, REMOTE_CLEANUP_TIMEOUT_MS)
    })
    const cleanup = async () => {
      await notifySessionEnding(currentUid).catch(() => {})
      const operations = [
        () => remove(ref(database, `publicAvailability/${currentUid}`)),
        () => remove(ref(database, `presence/${currentUid}`)),
        () => remove(ref(database, `usuariosOnline/${currentUid}`)),
        () => removePushToken?.(currentUid, { canContinue }),
      ]
      await Promise.allSettled(operations.map((operation) => Promise.resolve().then(() => {
        if (canContinue()) return operation()
      })))
    }
    try {
      await Promise.race([cleanup(), timeout])
    } finally {
      allowCleanup = false
      clearTimeout(timer)
    }
  }

  if (auth.currentUser && auth.currentUser !== user) throw sessionChanged()
  if (auth.currentUser) await signOut(auth)
  if (auth.currentUser) throw sessionChanged()
  clearSessionLocalState(expectedUid)
  return expectedUid
}
