'use client'

import { useEffect } from 'react'

const STYLE_ID = 'corre-aqui-hide-next-dev-indicator-mobile'
const HOST_STYLE_ID = 'corre-aqui-hide-next-dev-indicator-mobile-host'

const DEV_INDICATOR_SELECTORS = [
  '#data-devtools-indicator',
  '#nextjs-dev-tools-button',
  '[data-nextjs-devtools]',
  '[data-nextjs-dev-tools]',
  '[data-nextjs-dev-tools-button]',
  '[data-nextjs-dev-tools-indicator]',
  '.dev-tools-indicator',
  '.dev-tools-indicator-menu',
  '.nextjs-dev-tools-button',
  '.nextjs-dev-tools-indicator',
  'button[aria-label*="Next"]',
  'button[aria-label*="Dev"]',
  'button[title*="Next"]',
  'button[title*="Dev"]',
]

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
}

function hideIndicatorNodes(root) {
  if (!isMobileViewport()) return

  root.querySelectorAll(DEV_INDICATOR_SELECTORS.join(',')).forEach((el) => {
    el.style.setProperty('display', 'none', 'important')
    el.style.setProperty('visibility', 'hidden', 'important')
    el.style.setProperty('opacity', '0', 'important')
    el.style.setProperty('pointer-events', 'none', 'important')
  })

  root.querySelectorAll('button, [role="button"]').forEach((el) => {
    const label = [
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.textContent,
    ]
      .filter(Boolean)
      .join(' ')
      .trim()
      .toLowerCase()

    if (label === 'n' || label.includes('next.js') || label.includes('next dev')) {
      el.style.setProperty('display', 'none', 'important')
      el.style.setProperty('visibility', 'hidden', 'important')
      el.style.setProperty('opacity', '0', 'important')
      el.style.setProperty('pointer-events', 'none', 'important')
    }
  })
}

function applyMobileHideStyle() {
  if (!document.getElementById(HOST_STYLE_ID)) {
    const hostStyle = document.createElement('style')
    hostStyle.id = HOST_STYLE_ID
    hostStyle.textContent = `
      @media (max-width: 767px) {
        nextjs-portal {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      }
    `
    document.head.appendChild(hostStyle)
  }

  const portals = Array.from(document.querySelectorAll('nextjs-portal'))

  portals.forEach((portal) => {
    if (isMobileViewport()) {
      portal.style.setProperty('display', 'none', 'important')
      portal.style.setProperty('visibility', 'hidden', 'important')
      portal.style.setProperty('opacity', '0', 'important')
      portal.style.setProperty('pointer-events', 'none', 'important')
    } else {
      portal.style.removeProperty('display')
      portal.style.removeProperty('visibility')
      portal.style.removeProperty('opacity')
      portal.style.removeProperty('pointer-events')
    }

    const root = portal.shadowRoot
    if (!root) return

    hideIndicatorNodes(root)

    if (root.getElementById(STYLE_ID)) return

    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      @media (max-width: 767px) {
        ${DEV_INDICATOR_SELECTORS.join(',\n        ')},
        #data-devtools-indicator,
        .dev-tools-indicator-menu {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
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
