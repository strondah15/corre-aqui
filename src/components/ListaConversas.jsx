'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { ref, onValue, update, query, limitToLast } from 'firebase/database'
import { database } from '@/lib/firebase'

function timeShort(ts) {
  if (!ts) return ''
  try {
    const d = new Date(Number(ts))
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const toInt = (v, fallback) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

export default function ListaConversas({
  meuId,
  logoSrc = '/logo.png', onAbrirChat, limit = 60, logoUrl }) {
  const [conversas, setConversas] = useState([])
  const [busca, setBusca] = useState('')

  useEffect(() => {
    if (!meuId) {
      setConversas([])
      return
    }

    const lim = clamp(toInt(limit, 60), 20, 200)

    // ✅ pega só as últimas N conversas (bem mais leve)
    const cRef = query(ref(database, `conversas/${meuId}`), limitToLast(lim))

    const off = onValue(cRef, (snap) => {
      const raw = snap.val() || {}

      const list = Object.entries(raw).map(([pedidoId, c]) => ({
        pedidoId,
        ...(c || {}),
      }))

      list.sort((a, b) => Number(b.lastAt || 0) - Number(a.lastAt || 0))
      setConversas(list)
    })

    return () => off()
  }, [meuId, limit])

  const totalNaoLidas = useMemo(() => {
    return (conversas || []).reduce((acc, c) => acc + (c?.unread === true ? 1 : 0), 0)
  }, [conversas])

  // ✅ pré-normaliza campos pra busca ficar mais leve
  const conversasComIndex = useMemo(() => {
    return (conversas || []).map((c) => {
      const titulo = String(c?.titulo || '')
      const lastText = String(c?.lastText || '')
      const otherNome = String(c?.otherNome || '')
      return {
        ...c,
        _idx: `${titulo} ${lastText} ${otherNome}`.toLowerCase(),
      }
    })
  }, [conversas])

  const conversasFiltradas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return conversasComIndex
    return conversasComIndex.filter((c) => c._idx.includes(t))
  }, [conversasComIndex, busca])

  // ✅ marca como lida: UI responde instantâneo + manda pro Firebase
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
      update(ref(database, `conversas/${meuId}/${pedidoId}`), { unread: false }).catch(() => {})
    },
    [meuId]
  )

  const glass = 'bg-[#0f172a] border border-slate-700 shadow-2xl shadow-black/40'

  return (
    <div className={`rounded-[1.8rem] overflow-hidden ${glass}`}>
      {/* header */}
      <div className="px-4 py-4 border-b border-slate-600 bg-[#1e293b]">
        <div className="flex items-center justify-between gap-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0f172a] border border-slate-600 text-white flex items-center justify-center font-bold text-sm overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                "CA"
              )}
            </div>

            <div className="leading-tight">
              <div className="text-sm font-semibold text-white">💬 Inbox</div>
              <div className="text-xs text-slate-400">Suas conversas recentes</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-[11px] px-2 py-1 rounded-full bg-[#0f172a] border border-slate-600 text-slate-200">
              {conversasFiltradas.length} chats
            </div>

            <div
              className={`text-[11px] px-2 py-1 rounded-full border ${
                totalNaoLidas > 0
                  ? 'bg-amber-400/15 border-amber-400/25 text-amber-200'
                  : 'bg-[#1e293b] border-slate-700 text-slate-200'
              }`}
              title="Conversas não lidas"
            >
              {totalNaoLidas > 0 ? `● ${totalNaoLidas} novas` : '0 novas'}
            </div>
          </div>
        </div>

        {/* ✅ busca */}
        <div className="mt-3">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="🔍 Buscar conversa..."
            className="w-full px-3 py-3 rounded-2xl bg-[#0f172a] border border-slate-600 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
      </div>

      {/* conteúdo */}
      <div className="p-3">
        {conversasFiltradas.length === 0 && (
          <div className="rounded-2xl p-4 bg-[#0f172a] border border-slate-600 text-slate-200">
            <div className="font-semibold text-white">Ainda nada por aqui</div>
            <div className="text-xs text-slate-400 mt-1">
              Abra um pedido e mande uma mensagem pra iniciar uma conversa.
            </div>
          </div>
        )}

        {conversasFiltradas.length > 0 && (
          <div className="space-y-2">
            {conversasFiltradas.map((c) => {
              const hora = timeShort(c.lastAt)
              const titulo = c.titulo || 'Conversa'
              const preview = String(c.lastText || '').trim()
              const other = c.otherNome ? `com ${c.otherNome}` : null

              return (
                <button
                  key={c.pedidoId}
                  type="button"
                  onClick={() => {
                    marcarLidaOptimista(c.pedidoId)
                    onAbrirChat?.(c.pedidoId)
                  }}
                  className={[
                    'w-full text-left rounded-2xl border px-3 py-3 transition-all duration-200 hover:-translate-y-0.5',
                    'active:scale-[0.98]',
                    'hover:bg-[#263449]',
                    c.unread ? 'border-amber-400/25 bg-amber-400/15' : 'border-slate-700 bg-[#1e293b]',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-white truncate">{titulo}</div>

                        {c.unread ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 border border-amber-400/25">
                            novo
                          </span>
                        ) : null}
                      </div>

                      <div className="text-[11px] text-slate-400 mt-0.5">{other ? other : '—'}</div>
                    </div>

                    <div className="text-[11px] text-slate-400 shrink-0">{hora}</div>
                  </div>

                  <div className="mt-2 text-xs text-slate-200">
                    {preview ? (
                      <span className="block overflow-hidden text-ellipsis whitespace-nowrap">{preview}</span>
                    ) : (
                      <span className="text-slate-500">sem mensagens</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

