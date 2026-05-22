'use client'

import { useEffect } from 'react'

const STYLE_ID = 'corre-aqui-hide-next-dev-indicator-mobile'

function applyMobileHideStyle() {
  const portals = Array.from(document.querySelectorAll('nextjs-portal'))

  portals.forEach((portal) => {
    const root = portal.shadowRoot
    if (!root || root.getElementById(STYLE_ID)) return

    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      @media (max-width: 767px) {
        #data-devtools-indicator,
        .dev-tools-indicator-menu {
          display: none !important;
          pointer-events: none !important;
        }
      }
    `
    root.appendChild(style)
  })
}

export default function HideNextDevIndicatorMobile() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    if (typeof window === 'undefined') return

    applyMobileHideStyle()

    const observer = new MutationObserver(() => applyMobileHideStyle())
    observer.observe(document.body, { childList: true, subtree: true })

    const timer = window.setInterval(applyMobileHideStyle, 1000)
    return () => {
      observer.disconnect()
      window.clearInterval(timer)
    }
  }, [])

  return null
}
