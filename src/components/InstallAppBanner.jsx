'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'

const DISMISSED_AT_KEY = 'correAquiInstallBannerDismissedAt'
const INSTALLED_AT_KEY = 'correAquiAppInstalledAt'
const DISMISS_COOLDOWN = 7 * 24 * 60 * 60 * 1000
const BLOCKING_UI_SELECTOR = '[aria-modal="true"], [data-tutorial-overlay], [data-install-banner-block]'
const TEST_MODE = process.env.NODE_ENV !== 'production'
  && process.env.NEXT_PUBLIC_INSTALL_BANNER_TEST_MODE === 'true'

function isStandalone() {
  if (typeof window === 'undefined') return false
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)')?.matches
      || window.navigator?.standalone,
  )
}

function getDisplayMode() {
  if (typeof window === 'undefined') return 'browser'
  if (window.matchMedia?.('(display-mode: fullscreen)')?.matches) return 'fullscreen'
  if (window.matchMedia?.('(display-mode: standalone)')?.matches) return 'standalone'
  if (window.matchMedia?.('(display-mode: minimal-ui)')?.matches) return 'minimal-ui'
  return 'browser'
}

function isIosDevice() {
  if (typeof window === 'undefined') return false
  const userAgent = window.navigator?.userAgent || ''
  const platform = window.navigator?.platform || ''
  const touchMac = platform === 'MacIntel' && window.navigator?.maxTouchPoints > 1
  return /iPad|iPhone|iPod/i.test(userAgent) || touchMac
}

function dismissedRecently() {
  try {
    const dismissedAt = Number(window.localStorage.getItem(DISMISSED_AT_KEY) || 0)
    return dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_COOLDOWN
  } catch {
    return false
  }
}

function saveTimestamp(key) {
  try {
    window.localStorage.setItem(key, String(Date.now()))
  } catch {}
}

