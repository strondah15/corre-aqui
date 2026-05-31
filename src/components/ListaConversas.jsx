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
    <div className="overflow-hidden rounded-[24px] border border-blue-100 bg-white shadow-[0_18px_55px_rgba(37,99,235,0.12)] md:rounded-[32px]">
      <div className="border-b border-blue-100 bg-[linear-gradient(135deg,#eef8ff_0%,#ffffff_58%,#fff6bf_100%)] px-3 py-3 md:px-4 md:py-4">
        <div className="flex items-center justify-between gap-2.5 md:gap-3.5">
          <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
            <LogoCorreAqui
              className="h-10 w-10 rounded-xl border-0 shadow-none md:h-14 md:w-14 md:rounded-2xl"
              imageClassName={logoUrl ? '' : ''}
            />

            <div className="min-w-0 leading-tight">
              <div className="text-sm font-black text-blue-950 md:text-base">Conversas</div>
              <div className="mt-0.5 truncate text-[11px] font-semibold text-slate-600 md:mt-1 md:text-xs">Pedidos aceitos e histórico rápido</div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
            <div className="rounded-full border border-blue-100 bg-white px-2 py-0.5 text-[10px] font-black text-blue-800 shadow-sm md:px-2.5 md:py-1 md:text-[11px]">
              {conversasFiltradas.length}
            </div>
            <div
              className={[
                'rounded-full border px-2 py-0.5 text-[10px] font-black md:px-2.5 md:py-1 md:text-[11px]',
                totalNaoLidas > 0
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-blue-100 bg-white text-slate-600',
              ].join(' ')}
              title="Conversas não lidas"
            >
              {totalNaoLidas > 0 ? `${totalNaoLidas} novas` : '0 novas'}
            </div>
          </div>
        </div>

        <div className="mt-2 md:mt-3">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por pedido, pessoa ou mensagem..."
            className="h-10 w-full rounded-xl border border-blue-100 bg-white px-3 text-xs font-bold text-slate-950 outline-none placeholder:text-slate-400 focus:ring-4 focus:ring-blue-400/15 md:h-12 md:rounded-2xl md:px-4 md:text-sm"
          />
        </div>
      </div>

      <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto bg-slate-50 p-2 md:max-h-[calc(100dvh-15rem)] md:p-3">
        {conversasFiltradas.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-blue-200 bg-white p-5 text-slate-700">
            <div className="font-black text-blue-950">Nenhuma conversa ainda</div>
            <div className="mt-1 text-sm leading-relaxed text-slate-600">
              Quando alguém aceitar um pedido ou responder no chat, a conversa aparece aqui.
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 md:space-y-2">
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
                    'w-full rounded-[18px] border px-2.5 py-2.5 text-left transition-all duration-200 md:rounded-[22px] md:px-3 md:py-3',
                    c.unread
                      ? 'border-blue-200 bg-blue-50 shadow-[0_14px_42px_rgba(37,99,235,0.14)]'
                      : 'border-slate-200 bg-white hover:bg-blue-50',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2.5 md:gap-3">
                    <div className="flex min-w-0 items-start gap-2.5 md:gap-3">
                      <div className={c.unread ? 'mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500 shadow-[0_0_18px_rgba(59,130,246,0.7)] md:h-2.5 md:w-2.5' : 'mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-300 md:h-2.5 md:w-2.5'} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-black text-blue-950 md:text-base">{titulo}</div>
                          {c.unread ? (
                            <span className="rounded-full bg-blue-700 px-2 py-0.5 text-[10px] font-black text-white">
                              novo
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] font-bold text-slate-500">
                          {pessoa}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-[10px] font-bold text-slate-500 md:text-[11px]">{hora}</div>
                  </div>

                  <div className="mt-1.5 line-clamp-2 pl-4 text-xs font-semibold leading-snug text-slate-700 md:mt-2 md:pl-5 md:text-sm md:leading-relaxed">
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
