'use client'

import { useEffect } from 'react'
import { getServiceWorkerRegistration, onForegroundPush } from '@/lib/pushClient'

export default function PWARegister() {
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

    onForegroundPush(async (payload) => {
      if (Notification.permission !== 'granted') return

      const notification = payload?.notification || {}
      const data = payload?.data || {}
      const title = notification.title || data.title || 'Corre Aqui'
      const body = notification.body || data.body || data.message || ''
      const options = {
        body,
        icon: data.icon || '/corre-aqui-icon-192.png',
        badge: data.badge || '/corre-aqui-icon-192.png',
        tag: data.tag || `corre-aqui-${Date.now()}`,
        renotify: true,
        data: { url: data.url || '/' },
      }

      try {
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.ready
          await registration.showNotification(title, options)
          return
        }

        new Notification(title, options)
      } catch {}
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
    }
  }, [])

  return null
}
