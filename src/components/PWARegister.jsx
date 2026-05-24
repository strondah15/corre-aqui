'use client'

import { useEffect } from 'react'
import { getServiceWorkerRegistration } from '@/lib/pushClient'

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

  return null
}
