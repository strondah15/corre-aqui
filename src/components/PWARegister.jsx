'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, database } from '@/lib/firebase'
import { get, ref, update } from '@/lib/firebaseDebug'
import InstallAppBanner from '@/components/InstallAppBanner'
import {
  ativarPushNotifications,
  getPushCapabilities,
  getServiceWorkerRegistration,
  onForegroundPush,
  removerPushTokenDoDispositivo,
  sincronizarPushNotifications,
} from '@/lib/pushClient'

const PUSH_PROMPT_COOLDOWN = 14 * 24 * 60 * 60 * 1000
const ESSENTIAL_FOREGROUND_TYPES = new Set([
  'agendamento_criado',
  'agendamento_solicitado',
  'agendamento_aceito',
  'pedido_aceito',
  'pedido_direto_aceito',
  'corre_aceito',
])

function promptStorageKey(uid) {
  return `correAqui:pushPromptDismissed:${uid}`
}

function readPromptDismissedAt(uid) {
  try {
    return Number(localStorage.getItem(promptStorageKey(uid)) || 0)
  } catch {
    return 0
  }
}

function savePromptDismissedAt(uid) {
  try {
    if (uid) localStorage.setItem(promptStorageKey(uid), String(Date.now()))
  } catch {}
}

function readPushUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/'
  return value
}

function safePushEventId(value) {
  const eventId = String(value || '').trim()
  return /^[a-zA-Z0-9_-]{1,180}$/.test(eventId) ? eventId : ''
}

function logPushDiagnostic(data = {}, deduplicated = false) {
  if (process.env.NODE_ENV === 'production') return
  console.debug('[PUSH] evento recebido')
  console.debug('[PUSH] eventId:', safePushEventId(data.eventId) || 'ausente')
  console.debug('[PUSH] tipo:', String(data.type || data.tipo || 'notification').slice(0, 80))
  console.debug('[PUSH] destino:', readPushUrl(data.url))
  console.debug('[PUSH] foreground/background:', 'foreground')
  console.debug('[PUSH] deduplicado:', deduplicated ? 'sim' : 'nao')
}

async function markPushEventAsRead(uid, rawEventId) {
  const eventId = safePushEventId(rawEventId)
  if (!uid || !eventId) return

  const now = Date.now()
  await Promise.allSettled(['notifications', 'notificacoes'].map(async (root) => {
    const target = ref(database, `${root}/${uid}/${eventId}`)
    const snapshot = await get(target)
    if (!snapshot.exists()) return
    await update(target, { lida: true, read: true, lidaEm: now, vistoEm: now })
  }))
}

function consumeOpenedPushEventId() {
  if (typeof window === 'undefined') return ''
  const url = new URL(window.location.href)
  const eventId = safePushEventId(url.searchParams.get('notificationEventId'))
  if (!url.searchParams.has('notificationEventId')) return eventId

  url.searchParams.delete('notificationEventId')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  return eventId
}

