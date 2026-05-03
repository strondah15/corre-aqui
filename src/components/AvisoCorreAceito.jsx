'use client'

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

    const ok = await pedirPermissaoNotificacao()
    if (!ok) return false

    new Notification(title, {
      body,
      tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
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
    gain.gain.value = 0.035
    gain.connect(ctx.destination)

    const play = (freq, start, duration) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + duration)
    }

    play(740, 0, 0.12)
    play(980, 0.16, 0.18)

    setTimeout(() => ctx.close?.(), 700)
  } catch {}
}

function vibrarAceite() {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([120, 60, 180])
    }
  } catch {}
}

import { useEffect, useMemo, useState } from 'react'

export default function AvisoCorreAceito({
  meuId,
  corres = [],
  onAbrirChat,
  onVerMapa,
  showToast,
}) {
  const [fechados, setFechados] = useState({})
  const [ultimoToast, setUltimoToast] = useState('')

  const pedidoAceito = useMemo(() => {
    if (!meuId) return null
    if (!Array.isArray(corres)) return null

    const lista = corres.filter((p) => {
      const marker = `${p?.id || ''}:${p?.aceite?.id || ''}`

      return (
        p?.criador?.id === meuId &&
        String(p?.status || '').toLowerCase() === 'aceito' &&
        !!p?.aceite?.id &&
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
  }, [corres, meuId, fechados])

  useEffect(() => {
    if (!pedidoAceito) return

    const marker = `${pedidoAceito.id}:${pedidoAceito?.aceite?.id || ''}`
    if (ultimoToast === marker) return

    setUltimoToast(marker)

    if (typeof showToast === 'function') {
      const horarioAceite = formatDataHora(
        pedidoAceito?.aceite?.aceitoEm ||
          pedidoAceito?.aceitoEm ||
          pedidoAceito?.atualizadoEm
      )

      showToast({
        type: 'success',
        title: 'Seu corre foi aceito! 🚀',
        message: `${pedidoAceito?.aceite?.nome || 'Alguém'} aceitou "${pedidoAceito?.titulo || 'seu pedido'}" · ${horarioAceite}.`,
      })

      tocarAlertaAceite()
      vibrarAceite()

      notificarNoTelefone({
        title: 'Seu corre foi aceito! 🚀',
        body: `${pedidoAceito?.aceite?.nome || 'Alguém'} aceitou: ${pedidoAceito?.titulo || 'Corre aqui'} · ${horarioAceite}`,
        tag: `corre-aceito-${pedidoAceito?.id || marker}`,
      })
    }
  }, [pedidoAceito, ultimoToast, showToast])

  if (!pedidoAceito) return null

  const marker = `${pedidoAceito.id}:${pedidoAceito?.aceite?.id || ''}`
  const horarioAceite = formatDataHora(
    pedidoAceito?.aceite?.aceitoEm ||
      pedidoAceito?.aceitoEm ||
      pedidoAceito?.atualizadoEm
  )

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[9999] w-[92%] max-w-md">
      <div className="rounded-2xl p-4 bg-emerald-500/15 border border-emerald-400/20 backdrop-blur-md shadow-xl shadow-black/30">
        <div className="text-sm font-bold text-emerald-100">
          🚀 Seu corre foi aceito
        </div>

        <div className="text-sm text-emerald-50 mt-1">
          <b>{pedidoAceito?.aceite?.nome || 'Alguém'}</b> aceitou:
          {' '}
          <span className="text-white">
            {pedidoAceito?.titulo || 'Seu pedido'}
          </span>
        </div>

        <div className="mt-1 text-xs text-emerald-100/80">
          🕒 {horarioAceite}
        </div>

        <div className="mt-3 flex gap-2 flex-wrap">
          <button
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition active:scale-[0.98]"
            onClick={() => onAbrirChat?.(pedidoAceito)}
            type="button"
          >
            Abrir conversa
          </button>

          <button
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-sm transition active:scale-[0.98]"
            onClick={() => onVerMapa?.(pedidoAceito)}
            type="button"
          >
            Ver no mapa
          </button>

          <button
            className="px-3 py-2 rounded-xl bg-black/20 hover:bg-black/30 border border-white/10 text-white text-sm transition active:scale-[0.98]"
            onClick={() =>
              setFechados((prev) => ({
                ...prev,
                [marker]: true,
              }))
            }
            type="button"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}