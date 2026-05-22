'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ref, onValue, update, query, limitToLast } from 'firebase/database'
import { database } from '@/lib/firebase'
import { motion } from 'framer-motion'
import LogoCorreAqui from '@/components/LogoCorreAqui'

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

function timeShort(ts) {
  const ms = getMs(ts)
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

export default function ListaConversas({
  meuId,
  onAbrirChat,
  limit = 60,
  logoUrl,
}) {
  const [conversas, setConversas] = useState([])
  const [busca, setBusca] = useState('')

  useEffect(() => {
    if (!meuId) {
      setConversas([])
      return
    }

    const lim = clamp(toInt(limit, 60), 20, 200)
    const cRef = query(ref(database, `conversas/${meuId}`), limitToLast(lim))

    const off = onValue(cRef, (snap) => {
      const raw = snap.val() || {}

      const list = Object.entries(raw).map(([pedidoId, c]) => ({
        pedidoId,
        ...(c || {}),
      }))

      list.sort((a, b) => getMs(b.lastAt || b.updatedAt) - getMs(a.lastAt || a.updatedAt))
      setConversas(list)
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
      return {
        ...c,
        preview,
        pessoa: otherNome || 'Participante',
        _idx: `${titulo} ${preview} ${otherNome}`.toLowerCase(),
      }
    })
  }, [conversas])

  const conversasFiltradas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return conversasComIndex
    return conversasComIndex.filter((c) => c._idx.includes(t))
  }, [conversasComIndex, busca])

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
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#07111f] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="border-b border-white/10 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-4 py-4">
        <div className="flex items-center justify-between gap-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <LogoCorreAqui
              className="h-14 w-14 rounded-2xl border-0 shadow-none"
              imageClassName={logoUrl ? '' : ''}
            />

            <div className="min-w-0 leading-tight">
              <div className="text-base font-black text-white">Conversas</div>
              <div className="mt-1 truncate text-xs text-slate-400">Pedidos aceitos, combinados e histórico rápido</div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-black text-slate-200">
              {conversasFiltradas.length}
            </div>
            <div
              className={[
                'rounded-full border px-2.5 py-1 text-[11px] font-black',
                totalNaoLidas > 0
                  ? 'border-rose-300/30 bg-rose-500/15 text-rose-100'
                  : 'border-white/10 bg-white/[0.05] text-slate-300',
              ].join(' ')}
              title="Conversas não lidas"
            >
              {totalNaoLidas > 0 ? `${totalNaoLidas} novas` : '0 novas'}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por pedido, pessoa ou mensagem..."
            className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500/35"
          />
        </div>
      </div>

      <div className="max-h-[calc(100dvh-14rem)] overflow-y-auto p-3">
        {conversasFiltradas.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-slate-200">
            <div className="font-black text-white">Nenhuma conversa ainda</div>
            <div className="mt-1 text-sm leading-relaxed text-slate-400">
              Quando alguém aceitar um pedido ou responder no chat, a conversa aparece aqui.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {conversasFiltradas.map((c, index) => {
              const hora = timeShort(c.lastAt || c.updatedAt)
              const titulo = c.titulo || 'Conversa'
              const preview = String(c.preview || '').trim()
              const pessoa = c.pessoa || 'Participante'
              const enviadaPorMim = c.lastById && meuId && String(c.lastById) === String(meuId)

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
                    'w-full rounded-[22px] border px-3 py-3 text-left transition-all duration-200',
                    c.unread
                      ? 'border-blue-300/30 bg-blue-500/14 shadow-[0_14px_42px_rgba(37,99,235,0.16)]'
                      : 'border-white/10 bg-white/[0.045] hover:bg-white/[0.07]',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className={c.unread ? 'mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-400 shadow-[0_0_18px_rgba(96,165,250,0.8)]' : 'mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-slate-700'} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate font-black text-white">{titulo}</div>
                          {c.unread ? (
                            <span className="rounded-full bg-blue-400/15 px-2 py-0.5 text-[10px] font-black text-blue-100 ring-1 ring-blue-300/20">
                              novo
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] font-bold text-slate-500">
                          {pessoa}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-[11px] font-bold text-slate-500">{hora}</div>
                  </div>

                  <div className="mt-2 line-clamp-2 pl-5 text-sm leading-relaxed text-slate-300">
                    {preview ? (
                      <>
                        {enviadaPorMim ? <span className="text-slate-500">Você: </span> : null}
                        {preview}
                      </>
                    ) : (
                      <span className="text-slate-500">Sem mensagens ainda</span>
                    )}
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
