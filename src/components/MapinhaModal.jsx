'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/* =========================================================
   Leaflet default icon fix (Next/SSR)
========================================================= */
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

/* =========================================================
   Fallback green marker for online users
========================================================= */
const greenIcon = new L.Icon({
  iconUrl:
    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})


/* =========================================================
   ✅ Opção 3: Ícones "neon" (Você / Destino)
========================================================= */
function getNeonDotIcon(kind = 'me') {
  const cfg =
    kind === 'dest'
      ? { label: '🎯', border: 'rgba(244,63,94,.95)', glow: 'rgba(244,63,94,.55)' } // rosa/vermelho
      : { label: '🧭', border: '', glow: '' } // azul

  const size = 34
  const html = `
    <div style="
      width:${size}px;height:${size}px;border-radius:9999px;
      display:flex;align-items:center;justify-content:center;
      border:2px solid ${cfg.border};
      background:
        radial-gradient(circle at 30% 20%, rgba(255,255,255,.28), rgba(255,255,255,0) 52%),
        rgba(0,0,0,.35);
      box-shadow:
        0 0 0 2px rgba(255,255,255,.12),
        0 0 16px ${cfg.glow},
        0 12px 26px rgba(0,0,0,.55);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      font-size:16px; line-height:1;
      filter: drop-shadow(0 6px 10px rgba(0,0,0,.55));
    ">
      ${cfg.label}
    </div>
  `
  return L.divIcon({
    className: '',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}

/* =========================================================
   Utils
========================================================= */
function isValidLoc(loc) {
  return (
    !!loc &&
    Number.isFinite(Number(loc.lat)) &&
    Number.isFinite(Number(loc.lng))
  )
}

function safeUrl(u) {
  const s = String(u || '').trim()
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) return ''
  return s
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const toInt = (v, fallback) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

/* =========================================================
   Avatar icons (LRU-ish cache)
========================================================= */
const iconCache = new Map()
const ICON_CACHE_MAX = 220

function cacheSet(key, icon) {
  if (iconCache.has(key)) iconCache.delete(key)
  iconCache.set(key, icon)
  while (iconCache.size > ICON_CACHE_MAX) {
    const firstKey = iconCache.keys().next().value
    iconCache.delete(firstKey)
  }
}

function getAvatarIcon({ fotoURL, emoji, kind }) {
  const key = `foto:${fotoURL || ''}|emoji:${emoji || ''}|kind:${kind || ''}`

  if (iconCache.has(key)) {
    const v = iconCache.get(key)
    iconCache.delete(key)
    iconCache.set(key, v)
    return v
  }

  const size = 44

  const ring =
    kind === 'profissional'
      ? 'rgba(59,130,246,.95)'
      : kind === 'corre'
      ? 'rgba(250,204,21,.95)'
      : ''

  const glow =
    kind === 'profissional'
      ? 'rgba(59,130,246,.55)'
      : kind === 'corre'
      ? 'rgba(250,204,21,.55)'
      : ''
  const html = `
    <div style="
      width:${size}px;height:${size}px;
      border-radius:9999px;
      overflow:hidden;
      border:2px solid ${ring};
      box-shadow:
        0 0 0 2px rgba(255,255,255,.14),
        0 0 18px ,
        0 14px 34px rgba(0,0,0,.55);
      background:
        radial-gradient(circle at 30% 20%, rgba(255,255,255,.22), rgba(255,255,255,0) 45%),
        rgba(0,0,0,.35);
      display:flex;align-items:center;justify-content:center;
      position:relative;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    ">
      ${
        fotoURL
          ? `<img src="${fotoURL}" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;display:block;" />`
          : `<div style="font-size:20px;line-height:1;filter:drop-shadow(0 8px 14px rgba(0,0,0,.55));">${
              emoji || '🙂'
            }</div>`
      }
      <span style="
        position:absolute;right:3px;bottom:3px;
        width:10px;height:10px;border-radius:9999px;
        background:#22c55e;
        border:2px solid rgba(255,255,255,.92);
        box-shadow:0 0 14px rgba(34,197,94,.75);
      "></span>
      <span style="
        pointer-events:none;
        position:absolute;inset:-6px;
        border-radius:9999px;
        border:1px solid rgba(56,189,248,.35);
        box-shadow:0 0 18px ${glow};
      "></span>
    </div>
  `

  const icon = L.divIcon({
    className: '',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })

  cacheSet(key, icon)
  return icon
}

/* =========================================================
   Helper: fit + invalidate map on open / changes
========================================================= */
function FitAndInvalidate({ open, start, dest, sheetHeight }) {
  const map = useMap()

  useEffect(() => {
    if (!open) return

    const t = setTimeout(() => {
      try {
        map.invalidateSize(true)

        if (start && dest) {
          const bounds = L.latLngBounds([start, dest])
          map.fitBounds(bounds, { padding: [40, 40] })
        } else if (dest) {
          map.setView(dest, 16, { animate: true })
        } else if (start) {
          map.setView(start, 16, { animate: true })
        }
      } catch {}
    }, 90)

    return () => clearTimeout(t)
  }, [open, map, start, dest, sheetHeight])

  return null
}

/* =========================================================
   Component
========================================================= */
/**
 * Props novos (opcionais):
 * - mapSettings: { mostrarOnline, aoVivo, limiteOnline }
 * - myUid: uid do usuário atual (pra esconder ele da lista online)
 */
export default function MapinhaModal({
  open,
  onClose,
  pedidoLocal,
  aceiteLocal,
  titulo = 'Mapa',
  infoExtra,
  onlineUsers = [],
  limitOnlineMarkers = 30,
  myUid = null,

  // ✅ NOVO: vem de users/{uid}/settings/mapa
  mapSettings = null,
}) {
  // mounted (evita SSR hydration com portal)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // trava scroll do body quando aberto
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const [route, setRoute] = useState([])
  const [distKm, setDistKm] = useState(null)
  const [durMin, setDurMin] = useState(null)
  const [startLocal, setStartLocal] = useState(null)
  const [loadingStart, setLoadingStart] = useState(false)

  const isMapaAoVivo = useMemo(() => !isValidLoc(pedidoLocal), [pedidoLocal])

  /* =========================
      Defaults por Settings
  ========================= */
  const defaultShowOnline = useMemo(() => {
    if (mapSettings && typeof mapSettings?.mostrarOnline === 'boolean') {
      return !!mapSettings.mostrarOnline
    }
    // se for mapa ao vivo, por padrão liga online
    return !!isMapaAoVivo
  }, [mapSettings, isMapaAoVivo])

  const defaultLiveMode = useMemo(() => {
    if (mapSettings && typeof mapSettings?.aoVivo === 'boolean') {
      return !!mapSettings.aoVivo
    }
    return !!isMapaAoVivo
  }, [mapSettings, isMapaAoVivo])

  const defaultLimitOnline = useMemo(() => {
    const fromSettings = mapSettings?.limiteOnline
    if (fromSettings != null) return clamp(toInt(fromSettings, 30), 5, 120)
    return clamp(toInt(limitOnlineMarkers, 30), 5, 120)
  }, [mapSettings, limitOnlineMarkers])

  // topo toggles
  const [showPedido, setShowPedido] = useState(true)
  const [showOnline, setShowOnline] = useState(false)
  const [liveMode, setLiveMode] = useState(false)
  const [onlineLimit, setOnlineLimit] = useState(30)

  // online freeze/live
  const frozenOnlineRef = useRef([])
  const liveTickRef = useRef(0)
  const [liveTick, setLiveTick] = useState(0)

  // bottom sheet
  const SHEET_MIN = 120
  const SHEET_MID = 290
  const [sheet, setSheet] = useState('mid')
  const [sheetHeight, setSheetHeight] = useState(SHEET_MID)

  const draggingRef = useRef(false)
  const startYRef = useRef(0)
  const startHRef = useRef(SHEET_MID)
  const sheetHeightRef = useRef(SHEET_MID)
  const sheetScrollRef = useRef(null)

  const getMaxH = () => {
    const h = typeof window !== 'undefined' ? window.innerHeight : 800
    return Math.max(360, Math.round(h * 0.74))
  }

  const snapTo = (target) => {
    const maxH = getMaxH()
    const midH = Math.min(SHEET_MID, maxH)

    if (target === 'max') {
      setSheet('max')
      setSheetHeight(maxH)
      return
    }
    if (target === 'mid') {
      setSheet('mid')
      setSheetHeight(midH)
      return
    }
    setSheet('min')
    setSheetHeight(SHEET_MIN)
  }

  useEffect(() => {
    sheetHeightRef.current = sheetHeight
  }, [sheetHeight])

  // ao abrir: reset + defaults
  useEffect(() => {
    if (!open) return

    setRoute([])
    setDistKm(null)
    setDurMin(null)
    setStartLocal(null)
    setLoadingStart(false)

    // ✅ defaults vindos das configs do perfil
    setOnlineLimit(defaultLimitOnline)

    if (isMapaAoVivo) {
      setShowPedido(false)
      setShowOnline(true)
      setLiveMode(true)
      snapTo('mid')
    } else {
      setShowPedido(true)
      setShowOnline(defaultShowOnline)
      setLiveMode(defaultLiveMode)
      snapTo('mid')
    }

    frozenOnlineRef.current = Array.isArray(onlineUsers) ? onlineUsers : []
    liveTickRef.current = 0
    setLiveTick(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    isMapaAoVivo,
    defaultShowOnline,
    defaultLiveMode,
    defaultLimitOnline,
  ])

  // resize -> resnap
  useEffect(() => {
    if (!open) return
    const onResize = () => snapTo(sheet)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sheet])

  // drag handlers
  const onDragStart = (clientY) => {
    draggingRef.current = true
    startYRef.current = clientY
    startHRef.current = sheetHeightRef.current
  }

  const onDragMove = (clientY) => {
    if (!draggingRef.current) return

    const sc = sheetScrollRef.current
    const delta = startYRef.current - clientY
    const tryingUp = delta > 0
    const tryingDown = delta < 0

    // se o conteúdo interno está rolando, deixa rolar
    if (sc) {
      const atTop = sc.scrollTop <= 0
      const atBottom =
        sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1
      if (!atTop && !atBottom) return
      if (!atTop && tryingDown) return
      if (!atBottom && tryingUp) return
    }

    const maxH = getMaxH()
    const next = Math.min(
      maxH,
      Math.max(SHEET_MIN, startHRef.current + delta)
    )
    setSheetHeight(next)
  }

  const onDragEnd = () => {
    if (!draggingRef.current) return
    draggingRef.current = false

    const maxH = getMaxH()
    const midH = Math.min(SHEET_MID, maxH)

    const candidates = [
      { k: 'min', h: SHEET_MIN },
      { k: 'mid', h: midH },
      { k: 'max', h: maxH },
    ]
    candidates.sort(
      (a, b) =>
        Math.abs(a.h - sheetHeightRef.current) -
        Math.abs(b.h - sheetHeightRef.current)
    )
    snapTo(candidates[0].k)
  }

  useEffect(() => {
    if (!open) return

    const mm = (e) => onDragMove(e.clientY)
    const mu = () => onDragEnd()
    const tm = (e) => {
      e.preventDefault()
      onDragMove(e.touches?.[0]?.clientY ?? 0)
    }
    const tu = () => onDragEnd()

    window.addEventListener('mousemove', mm)
    window.addEventListener('mouseup', mu)
    window.addEventListener('touchmove', tm, { passive: false })
    window.addEventListener('touchend', tu)

    return () => {
      window.removeEventListener('mousemove', mm)
      window.removeEventListener('mouseup', mu)
      window.removeEventListener('touchmove', tm)
      window.removeEventListener('touchend', tu)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // live timer
  useEffect(() => {
    if (!open) return
    if (!showOnline) return
    if (!liveMode) return

    const id = setInterval(() => {
      frozenOnlineRef.current = Array.isArray(onlineUsers) ? onlineUsers : []
      liveTickRef.current += 1
      setLiveTick(liveTickRef.current)
    }, 2200)

    return () => clearInterval(id)
  }, [open, showOnline, liveMode, onlineUsers])

  // freeze when liveMode off
  useEffect(() => {
    if (!open) return
    if (!showOnline) return
    if (liveMode) return

    frozenOnlineRef.current = Array.isArray(onlineUsers) ? onlineUsers : []
    liveTickRef.current += 1
    setLiveTick(liveTickRef.current)
  }, [open, showOnline, liveMode, onlineUsers])

  const pedidoOk = isValidLoc(pedidoLocal)
  const aceiteOk = isValidLoc(aceiteLocal)
  const startOk = isValidLoc(startLocal)

  const start = useMemo(() => {
    if (aceiteOk) return [Number(aceiteLocal.lat), Number(aceiteLocal.lng)]
    if (startOk) return [Number(startLocal.lat), Number(startLocal.lng)]
    return null
  }, [aceiteOk, aceiteLocal, startOk, startLocal])

  const dest = useMemo(() => {
    if (!showPedido) return null
    return pedidoOk ? [Number(pedidoLocal.lat), Number(pedidoLocal.lng)] : null
  }, [showPedido, pedidoOk, pedidoLocal])

  const center = useMemo(() => {
    if (start && dest)
      return [(start[0] + dest[0]) / 2, (start[1] + dest[1]) / 2]
    if (dest) return dest
    if (start) return start
    return [-22.9068, -43.1729] // RJ fallback
  }, [start, dest])

  // normaliza online -> markers válidos + avatar + dedupe
  const onlineMarkers = useMemo(() => {
    if (!showOnline) return []

    const source = frozenOnlineRef.current || []
    const list = Array.isArray(source) ? source : []

    let out = list
      .map((u) => {
        const loc = u?.local
        if (!isValidLoc(loc)) return null

        const uidU = u?.uid || u?.id || null
        if (myUid && uidU && String(uidU) === String(myUid)) return null

        const lat = Number(loc.lat)
        const lng = Number(loc.lng)

        const fotoURLraw =
          u?.fotoURL ||
          u?.profile?.fotoURL ||
          u?.avatarURL ||
          u?.avatar?.url ||
          ''
        const fotoURL = safeUrl(fotoURLraw)
        const avatarEmoji = String(u?.avatarEmoji || u?.avatar?.emoji || '')

        return {
          id: uidU || `${lat},${lng}`,
          nome: u?.nome || 'Online',
          lat,
          lng,
          lastSeen: Number(u?.lastSeen || 0),
          fotoURL,
          avatarEmoji,
        }
      })
      .filter(Boolean)

    // dedupe por lat/lng (evita marker em cima)
    const seen = new Set()
    out = out.filter((m) => {
      const k = `${m.lat.toFixed(5)}|${m.lng.toFixed(5)}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    out.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
    return out.slice(0, clamp(toInt(onlineLimit, 30), 5, 120))
  }, [showOnline, onlineLimit, liveTick, myUid])

  /* =========================================================
     OSRM route (only if start + dest)
  ========================================================= */
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()

    async function fetchRoute() {
      setRoute([])
      setDistKm(null)
      setDurMin(null)

      if (!start || !dest) return

      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${dest[1]},${dest[0]}?overview=full&geometries=geojson`
        const res = await fetch(url, { signal: controller.signal })
        const data = await res.json()

        const r = data?.routes?.[0]
        const coords = r?.geometry?.coordinates || []
        const latlng = coords.map(([lng, lat]) => [lat, lng])

        setRoute(latlng)
        if (typeof r?.distance === 'number') setDistKm(r.distance / 1000)
        if (typeof r?.duration === 'number') setDurMin(r.duration / 60)
      } catch (e) {
        if (e?.name === 'AbortError') return
        console.log('Falha ao buscar rota OSRM:', e)
      }
    }

    fetchRoute()
    return () => controller.abort()
  }, [open, start, dest])

  /* =========================================================
     Get user location
  ========================================================= */
  async function usarMinhaLocalizacao() {
    setLoadingStart(true)
    try {
      if (!navigator.geolocation) {
        alert('Seu navegador não suporta localização.')
        return
      }

      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setStartLocal({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            })
            resolve()
          },
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 10000 }
        )
      })
    } catch {
      alert(
        'Não consegui pegar sua localização. Verifique as permissões do navegador.'
      )
    } finally {
      setLoadingStart(false)
    }
  }

  const googleMapsUrl = useMemo(() => {
    if (!dest) return null
    if (start)
      return `https://www.google.com/maps/dir/?api=1&origin=${start[0]},${start[1]}&destination=${dest[0]},${dest[1]}&travelmode=driving`
    return `https://www.google.com/maps/search/?api=1&query=${dest[0]},${dest[1]}`
  }, [start, dest])

  if (!open || !mounted) return null

  const isDragging = draggingRef.current

  // ✅ UI estilo do seu app
  const glass =
    'bg-white/10 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/40'

  const pillBase =
    'px-3 py-2 rounded-full text-xs font-semibold border transition active:scale-[0.98] shadow'
  const pillOn = 'bg-blue-600 text-white border-blue-500/40'
  const pillOff = 'bg-white/10 text-white border-white/10 hover:bg-white/15'

  const ui = (
    <>
      {/* backdrop */}
      <div className="fixed inset-0 z-[4000] bg-black/55" />

      {/* mapa */}
      <div className="fixed inset-0 z-[4500]">
        <MapContainer
          center={center}
          zoom={15}
          className="h-full w-full"
          preferCanvas={true}
        >
          <FitAndInvalidate
            open={open}
            start={start}
            dest={dest}
            sheetHeight={sheetHeight}
          />

          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          />

          {/* ONLINE */}
          {onlineMarkers.map((m) => {
            const icon =
              m.fotoURL || m.avatarEmoji
                ? getAvatarIcon({ fotoURL: m.fotoURL, emoji: m.avatarEmoji, kind: m.isProfissional ? "profissional" : m.isCorre ? "corre" : "" })
                : greenIcon

            return (
              <Marker key={`on_${m.id}`} position={[m.lat, m.lng]} icon={icon}>
                <Popup>
                  <div className="text-sm">
                    <b>🟢 {m.nome}</b>
                    {m.lastSeen ? (
                      <div className="text-xs text-gray-600">
                        lastSeen: {new Date(m.lastSeen).toLocaleTimeString()}
                      </div>
                    ) : null}
                  </div>
                </Popup>
              </Marker>
            )
          })}

          {/* VOCÊ */}
          {start && (
            <Marker position={start} icon={getNeonDotIcon('me')}>
              <Popup>
                <div className="text-sm">
                  <b>Você</b>
                </div>
              </Popup>
            </Marker>
          )}

          {/* DESTINO */}
          {dest && (
            <Marker position={dest} icon={getNeonDotIcon('dest')}>
              <Popup>
                <div className="text-sm">
                  <b>Destino (pedido)</b>
                </div>
              </Popup>
            </Marker>
          )}

          {/* ROTA */}
          {route.length > 1 && (
            <Polyline positions={route} weight={6} opacity={0.9} />
          )}
        </MapContainer>
      </div>

      {/* topo fixo */}
      <button
        onClick={onClose}
        className={`fixed top-4 right-4 z-[9000] w-11 h-11 rounded-2xl ${glass} text-white flex items-center justify-center hover:bg-white/15 active:scale-[0.98] transition`}
        title="Fechar"
        type="button"
      >
        ✕
      </button>

      <div className="fixed top-4 left-4 z-[9000] flex flex-wrap gap-2 max-w-[78vw]">
        {!isMapaAoVivo && (
          <button
            type="button"
            className={`${pillBase} ${showPedido ? pillOn : pillOff}`}
            onClick={() => setShowPedido((v) => !v)}
            title="Mostrar/ocultar o pedido no mapa"
          >
            📍 Pedido
          </button>
        )}

        <button
          type="button"
          className={`${pillBase} ${showOnline ? pillOn : pillOff}`}
          onClick={() => setShowOnline((v) => !v)}
          title="Mostrar pessoas online"
        >
          🟢 Online
        </button>

        {showOnline && (
          <button
            type="button"
            className={`${pillBase} ${liveMode ? pillOn : pillOff}`}
            onClick={() => setLiveMode((v) => !v)}
            title="Atualizar online em tempo real (pode gastar mais dados)"
          >
            🔄 Ao vivo
          </button>
        )}

        {showOnline && (
          <div
            className={[
              glass,
              'rounded-full px-3 py-2 text-xs text-white flex items-center gap-2',
            ].join(' ')}
          >
            <span className="font-semibold">Limite:</span>
            <input
              type="range"
              min={5}
              max={80}
              value={onlineLimit}
              onChange={(e) => setOnlineLimit(Number(e.target.value))}
            />
            <span className="font-semibold w-8 text-right">{onlineLimit}</span>
          </div>
        )}
      </div>

      {/* bottom sheet */}
      <div className="fixed left-0 right-0 bottom-0 z-[8000]">
        <div
          className={[
            'mx-auto max-w-[760px] rounded-t-3xl overflow-hidden',
            glass,
          ].join(' ')}
          style={{
            height: sheetHeight,
            transition: isDragging ? 'none' : 'height 180ms ease',
          }}
        >
          {/* header / handle */}
          <div
            className="px-4 pt-3 pb-2 select-none"
            onMouseDown={(e) => onDragStart(e.clientY)}
            onTouchStart={(e) => {
              e.preventDefault()
              onDragStart(e.touches[0].clientY)
            }}
          >
            <div className="mx-auto h-1.5 w-12 rounded-full bg-white/40" />

            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-white truncate">
                📍 {titulo}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => snapTo(sheet === 'max' ? 'mid' : 'max')}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/15 border border-white/10 text-white"
                >
                  {sheet === 'max' ? '↧ Recolher' : '↥ Expandir'}
                </button>

                <button
                  type="button"
                  onClick={() => snapTo(sheet === 'min' ? 'mid' : 'min')}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/15 border border-white/10 text-white"
                >
                  {sheet === 'min' ? '▢ Detalhes' : '— Minimizar'}
                </button>
              </div>
            </div>

            <div className="mt-1 flex items-center justify-between text-xs text-white/70">
              <div>
                🟢 Online: <b className="text-white">{onlineMarkers.length}</b>{' '}
                {showOnline ? (liveMode ? '· ao vivo' : '· congelado') : '· oculto'}
              </div>

              <div className="text-right text-white/80">
                {distKm != null && <span>📏 {distKm.toFixed(2)} km </span>}
                {durMin != null && <span> · ⏱️ {Math.round(durMin)} min</span>}
                {start && dest && route.length <= 1 ? (
                  <span className="text-white/60"> · calculando…</span>
                ) : null}
              </div>
            </div>

            {(!start || !dest) && (
              <div className="mt-1 text-[11px] text-white/55">
                Sem 2 locais para rota
              </div>
            )}
          </div>

          {/* body scroll */}
          <div
            ref={sheetScrollRef}
            className="px-4 pb-4 overflow-auto"
            style={{ height: sheetHeight - 92 }}
          >
            <div className="text-xs text-white/70">
              {infoExtra?.status ? (
                <>
                  Status: <b className="text-white">{String(infoExtra.status).toUpperCase()}</b>
                </>
              ) : null}
              {infoExtra?.criador ? (
                <>
                  {' '}
                  · Criador: <b className="text-white">{infoExtra.criador}</b>
                </>
              ) : null}
              {infoExtra?.aceitador ? (
                <>
                  {' '}
                  · Aceitador: <b className="text-white">{infoExtra.aceitador}</b>
                </>
              ) : null}
            </div>

            <div className="mt-3 flex gap-2 flex-wrap">
              {!start && dest && (
                <button
                  onClick={usarMinhaLocalizacao}
                  disabled={loadingStart}
                  className="px-4 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
                  type="button"
                >
                  {loadingStart
                    ? 'Pegando localização…'
                    : 'Traçar rota usando minha localização'}
                </button>
              )}

              {googleMapsUrl && (
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white"
                >
                  Abrir no Google Maps
                </a>
              )}
            </div>

            {!dest && !isMapaAoVivo && showPedido && (
              <div className="mt-3 text-xs text-yellow-200 bg-yellow-500/10 border border-yellow-400/20 rounded-2xl px-3 py-2">
                Este pedido não tem localização salva ainda.
              </div>
            )}

            {!showPedido && !isMapaAoVivo && (
              <div className="mt-3 text-xs text-white/70 bg-white/5 border border-white/10 rounded-2xl px-3 py-2">
                Pedido oculto (você desligou no topo). Ligue em “📍 Pedido”.
              </div>
            )}

            <div className="h-10" />
          </div>
        </div>
      </div>
    </>
  )

  // ✅ Portal seguro (se não existir #modal-root, usa body)
  const getModalRoot = () => {
    if (typeof window === 'undefined') return null
    let root = document.getElementById('modal-root')
    if (!root) {
      root = document.createElement('div')
      root.id = 'modal-root'
      document.body.appendChild(root)
    }
    return root
  }

  const modalRoot = getModalRoot()
  if (!modalRoot) return null

  return createPortal(ui, modalRoot)
}
