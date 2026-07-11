'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const RECENTE_MS = 24 * 60 * 60 * 1000

function getMs(v) {
  if (!v) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const parsed = Date.parse(v)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000
  return 0
}

function formatDataHora(v) {
  const ms = getMs(v)
  if (!ms) return 'agora'

  const d = new Date(ms)
  const hoje = new Date()
  const ontem = new Date()
  ontem.setDate(hoje.getDate() - 1)

  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  if (d.toDateString() === hoje.toDateString()) return `Hoje às ${hora}`
  if (d.toDateString() === ontem.toDateString()) return `Ontem às ${hora}`

  return (
    d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }) + ` às ${hora}`
  )
}

function storageKey(meuId) {
  return `correaqui:aceites-fechados:${meuId || 'anon'}`
}

function loadFechados(meuId) {
  try {
    const raw = localStorage.getItem(storageKey(meuId))
    const arr = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function saveFechado(meuId, marker) {
  try {
    const set = loadFechados(meuId)
    set.add(marker)
    localStorage.setItem(storageKey(meuId), JSON.stringify(Array.from(set).slice(-80)))
  } catch {}
}

async function pedirPermissaoNotificacao() {
  if (typeof window === 'undefined') return false
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}

async function notificarNoTelefone({ title, body, tag }) {
  try {
    if (typeof window === 'undefined') return false
    if (!('Notification' in window)) return false
    if (Notification.permission !== 'granted') return false

    new Notification(title, {
      body,
      tag,
      icon: '/corre-aqui-icon-192.png',
      badge: '/corre-aqui-icon-192.png',
    })
    return true
  } catch {
    return false
  }
}

function tocarAlertaAceite() {
  try {
    if (typeof window === 'undefined') return
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return

    const ctx = new AudioContext()
    const gain = ctx.createGain()
    gain.gain.value = 0.03
    gain.connect(ctx.destination)

    const play = (freq, start, duration) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + duration)
    }

    play(660, 0, 0.1)
    play(880, 0.13, 0.12)
    play(1100, 0.29, 0.16)

    setTimeout(() => ctx.close?.(), 800)
  } catch {}
}

function vibrarAceite() {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([90, 45, 140])
    }
  } catch {}
}

