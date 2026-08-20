'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ref, onValue, update } from '@/lib/firebaseDebug'
import { motion } from 'framer-motion'
import { database } from '@/lib/firebase'
import LogoCorreAqui from '@/components/LogoCorreAqui'
import { ATENDIMENTO_STATUS, normalizeAtendimentoStatus } from '@/lib/atendimento'
import { conversationTimestampMs, normalizeAndSortConversations } from '@/lib/conversations'

function timeShort(ts) {
  const ms = conversationTimestampMs(ts)
  if (!ms) return ''

  const d = new Date(ms)
  const now = new Date()
  const ontem = new Date()
  ontem.setDate(now.getDate() - 1)

  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const toInt = (v, fallback) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

function getStatusConversa(c) {
  return normalizeAtendimentoStatus(c?.pedidoStatus || c?.statusPedido || c?.atendimentoStatus || c?.status)
}

function statusMeta(c) {
  const s = getStatusConversa(c)
  if ([ATENDIMENTO_STATUS.EM_ANDAMENTO, ATENDIMENTO_STATUS.CHEGOU, ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO].includes(s)) {
    return { label: 'Em atendimento', tone: 'border-emerald-400/25 bg-emerald-500/12 text-emerald-300', dot: 'bg-emerald-400', active: true }
  }
  if (s === ATENDIMENTO_STATUS.ACEITO) {
    return { label: 'Aguardando início', tone: 'border-yellow-300/25 bg-yellow-400/10 text-yellow-200', dot: 'bg-yellow-300', active: true }
  }
  if (s === ATENDIMENTO_STATUS.FINALIZADO) {
    return { label: 'Concluído', tone: 'border-blue-400/25 bg-blue-500/10 text-blue-200', dot: 'bg-blue-400', archived: true }
  }
  if (s === 'avaliado') {
    return { label: 'Avaliado', tone: 'border-purple-400/25 bg-purple-500/10 text-purple-200', dot: 'bg-purple-400', archived: true }
  }
  if (s === 'cancelado') {
    return { label: 'Cancelado', tone: 'border-slate-400/20 bg-slate-500/10 text-slate-300', dot: 'bg-slate-400', archived: true }
  }
  if (s === 'arquivavel' || s === 'arquivada') {
    return { label: 'Histórico', tone: 'border-slate-400/20 bg-slate-500/10 text-slate-300', dot: 'bg-slate-400', archived: true }
  }
  return { label: 'Ativa', tone: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200', dot: 'bg-emerald-400', active: true }
}

function safeAvatarUrl(value) {
  const url = String(value || '').trim()
  return /^https?:\/\/[^\s]+$/i.test(url) && url.length <= 2048 ? url : ''
}

export default function ListaConversas({
  meuId,
  onAbrirChat,
  limit = 60,
  logoUrl,
}) {
  const [conversas, setConversas] = useState([])
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todas')

  useEffect(() => {
    if (!meuId) {
      setConversas([])
      return undefined
    }

    const lim = clamp(toInt(limit, 60), 20, 200)
    // RTDB cannot order by a coalesced timestamp. Read the user's private index,
    // deduplicate legacy mirrors, then apply the limit after the canonical sort.
    const cRef = ref(database, `conversas/${meuId}`)

    const off = onValue(cRef, (snap) => {
      setConversas(normalizeAndSortConversations(snap.val() || {}, lim))
    })

    return () => off()
  }, [meuId, limit])

  const totalNaoLidas = useMemo(() => {
    return (conversas || []).reduce((acc, c) => acc + (c?.unread === true ? 1 : 0), 0)
  }, [conversas])

  const conversasComIndex = useMemo(() => {
    return (conversas || []).map((c) => {
      const titulo = String(c?.titulo || '')
      const preview = String(c?.lastText || c?.mensagemPreview || '')
      const otherNome = String(c?.outroNome || c?.otherNome || '')
      const meta = statusMeta(c)
      return {
        ...c,
        preview,
        pessoa: otherNome || 'Participante',
        _status: getStatusConversa(c),
        _statusMeta: meta,
        _idx: `${titulo} ${preview} ${otherNome} ${c?.categoriaNome || ''}`.toLowerCase(),
      }
    })
  }, [conversas])

  const totais = useMemo(() => {
    return conversasComIndex.reduce(
      (acc, c) => {
        acc.todas += 1
        if (c?._statusMeta?.active) acc.ativas += 1
        if (c?._statusMeta?.archived) acc.arquivadas += 1
        return acc
      },
      { todas: 0, ativas: 0, arquivadas: 0 }
    )
  }, [conversasComIndex])

  const conversasFiltradas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const porStatus = conversasComIndex.filter((c) => {
      if (filtro === 'ativas') return c?._statusMeta?.active === true
      if (filtro === 'arquivadas') return c?._statusMeta?.archived === true
      return true
    })
    if (!t) return porStatus
    return porStatus.filter((c) => c._idx.includes(t))
  }, [conversasComIndex, busca, filtro])

  const marcarLidaOptimista = useCallback(
    (pedidoId) => {
      if (!pedidoId) return

      setConversas((prev) => {
        const arr = prev || []
        let changed = false
        const next = arr.map((c) => {
          if (c.pedidoId === pedidoId && c.unread === true) {
            changed = true
            return { ...c, unread: false }
          }
          return c
        })
        return changed ? next : arr
      })

      if (!meuId) return
      update(ref(database, `conversas/${meuId}/${pedidoId}`), {
        unread: false,
        abertoEm: Date.now(),
      }).catch(() => {})
    },
    [meuId]
  )

  return (
    <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#050b14] text-white shadow-[0_26px_80px_rgba(0,0,0,0.35)] md:rounded-[32px]">
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.20),transparent_34%),linear-gradient(135deg,#07111f,#081827)] px-3 py-3 md:px-4 md:py-4">
        <div className="flex items-center justify-between gap-2.5 md:gap-3.5">
          <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
            <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] shadow-[0_14px_34px_rgba(0,0,0,0.22)] md:h-14 md:w-14">
              <LogoCorreAqui
                className="h-9 w-9 rounded-xl border-0 shadow-none md:h-11 md:w-11 md:rounded-2xl"
                imageClassName={logoUrl ? '' : ''}
              />
              {totalNaoLidas > 0 ? (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white ring-2 ring-[#07111f]">
                  {Math.min(totalNaoLidas, 9)}
                </span>
              ) : null}
            </div>

            <div className="min-w-0 leading-tight">
              <div className="text-base font-black text-white md:text-lg">Conversas</div>
              <div className="mt-0.5 truncate text-[11px] font-semibold text-slate-400 md:mt-1 md:text-xs">
                Atendimentos ativos e histórico salvo
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
            <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black text-emerald-200 md:text-[11px]">
              {totais.ativas} ativas
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-black text-slate-300 md:text-[11px]">
              {conversasFiltradas.length}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-2xl border border-white/10 bg-black/18 p-1">
          {[
            ['todas', 'Todas', totais.todas],
            ['ativas', 'Ativas', totais.ativas],
            ['arquivadas', 'Arquivadas', totais.arquivadas],
          ].map(([id, label, count]) => {
            const active = filtro === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFiltro(id)}
                className={[
                  'min-w-0 rounded-xl px-2 py-2 text-[11px] font-black transition active:scale-[0.98] md:text-xs',
                  active
                    ? 'bg-emerald-500 text-white shadow-[0_10px_28px_rgba(34,197,94,0.20)]'
                    : 'text-slate-400 hover:bg-white/[0.06] hover:text-white',
                ].join(' ')}
              >
                <span className="truncate">{label}</span>
                <span className={active ? 'ml-1 text-white/75' : 'ml-1 text-slate-500'}>{count}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-2 md:mt-3">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar atendimento..."
            className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs font-bold text-white outline-none placeholder:text-slate-500 focus:ring-4 focus:ring-blue-400/15 md:h-12 md:rounded-2xl md:px-4 md:text-sm"
          />
        </div>
      </div>

      <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto bg-[#050b14] p-2 md:max-h-[calc(100dvh-15rem)] md:p-3">
        {conversasFiltradas.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/12 bg-white/[0.04] p-5 text-slate-300">
            <div className="font-black text-white">Nenhuma conversa aqui</div>
            <div className="mt-1 text-sm leading-relaxed text-slate-400">
              Depois de aceitar e iniciar um atendimento, a conversa aparece nesta lista.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {conversasFiltradas.map((c, index) => {
              const hora = timeShort(c._timestampMs)
              const titulo = c.titulo || 'Atendimento'
              const preview = String(c.preview || '').trim()
              const pessoa = c.pessoa || 'Participante'
              const enviadaPorMim = c.lastById && meuId && String(c.lastById) === String(meuId)
              const meta = c._statusMeta || statusMeta(c)
              const avatarUrl = safeAvatarUrl(c?.outroFotoURL || c?.outroPhotoURL || c?.outroFoto || c?.photoURL)
              const inicial = pessoa.slice(0, 1).toUpperCase() || 'C'

              return (
                <motion.button
                  key={c.pedidoId}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.26, delay: Math.min(index * 0.035, 0.22), ease: 'easeOut' }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => {
                    marcarLidaOptimista(c.pedidoId)
                    onAbrirChat?.(c.pedidoId)
                  }}
                  className={[
                    'w-full rounded-[17px] border px-2.5 py-2.5 text-left transition-all duration-200 md:rounded-[20px] md:px-3 md:py-3',
                    c.unread
                      ? 'border-emerald-400/35 bg-emerald-500/10 shadow-[0_14px_42px_rgba(34,197,94,0.12)]'
                      : 'border-white/10 bg-white/[0.045] hover:bg-white/[0.07]',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-2.5 md:gap-3">
                    <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-cyan-300/25 bg-gradient-to-br from-blue-600 to-emerald-500 text-sm font-black text-white shadow-[0_10px_24px_rgba(37,99,235,0.20)] md:h-12 md:w-12 md:text-base">
                        {avatarUrl ? (
                          <span
                            className="h-full w-full bg-cover bg-center"
                            style={{ backgroundImage: `url(${JSON.stringify(avatarUrl)})` }}
                            aria-hidden="true"
                          />
                        ) : inicial}
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="truncate text-sm font-black text-white md:text-base">{pessoa}</div>
                          {c.unread ? (
                            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-emerald-500 px-1 text-[10px] font-black text-white">
                              {Number(c.unreadCount || 1)}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] font-bold text-slate-400 md:text-xs">
                          {titulo}
                        </div>
                        <div className="mt-1 truncate text-xs font-semibold leading-snug text-slate-300 md:text-sm">
                          {preview ? (
                            <>
                              {enviadaPorMim ? <span className="text-slate-500">Você: </span> : null}
                              {preview}
                            </>
                          ) : (
                            <span className="text-slate-500">Sem mensagens ainda</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-[10px] font-bold text-slate-500 md:text-[11px]">{hora}</div>
                      <span className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.06em] ${meta.tone}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </div>
                  </div>

                </motion.button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
