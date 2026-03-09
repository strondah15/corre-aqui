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

  const glass = 'bg-white/10 backdrop-blur-md border border-white/10 shadow-xl shadow-black/30'

  return (
    <div className={`rounded-2xl overflow-hidden ${glass}`}>
      {/* header */}
      <div className="px-4 py-3 border-b border-white/10 bg-white/5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-white/10 border border-white/10 text-white flex items-center justify-center font-bold text-sm overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                "CA"
              )}
            </div>

            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-100">💬 Inbox</div>
              <div className="text-xs text-gray-400">Suas conversas recentes</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-[11px] px-2 py-1 rounded-full bg-white/10 border border-white/10 text-gray-200">
              {conversasFiltradas.length} chats
            </div>

            <div
              className={`text-[11px] px-2 py-1 rounded-full border ${
                totalNaoLidas > 0
                  ? 'bg-amber-400/15 border-amber-400/25 text-amber-200'
                  : 'bg-white/10 border-white/10 text-gray-200'
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
            className="w-full px-3 py-2 rounded-2xl bg-white/10 border border-white/10 text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
      </div>

      {/* conteúdo */}
      <div className="p-3">
        {conversasFiltradas.length === 0 && (
          <div className="rounded-2xl p-4 bg-white/5 border border-white/10 text-gray-200">
            <div className="font-semibold text-gray-100">Ainda nada por aqui</div>
            <div className="text-xs text-gray-400 mt-1">
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
                    'w-full text-left rounded-2xl border px-3 py-3 transition',
                    'active:scale-[0.99]',
                    'hover:bg-white/5',
                    c.unread ? 'border-amber-400/25 bg-amber-400/10' : 'border-white/10 bg-white/5',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-gray-100 truncate">{titulo}</div>

                        {c.unread ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 border border-amber-400/25">
                            novo
                          </span>
                        ) : null}
                      </div>

                      <div className="text-[11px] text-gray-400 mt-0.5">{other ? other : '—'}</div>
                    </div>

                    <div className="text-[11px] text-gray-400 shrink-0">{hora}</div>
                  </div>

                  <div className="mt-2 text-xs text-gray-200">
                    {preview ? (
                      <span className="block overflow-hidden text-ellipsis whitespace-nowrap">{preview}</span>
                    ) : (
                      <span className="text-gray-500">sem mensagens</span>
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