export default function AvisoCorreAceito({
  meuId,
  corres = [],
  enabled = true,
  onAbrirChat,
  onVerMapa,
  showToast,
}) {
  const [fechados, setFechados] = useState({})
  const [ultimoToast, setUltimoToast] = useState('')
  const [permStatus, setPermStatus] = useState('default')
  const notificadosRef = useRef(new Set())

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermStatus('unsupported')
      return
    }
    setPermStatus(Notification.permission || 'default')
  }, [])

  useEffect(() => {
    notificadosRef.current = new Set()
    const set = loadFechados(meuId)
    const obj = {}
    set.forEach((marker) => {
      obj[marker] = true
    })
    setFechados(obj)
  }, [meuId])

  const pedidoAceito = useMemo(() => {
    if (!enabled) return null
    if (!meuId) return null
    if (!Array.isArray(corres)) return null

    const now = Date.now()
    const lista = corres.filter((p) => {
      const aceitoEm = getMs(p?.aceite?.aceitoEm || p?.aceitoEm || p?.atualizadoEm)
      const marker = `${p?.id || ''}:${p?.aceite?.id || ''}:${aceitoEm || ''}`

      return (
        p?.criador?.id === meuId &&
        ['aceito', 'aguardando_inicio', 'em_atendimento'].includes(String(p?.status || '').toLowerCase()) &&
        !!p?.aceite?.id &&
        aceitoEm > 0 &&
        now - aceitoEm <= RECENTE_MS &&
        !fechados[marker]
      )
    })

    if (!lista.length) return null

    lista.sort((a, b) => {
      const ta = getMs(a?.aceite?.aceitoEm || a?.aceitoEm || a?.atualizadoEm || 0)
      const tb = getMs(b?.aceite?.aceitoEm || b?.aceitoEm || b?.atualizadoEm || 0)
      return tb - ta
    })

    return lista[0]
  }, [corres, meuId, fechados, enabled])

  const markerAtual = useMemo(() => {
    if (!pedidoAceito) return ''
    const aceitoEm = getMs(pedidoAceito?.aceite?.aceitoEm || pedidoAceito?.aceitoEm || pedidoAceito?.atualizadoEm)
    return `${pedidoAceito.id}:${pedidoAceito?.aceite?.id || ''}:${aceitoEm || ''}`
  }, [pedidoAceito])

  useEffect(() => {
    if (!pedidoAceito || !markerAtual) return
    if (ultimoToast === markerAtual || notificadosRef.current.has(markerAtual)) return

    setUltimoToast(markerAtual)
    notificadosRef.current.add(markerAtual)

    const horarioAceite = formatDataHora(
      pedidoAceito?.aceite?.aceitoEm ||
        pedidoAceito?.aceitoEm ||
        pedidoAceito?.atualizadoEm
    )

    showToast?.({
      type: 'success',
      title: 'Pedido aceito',
      message: `${pedidoAceito?.aceite?.nome || 'Alguém'} aceitou "${pedidoAceito?.titulo || 'seu pedido'}" · ${horarioAceite}.`,
    })

    tocarAlertaAceite()
    vibrarAceite()

    notificarNoTelefone({
      title: 'Pedido aceito',
      body: `${pedidoAceito?.aceite?.nome || 'Alguém'} aceitou: ${pedidoAceito?.titulo || 'Corre aqui'} · ${horarioAceite}`,
      tag: `corre-aceito-${pedidoAceito?.id || markerAtual}`,
    })
  }, [pedidoAceito, markerAtual, ultimoToast, showToast])

  const fechar = () => {
    if (!markerAtual) return
    saveFechado(meuId, markerAtual)
    setFechados((prev) => ({ ...prev, [markerAtual]: true }))
  }

  const ativarAlertas = async () => {
    const ok = await pedirPermissaoNotificacao()
    setPermStatus(ok ? 'granted' : (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'))
    showToast?.({
      type: ok ? 'success' : 'info',
      title: ok ? 'Alertas ativados' : 'Alertas não ativados',
      message: ok ? 'Você receberá avisos quando houver aceite e mensagens.' : 'Seu navegador não liberou notificações agora.',
    })
  }

  if (!pedidoAceito || !markerAtual) return null

  const horarioAceite = formatDataHora(
    pedidoAceito?.aceite?.aceitoEm ||
      pedidoAceito?.aceitoEm ||
      pedidoAceito?.atualizadoEm
  )

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -22, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -16, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[99985] mx-auto w-[calc(100vw-1.5rem)] max-w-[430px] sm:top-4 md:top-24 md:left-auto md:right-7 md:mx-0 md:w-[430px]"
      >
        <div className="pointer-events-auto relative overflow-hidden rounded-[20px] border border-emerald-200 bg-white/98 p-3 text-slate-950 shadow-[0_18px_52px_rgba(15,23,42,0.18)] backdrop-blur-2xl md:rounded-[28px] md:p-4 md:shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 via-cyan-300 to-blue-500" />
          <div className="flex items-start gap-2.5 md:gap-3">
            <motion.div
              animate={{ scale: [1, 1.08, 1], rotate: [0, -4, 4, 0] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-[16px] bg-emerald-500 text-xl shadow-[0_14px_36px_rgba(16,185,129,0.26)] md:h-14 md:w-14 md:rounded-[20px] md:text-2xl md:shadow-[0_16px_45px_rgba(16,185,129,0.28)]"
            >
              ✓
            </motion.div>

            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700 md:text-[11px] md:tracking-[0.16em]">Novo aceite</div>
              <div className="mt-0.5 line-clamp-2 text-base font-black leading-tight text-slate-950 md:mt-1 md:text-lg">
                {pedidoAceito?.aceite?.nome || 'Alguém'} aceitou seu pedido
              </div>
              <div className="mt-0.5 truncate text-xs font-semibold text-slate-600 md:mt-1 md:text-sm">
                {pedidoAceito?.titulo || 'Corre aqui'}
              </div>

              <div className="mt-2 grid gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600 md:mt-3 md:gap-2 md:rounded-2xl md:p-3 md:text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-slate-500">Horário</span>
                  <b className="text-slate-800">{horarioAceite}</b>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-slate-500">Próximo passo</span>
                  <b className="text-emerald-700">Combine no chat</b>
                </div>
              </div>

              {permStatus === 'default' ? (
                <button
                  type="button"
                  onClick={ativarAlertas}
                  className="mt-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-black text-blue-700 transition hover:bg-blue-100 md:mt-3 md:text-xs"
                >
                  Ativar alertas do navegador
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={fechar}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-base font-black text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 md:h-9 md:w-9 md:rounded-2xl md:text-lg"
              aria-label="Fechar aviso"
            >
              ×
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1.5 md:mt-4 md:gap-2">
            <button
              className="h-10 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white transition hover:bg-emerald-500 active:scale-[0.98] md:h-11 md:rounded-2xl md:text-sm"
              onClick={() => {
                onAbrirChat?.(pedidoAceito)
                fechar()
              }}
              type="button"
            >
              Abrir conversa
            </button>

            <button
              className="h-10 rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-black text-slate-800 transition hover:bg-slate-200 active:scale-[0.98] md:h-11 md:rounded-2xl md:text-sm"
              onClick={() => {
                onVerMapa?.(pedidoAceito)
                fechar()
              }}
              type="button"
            >
              Ver no mapa
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
