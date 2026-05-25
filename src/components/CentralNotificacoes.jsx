'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { database } from '@/lib/firebase'
import { limitToLast, onValue, query, ref, update } from 'firebase/database'

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

function formatData(v) {
  const ms = getMs(v)
  if (!ms) return 'agora'

  const d = new Date(ms)
  const hoje = new Date()
  const ontem = new Date()
  ontem.setDate(hoje.getDate() - 1)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  if (d.toDateString() === hoje.toDateString()) return `Hoje às ${hora}`
  if (d.toDateString() === ontem.toDateString()) return `Ontem às ${hora}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora}`
}

function tipoInfo(tipo) {
  const t = String(tipo || '').toLowerCase()
  if (t === 'mensagem_chat') return { icon: '💬', label: 'Mensagem', tone: 'blue' }
  if (t === 'corre_aceito') return { icon: '✅', label: 'Aceite', tone: 'emerald' }
  if (t === 'servico_concluido') return { icon: '🏁', label: 'Conclusão', tone: 'sky' }
  if (t === 'avaliacao_recebida') return { icon: '⭐', label: 'Avaliação', tone: 'amber' }
  if (t.includes('problema') || t.includes('denuncia')) return { icon: '🛡️', label: 'Segurança', tone: 'rose' }
  return { icon: '🔔', label: 'Aviso', tone: 'slate' }
}

function toneClass(tone, unread) {
  const active = unread ? 'shadow-[0_16px_46px_rgba(37,99,235,0.16)]' : ''
  if (tone === 'emerald') return `border-emerald-300/25 bg-emerald-500/10 ${active}`
  if (tone === 'blue') return `border-blue-300/25 bg-blue-500/10 ${active}`
  if (tone === 'sky') return `border-sky-300/25 bg-sky-500/10 ${active}`
  if (tone === 'amber') return `border-amber-300/25 bg-amber-500/10 ${active}`
  if (tone === 'rose') return `border-rose-300/25 bg-rose-500/10 ${active}`
  return `border-white/10 bg-white/[0.045] ${active}`
}

