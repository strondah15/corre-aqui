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
        console.debug('[Corre Aqui] Service worker push nao registrou:', error?.message || error)
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
      if (Notification.permission !== 'granted') return

      const notification = payload?.notification || {}
      const data = payload?.data || {}
      const title = notification.title || data.title || 'Corre Aqui'
      const body = notification.body || data.body || data.message || ''

      try {
        new Notification(title, {
          body,
          icon: data.icon || '/corre-aqui-icon.svg',
          badge: data.badge || '/corre-aqui-icon.svg',
          tag: data.tag || `corre-aqui-${Date.now()}`,
        })
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
