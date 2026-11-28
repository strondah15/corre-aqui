const CHAT_ORIGINS = new Set(['cliente', 'corre', 'agenda', 'inbox'])

export function normalizeChatOrigin(value, fallback = 'cliente') {
  const origin = String(value || '').trim().toLowerCase()
  if (CHAT_ORIGINS.has(origin)) return origin

  const safeFallback = String(fallback || '').trim().toLowerCase()
  return CHAT_ORIGINS.has(safeFallback) ? safeFallback : 'cliente'
}

export function getChatOriginFromContext({ explicit, pathname, mode, tab, fallback = 'cliente' } = {}) {
  const explicitOrigin = String(explicit || '').trim().toLowerCase()
  if (CHAT_ORIGINS.has(explicitOrigin)) return explicitOrigin

  const route = String(pathname || '').trim().toLowerCase()
  if (route.startsWith('/corre/agenda')) return 'agenda'
  if (route.startsWith('/corre/inbox')) return 'inbox'
  if (route.startsWith('/corre')) return 'corre'
  if (route.startsWith('/cliente')) return 'cliente'

  const currentMode = String(mode || '').trim().toLowerCase()
  const currentTab = String(tab || '').trim().toLowerCase()
  if (currentMode === 'corre' && currentTab === 'agenda') return 'agenda'
  if (currentMode === 'corre' && currentTab === 'inbox') return 'inbox'
  if (currentMode === 'cliente' || currentMode === 'corre') return currentMode

  return normalizeChatOrigin(fallback)
}

export function getChatReturnHref(origin) {
  const normalized = normalizeChatOrigin(origin)
  if (normalized === 'agenda') return '/corre/agenda'
  if (normalized === 'inbox') return '/corre/inbox'
  return `/${normalized}`
}

export function createChatHref(requestId, origin, extraParams = {}) {
  const id = String(requestId || '').trim()
  if (!id) return ''

  const params = new URLSearchParams({ voltar: normalizeChatOrigin(origin) })
  Object.entries(extraParams).forEach(([key, value]) => {
    if (value == null || value === false || value === '') return
    params.set(key, value === true ? '1' : String(value))
  })

  return `/chat/${encodeURIComponent(id)}?${params.toString()}`
}

export function prefetchChatRoute(router, seenDestinations, requestId, origin) {
  const href = createChatHref(requestId, origin)
  if (!href || typeof router?.prefetch !== 'function') return href
  if (!seenDestinations || typeof seenDestinations.has !== 'function' || typeof seenDestinations.add !== 'function') return href
  if (seenDestinations.has(href)) return href

  seenDestinations.add(href)
  try {
    const pending = router.prefetch(href)
    pending?.catch?.(() => seenDestinations.delete(href))
  } catch {
    seenDestinations.delete(href)
  }
  return href
}
