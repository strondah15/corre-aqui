'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { getServiceWorkerRegistration, onForegroundPush } from '@/lib/pushClient'

function readPushUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/'
  return value
}

export default function PWARegister() {
  const router = useRouter()
  const [foregroundToast, setForegroundToast] = useState(null)
  const toastTimer = useRef(null)
  const lastPush = useRef({ key: '', at: 0 })

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
      const key = String(data.eventId || data.tag || `${data.type || data.tipo || ''}|${data.pedidoId || ''}|${body}`)
      const now = Date.now()

      if (lastPush.current.key === key && now - lastPush.current.at < 4000) return
      lastPush.current = { key, at: now }

      if (toastTimer.current) window.clearTimeout(toastTimer.current)
      setForegroundToast({
        title,
        body,
        url: readPushUrl(data.url),
        icon: data.icon || '/corre-aqui-icon-192.png',
        actionLabel: data.actionLabel || 'Abrir',
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

  return foregroundToast ? (
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
          closeToast()
          router.push(url)
        }}
        className="mt-3 h-10 w-full rounded-xl bg-emerald-600 text-sm font-black text-white shadow-[0_10px_22px_rgba(5,150,105,0.22)] transition hover:bg-emerald-700 active:scale-[0.98]"
      >
        {foregroundToast.actionLabel}
      </button>
    </aside>
  ) : null
}
