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
  const active = unread ? 'shadow-[0_16px_46px_rgba(37,99,235,0.14)]' : ''
  if (tone === 'emerald') return `border-emerald-200 bg-emerald-50 ${active}`
  if (tone === 'blue') return `border-blue-200 bg-blue-50 ${active}`
  if (tone === 'sky') return `border-sky-200 bg-sky-50 ${active}`
  if (tone === 'amber') return `border-yellow-200 bg-yellow-50 ${active}`
  if (tone === 'rose') return `border-rose-200 bg-rose-50 ${active}`
  return `border-slate-200 bg-white ${active}`
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
    <div className="overflow-hidden rounded-[24px] border border-blue-100 bg-white text-slate-950 shadow-[0_18px_55px_rgba(37,99,235,0.12)] md:rounded-[32px]">
      <div className="border-b border-blue-100 bg-[linear-gradient(135deg,#eef8ff_0%,#ffffff_58%,#fff6bf_100%)] px-3 py-3 md:px-4 md:py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 md:text-[11px] md:tracking-[0.18em]">Central</div>
            <div className="mt-0.5 text-lg font-black text-blue-950 md:mt-1 md:text-xl">Notificações</div>
            <div className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-slate-600 md:mt-1 md:text-xs">
              Aceites, mensagens, conclusões, avaliações e alertas importantes.
            </div>
          </div>
          <button
            type="button"
            onClick={marcarTodas}
            disabled={naoLidas === 0}
            className="shrink-0 rounded-xl border border-blue-100 bg-white px-2.5 py-1.5 text-[11px] font-black text-blue-800 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-45 md:rounded-2xl md:px-3 md:py-2 md:text-xs"
          >
            Marcar lidas
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5 md:mt-4 md:gap-2">
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
                'h-9 rounded-xl border text-[11px] font-black transition active:scale-[0.98] md:h-10 md:rounded-2xl md:text-xs',
                filtro === id
                  ? 'border-blue-600 bg-blue-700 text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)]'
                  : 'border-blue-100 bg-white text-slate-700 hover:bg-blue-50',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto bg-slate-50 p-2 md:max-h-[calc(100dvh-15rem)] md:p-3">
        {filtradas.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-blue-200 bg-white p-5 text-center">
            <div className="text-lg font-black text-blue-950">Tudo em dia</div>
            <div className="mt-1 text-sm leading-relaxed text-slate-600">
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
                  className={`rounded-[18px] border p-2.5 md:rounded-[22px] md:p-3 ${toneClass(info.tone, unread)}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-blue-100 bg-white text-base shadow-sm md:h-11 md:w-11 md:rounded-2xl md:text-lg">
                      {info.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-blue-100 bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-blue-800">
                          {info.label}
                        </span>
                        {unread ? (
                          <span className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_18px_rgba(59,130,246,0.7)]" />
                        ) : null}
                      </div>
                      <div className="mt-1 truncate text-sm font-black text-blue-950">
                        {n?.titulo || 'Nova notificação'}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs font-semibold leading-snug text-slate-700 md:text-sm md:leading-relaxed">
                        {n?.mensagem || 'Você tem uma atualização no Corre Aqui.'}
                      </div>
                      <div className="mt-2 text-[11px] font-bold text-slate-500">{formatData(n?.criadoEm || n?.createdAt)}</div>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1.5 md:mt-3 md:gap-2">
                    <button
                      type="button"
                      onClick={() => abrir(n)}
                      className="rounded-xl bg-blue-700 px-3 py-1.5 text-xs font-black text-white shadow-[0_10px_22px_rgba(37,99,235,0.18)] transition hover:bg-blue-800 active:scale-[0.98] md:rounded-2xl md:py-2"
                    >
                      Abrir
                    </button>
                    {unread ? (
                      <button
                        type="button"
                        onClick={() => marcarLida(n)}
                        className="rounded-xl border border-blue-100 bg-white px-3 py-1.5 text-xs font-black text-blue-800 transition hover:bg-blue-50 md:rounded-2xl md:py-2"
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