export default function CentralNotificacoes({
  meuId,
  corres = [],
  onAbrirChat,
  onAbrirPedido,
  onToast,
  limit = 80,
}) {
  const [notificacoes, setNotificacoes] = useState([])
  const [filtro, setFiltro] = useState('todas')

  useEffect(() => {
    if (!meuId) {
      setNotificacoes([])
      return
    }

    const nRef = query(ref(database, `notificacoes/${meuId}`), limitToLast(Math.max(20, Number(limit || 80))))
    const off = onValue(nRef, (snap) => {
      const raw = snap.val() || {}
      const lista = Object.entries(raw)
        .map(([id, n]) => ({ id, ...(n || {}) }))
        .sort((a, b) => getMs(b.criadoEm || b.createdAt) - getMs(a.criadoEm || a.createdAt))
      setNotificacoes(lista)
    })

    return () => off()
  }, [meuId, limit])

  const naoLidas = useMemo(() => notificacoes.filter((n) => n?.lida !== true).length, [notificacoes])

  const filtradas = useMemo(() => {
    if (filtro === 'nao_lidas') return notificacoes.filter((n) => n?.lida !== true)
    if (filtro === 'seguranca') {
      return notificacoes.filter((n) => {
        const tipo = String(n?.tipo || '').toLowerCase()
        return tipo.includes('problema') || tipo.includes('denuncia') || tipo.includes('seguranca')
      })
    }
    return notificacoes
  }, [notificacoes, filtro])

  const marcarLida = useCallback(
    async (n) => {
      if (!meuId || !n?.id || n?.lida === true) return
      await update(ref(database, `notificacoes/${meuId}/${n.id}`), {
        lida: true,
        lidaEm: Date.now(),
      }).catch(() => {})
    },
    [meuId]
  )

  const marcarTodas = async () => {
    if (!meuId || naoLidas === 0) return
    const updates = {}
    const agora = Date.now()
    notificacoes.forEach((n) => {
      if (n?.id && n?.lida !== true) {
        updates[`notificacoes/${meuId}/${n.id}/lida`] = true
        updates[`notificacoes/${meuId}/${n.id}/lidaEm`] = agora
      }
    })
    await update(ref(database), updates).catch(() => {})
  }

  const abrir = async (n) => {
    await marcarLida(n)
    const pedidoId = n?.pedidoId || n?.conversaId
    const pedido = (corres || []).find((p) => String(p?.id || '') === String(pedidoId || ''))
    const acao = String(n?.acao || '').toLowerCase()
    const tipo = String(n?.tipo || '').toLowerCase()
    const deveAbrirChat =
      acao === 'abrir_chat' ||
      tipo === 'mensagem_chat' ||
      tipo === 'corre_aceito' ||
      tipo === 'servico_concluido'

    if (!pedido) {
      if (deveAbrirChat && pedidoId) {
        onAbrirChat?.({ id: pedidoId, titulo: n?.titulo || 'Conversa do pedido' })
        return
      }
      onToast?.({ type: 'info', title: 'Pedido carregando', message: 'Abra novamente em alguns segundos.' })
      return
    }

    if (deveAbrirChat) {
      onAbrirChat?.(pedido)
      return
    }

    onAbrirPedido?.(pedido)
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#07111f] text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="border-b border-white/10 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-300">Central</div>
            <div className="mt-1 text-xl font-black">Notificações</div>
            <div className="mt-1 text-xs text-slate-400">
              Aceites, mensagens, conclusões, avaliações e alertas importantes.
            </div>
          </div>
          <button
            type="button"
            onClick={marcarTodas}
            disabled={naoLidas === 0}
            className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-200 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Marcar lidas
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ['todas', `Todas ${notificacoes.length}`],
            ['nao_lidas', `Novas ${naoLidas}`],
            ['seguranca', 'Segurança'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              className={[
                'h-10 rounded-2xl border text-xs font-black transition active:scale-[0.98]',
                filtro === id
                  ? 'border-cyan-300/35 bg-cyan-400/14 text-cyan-100'
                  : 'border-white/10 bg-white/[0.045] text-slate-300 hover:bg-white/[0.08]',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[calc(100dvh-15rem)] overflow-y-auto p-3">
        {filtradas.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/12 bg-white/[0.035] p-5 text-center">
            <div className="text-lg font-black">Tudo em dia</div>
            <div className="mt-1 text-sm leading-relaxed text-slate-400">
              Quando algo importante acontecer, aparece aqui.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtradas.map((n, index) => {
              const info = tipoInfo(n?.tipo)
              const unread = n?.lida !== true
              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: Math.min(index * 0.025, 0.18) }}
                  className={`rounded-[22px] border p-3 ${toneClass(info.tone, unread)}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.07] text-lg">
                      {info.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-300">
                          {info.label}
                        </span>
                        {unread ? (
                          <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.8)]" />
                        ) : null}
                      </div>
                      <div className="mt-1 truncate text-sm font-black text-white">
                        {n?.titulo || 'Nova notificação'}
                      </div>
                      <div className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-300">
                        {n?.mensagem || 'Você tem uma atualização no Corre Aqui.'}
                      </div>
                      <div className="mt-2 text-[11px] font-bold text-slate-500">{formatData(n?.criadoEm || n?.createdAt)}</div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => abrir(n)}
                      className="rounded-2xl bg-blue-600 px-3 py-2 text-xs font-black text-white transition hover:bg-blue-500 active:scale-[0.98]"
                    >
                      Abrir
                    </button>
                    {unread ? (
                      <button
                        type="button"
                        onClick={() => marcarLida(n)}
                        className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-200 transition hover:bg-white/[0.1]"
                      >
                        Marcar lida
                      </button>
                    ) : null}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