export default function InstallAppBanner({ appReady = false }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [dismissedByCooldown, setDismissedByCooldown] = useState(false)
  const [pageReady, setPageReady] = useState(false)
  const [blockingUiOpen, setBlockingUiOpen] = useState(true)
  const [mobileViewport, setMobileViewport] = useState(false)
  const [closing, setClosing] = useState(false)
  const [installing, setInstalling] = useState(false)

  const ios = useMemo(() => isIosDevice(), [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const displayMode = window.matchMedia('(display-mode: standalone)')
    const mobileMedia = window.matchMedia('(max-width: 767px)')
    const updateEnvironment = () => {
      setInstalled(isStandalone())
      setMobileViewport(mobileMedia.matches)
    }
    const handleInstallPrompt = (event) => {
      event.preventDefault()
      setDeferredPrompt(event)
    }
    const handleInstalled = () => {
      saveTimestamp(INSTALLED_AT_KEY)
      setInstalled(true)
      setDeferredPrompt(null)
    }

    const recentlyDismissed = dismissedRecently()
    updateEnvironment()
    setDismissedByCooldown(recentlyDismissed)
    setDismissed(TEST_MODE ? false : recentlyDismissed)
    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    displayMode.addEventListener?.('change', updateEnvironment)
    mobileMedia.addEventListener?.('change', updateEnvironment)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
      displayMode.removeEventListener?.('change', updateEnvironment)
      mobileMedia.removeEventListener?.('change', updateEnvironment)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let readyTimer = null
    const markReady = () => {
      readyTimer = window.setTimeout(() => setPageReady(true), 900)
    }

    if (document.readyState === 'complete') markReady()
    else window.addEventListener('load', markReady, { once: true })

    return () => {
      window.clearTimeout(readyTimer)
      window.removeEventListener('load', markReady)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let frame = 0
    const updateBlockingState = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        setBlockingUiOpen(Boolean(document.querySelector(BLOCKING_UI_SELECTOR)))
      })
    }
    const observer = new MutationObserver(updateBlockingState)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })
    updateBlockingState()

    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    if (!TEST_MODE || typeof window === 'undefined') return undefined

    console.debug('[PWA] Install banner test mode: ON')

    window.correAquiInstallBanner = {
      reset() {
        try {
          window.localStorage.removeItem(DISMISSED_AT_KEY)
        } catch {}
        setDismissed(false)
        setClosing(false)
      },
    }

    return () => {
      delete window.correAquiInstallBanner
    }
  }, [])

  const canInstall = Boolean(deferredPrompt)
  const appCanShowBanner = appReady || TEST_MODE
  const shouldShow = appCanShowBanner
    && pageReady
    && !blockingUiOpen
    && !installed
    && !dismissed
    && (mobileViewport || TEST_MODE)
    && (canInstall || ios || TEST_MODE)

  const hiddenReason = shouldShow
    ? 'none'
    : !appCanShowBanner
      ? 'app-not-ready'
      : !pageReady
        ? 'page-not-ready'
        : blockingUiOpen
          ? 'blocking-ui-open'
          : installed
            ? 'standalone-or-installed'
            : dismissed
              ? 'dismissed-this-session-or-cooldown'
              : !mobileViewport && !TEST_MODE
                ? 'desktop'
                : !canInstall && !ios && !TEST_MODE
                  ? 'beforeinstallprompt-unavailable'
                  : 'unknown'

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return

    console.debug('[PWA-MOBILE] url', window.location.href)
    console.debug('[PWA-MOBILE] hostname', window.location.hostname)
    console.debug('[PWA-MOBILE] protocol', window.location.protocol)
    console.debug('[PWA-MOBILE] isMobile', mobileViewport)
    console.debug('[PWA-MOBILE] android', /Android/i.test(window.navigator?.userAgent || ''))
    console.debug('[PWA-MOBILE] displayMode', getDisplayMode())
    console.debug('[PWA-MOBILE] standalone', installed)
    console.debug('[PWA-MOBILE] testMode', TEST_MODE)
    console.debug('[PWA-MOBILE] beforeinstallprompt', canInstall)
    console.debug('[PWA-MOBILE] dismissedRecently', dismissedByCooldown)
    console.debug('[PWA-MOBILE] bannerVisible', shouldShow)
    console.debug('[PWA-MOBILE] hiddenReason', hiddenReason)
  }, [canInstall, dismissedByCooldown, hiddenReason, installed, mobileViewport, shouldShow])

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    console.debug(`[PWA] standalone: ${installed}`)
  }, [installed])

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    console.debug(`[PWA] beforeinstallprompt disponível: ${canInstall}`)
  }, [canInstall])

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    console.debug(`[PWA] banner visível: ${shouldShow}`)
  }, [shouldShow])

  const closeBanner = () => {
    saveTimestamp(DISMISSED_AT_KEY)
    setDismissedByCooldown(true)
    setClosing(true)
    window.setTimeout(() => setDismissed(true), 170)
  }

  const installApp = async () => {
    if (!deferredPrompt || installing) return

    try {
      setInstalling(true)
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      setDeferredPrompt(null)
      if (choice?.outcome === 'accepted') {
        saveTimestamp(INSTALLED_AT_KEY)
        setInstalled(true)
      }
    } finally {
      setInstalling(false)
    }
  }

  if (!shouldShow) return null

  return (
    <aside
      className={[
        'install-app-banner fixed inset-x-3 z-[9990] mx-auto max-w-[430px] rounded-[20px] border border-blue-400/35 bg-[#071a47] p-3 text-white shadow-[0_18px_44px_rgba(2,23,57,0.32)]',
        closing ? 'install-app-banner--closing pointer-events-none' : '',
        TEST_MODE ? '' : 'md:hidden',
      ].join(' ')}
      aria-label="Sugestão de instalação do Corre Aqui"
    >
      <button
        type="button"
        onClick={closeBanner}
        className="absolute right-1.5 top-1.5 grid h-10 w-10 place-items-center rounded-full text-xl font-bold text-blue-100 transition hover:bg-white/10 hover:text-white active:scale-95"
        aria-label="Fechar sugestão de instalação"
      >
        ×
      </button>

      <div className="flex items-center gap-3 pr-8">
        <Image
          src="/icons/corre-aqui-192.png"
          alt="Ícone do Corre Aqui"
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-[14px] border border-white/15 bg-white object-cover shadow-sm"
          priority={false}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black leading-tight text-white">Corre Aqui</div>
          <p className="mt-0.5 text-[12px] font-semibold leading-[1.35] text-blue-100">
            {ios && !canInstall
              ? 'No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.'
              : 'Instale o app para usar mais rápido no celular.'}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex min-h-10 items-center justify-end">
        {canInstall || (TEST_MODE && !ios) ? (
          <button
            type="button"
            onClick={installApp}
            disabled={installing || !canInstall}
            className="min-h-11 rounded-xl bg-[#ffd91a] px-5 text-sm font-black text-blue-950 shadow-[0_8px_20px_rgba(255,217,26,0.22)] transition hover:bg-yellow-300 active:scale-[0.97] disabled:cursor-wait disabled:opacity-65"
            aria-label="Instalar Corre Aqui"
          >
            {installing ? 'Abrindo...' : canInstall ? 'Instalar' : 'Instalação indisponível'}
          </button>
        ) : ios ? (
          <span className="rounded-full border border-blue-300/25 bg-white/10 px-3 py-1.5 text-[11px] font-black text-blue-50">
            Adicionar à Tela de Início
          </span>
        ) : null}
      </div>
    </aside>
  )
}