export default function PWARegister() {
  const router = useRouter()
  const [foregroundToast, setForegroundToast] = useState(null)
  const [pushPrompt, setPushPrompt] = useState(null)
  const [ativandoPush, setAtivandoPush] = useState(false)
  const [pushPromptError, setPushPromptError] = useState('')
  const [installAppReady, setInstallAppReady] = useState(false)
  const toastTimer = useRef(null)
  const lastPush = useRef({ key: '', at: 0 })
  const currentUid = useRef('')
  const activeChatId = useRef('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (!window.isSecureContext) return

    const register = () => {
      getServiceWorkerRegistration().catch((error) => {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[Corre Aqui] Service worker push nao registrou:', error?.message || error)
        }
      })
    }

    if (document.readyState === 'complete') {
      register()
      return
    }

    window.addEventListener('load', register, { once: true })
    return () => window.removeEventListener('load', register)
  }, [])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const previousUid = currentUid.current
      const nextUid = user?.uid || ''

      if (previousUid && previousUid !== nextUid) {
        await removerPushTokenDoDispositivo(previousUid).catch((error) => {
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[PUSH] limpeza do aparelho na troca de conta falhou:', error?.message || error)
          }
        })
      }

      currentUid.current = nextUid
      setInstallAppReady(Boolean(nextUid))
      if (!user?.uid) {
        setPushPrompt(null)
        return
      }

      const openedEventId = consumeOpenedPushEventId()
      if (openedEventId) await markPushEventAsRead(user.uid, openedEventId)

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        sincronizarPushNotifications(user.uid).catch((error) => {
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[PUSH] sincronizacao silenciosa falhou:', error?.message || error)
          }
        })
      }
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let promptTimer = null
    const requestContextualPrompt = async (event) => {
      const uid = currentUid.current
      if (!uid || pushPrompt) return

      const caps = await getPushCapabilities().catch(() => null)
      if (!caps?.supported || caps.permission !== 'default') return
      if (Date.now() - readPromptDismissedAt(uid) < PUSH_PROMPT_COOLDOWN) return

      if (document.querySelector('[aria-modal="true"], [data-tutorial-overlay]')) {
        window.clearTimeout(promptTimer)
        promptTimer = window.setTimeout(() => requestContextualPrompt(event), 1600)
        return
      }

      setPushPrompt({ context: event?.detail?.context || event?.type || 'contextual' })
      setPushPromptError('')
    }

    const setActiveChat = (event) => {
      activeChatId.current = event?.detail?.active === false ? '' : String(event?.detail?.pedidoId || '')
    }

    window.addEventListener('correaqui:pedido-confirmado', requestContextualPrompt)
    window.addEventListener('correaqui:push-context', requestContextualPrompt)
    window.addEventListener('correaqui:active-chat', setActiveChat)
    return () => {
      window.clearTimeout(promptTimer)
      window.removeEventListener('correaqui:pedido-confirmado', requestContextualPrompt)
      window.removeEventListener('correaqui:push-context', requestContextualPrompt)
      window.removeEventListener('correaqui:active-chat', setActiveChat)
    }
  }, [pushPrompt])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) return

    let active = true
    let unsubscribe = () => {}

    onForegroundPush((payload) => {
      if (!active) return

      const notification = payload?.notification || {}
      const data = payload?.data || {}
      const title = notification.title || data.title || 'Corre Aqui'
      const body = notification.body || data.body || data.message || ''
      const type = String(data.type || data.tipo || '').toLowerCase()
      const pedidoId = String(data.pedidoId || data.conversaId || '')
      const key = String(data.eventId || data.tag || `${data.type || data.tipo || ''}|${data.pedidoId || ''}|${body}`)
      const now = Date.now()
      const duplicated = lastPush.current.key === key && now - lastPush.current.at < 4000

      logPushDiagnostic(data, duplicated)
      if (duplicated) return
      lastPush.current = { key, at: now }
      if (ESSENTIAL_FOREGROUND_TYPES.has(type) && data.eventId) return
      if ((type === 'nova_mensagem' || type === 'mensagem_chat') && pedidoId && activeChatId.current === pedidoId) return

      if (toastTimer.current) window.clearTimeout(toastTimer.current)
      setForegroundToast({
        title,
        body,
        url: readPushUrl(data.url),
        icon: data.icon || '/icons/corre-aqui-192.png',
        actionLabel: data.actionLabel || 'Abrir',
        eventId: safePushEventId(data.eventId),
      })
      toastTimer.current = window.setTimeout(() => setForegroundToast(null), 9000)
    }).then((off) => {
      if (!active) {
        off?.()
        return
      }
      unsubscribe = off || (() => {})
    })

    return () => {
      active = false
      unsubscribe()
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    }
  }, [])

  const closeToast = () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setForegroundToast(null)
  }

  const closePushPrompt = () => {
    savePromptDismissedAt(currentUid.current)
    setPushPrompt(null)
    setPushPromptError('')
  }

  const activateContextualPush = async () => {
    const uid = currentUid.current
    if (!uid || ativandoPush) return
    try {
      setAtivandoPush(true)
      setPushPromptError('')
      await ativarPushNotifications(uid)
      setPushPrompt(null)
    } catch (error) {
      setPushPromptError(error?.message || 'Nao foi possivel ativar as notificacoes agora.')
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        savePromptDismissedAt(uid)
      }
    } finally {
      setAtivandoPush(false)
    }
  }

  return (
    <>
      <InstallAppBanner appReady={installAppReady} />

      {foregroundToast ? (
        <aside className="fixed inset-x-3 top-3 z-[100] mx-auto max-w-md rounded-[22px] border border-emerald-200 bg-white p-3 text-slate-950 shadow-[0_18px_50px_rgba(15,23,42,0.2)] sm:inset-x-auto sm:right-5 sm:top-5 sm:w-[390px]">
      <div className="flex items-start gap-3">
        <Image src={foregroundToast.icon} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-2xl border border-emerald-100 object-cover" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Corre Aqui</div>
          <div className="mt-0.5 line-clamp-1 text-sm font-black">{foregroundToast.title}</div>
          <p className="mt-0.5 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-600">{foregroundToast.body}</p>
        </div>
        <button type="button" onClick={closeToast} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-lg font-black text-slate-500" aria-label="Fechar notificacao">
          x
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          const url = foregroundToast.url
          const eventId = foregroundToast.eventId
          closeToast()
          markPushEventAsRead(currentUid.current, eventId)
          router.replace(url)
        }}
        className="mt-3 h-10 w-full rounded-xl bg-emerald-600 text-sm font-black text-white shadow-[0_10px_22px_rgba(5,150,105,0.22)] transition hover:bg-emerald-700 active:scale-[0.98]"
      >
        {foregroundToast.actionLabel}
      </button>
        </aside>
      ) : null}

      {pushPrompt ? (
        <aside
          role="dialog"
          aria-modal="true"
          aria-labelledby="push-context-title"
          className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[100001] mx-auto max-w-md rounded-[22px] border border-blue-100 bg-white p-4 text-slate-950 shadow-[0_22px_65px_rgba(15,23,42,0.24)] sm:bottom-6 sm:right-6 sm:left-auto sm:w-[390px]"
        >
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-600 text-xl text-white" aria-hidden="true">
              &#128276;
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="push-context-title" className="text-base font-black text-slate-950">Ative as notificacoes</h2>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
                Fique sabendo quando alguem aceitar seu pedido, enviar mensagem ou solicitar um agendamento.
              </p>
            </div>
          </div>
          {pushPromptError ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{pushPromptError}</p> : null}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={closePushPrompt} className="h-11 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700">
              Agora nao
            </button>
            <button type="button" onClick={activateContextualPush} disabled={ativandoPush} className="h-11 rounded-xl bg-blue-600 px-3 text-sm font-black text-white disabled:opacity-60">
              {ativandoPush ? 'Ativando...' : 'Ativar notificacoes'}
            </button>
          </div>
        </aside>
      ) : null}
    </>
  )
}
