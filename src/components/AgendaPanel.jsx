
'use client'

import { useEffect, useMemo, useState } from 'react'
import { database } from '@/lib/firebase'
import { respondLegacyAgendamento, subscribeParticipantAgendamentos } from '@/lib/agendamentos'

function toMillis(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value) || 0
  if (value && typeof value === 'object') return Number(value.seconds || value._seconds || 0) * 1000
  return 0
}

export default function AgendaPanel({ uid }) {
  const [lista, setLista] = useState([])
  const [aba, setAba] = useState('pendentes')

  useEffect(() => {
    if (!uid) return

    const off = subscribeParticipantAgendamentos({
      database,
      uid,
      onChange: (items) => {
        const arr = items
        .filter((a) => a.profissionalId === uid)
        .sort((a, b) => toMillis(b.criadoEm || b.createdAt) - toMillis(a.criadoEm || a.createdAt))

      setLista(arr)
      },
      onError: () => setLista([]),
    })

    return () => off()
  }, [uid])

  const filtrados = useMemo(() => {
    if (aba === 'todos') return lista
    if (aba === 'confirmados') return lista.filter((i) => i.status === 'aceito')
    return lista.filter((i) => (i.status || 'pendente') === 'pendente')
  }, [lista, aba])

  const responder = async (id, status) => {
    const item = lista.find((entry) => entry.id === id)
    await respondLegacyAgendamento({
      database,
      agendamento: item,
      actorUid: uid,
      status,
    })
  }

  const pendentes = lista.filter((i) => (i.status || 'pendente') === 'pendente').length
  const confirmados = lista.filter((i) => i.status === 'aceito').length

  return (
    <div className="w-full rounded-[24px] border border-white/10 bg-[#07111f]/88 p-3 text-white shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-2xl md:rounded-[30px] md:p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">Agenda</div>
          <h3 className="mt-1 text-lg font-black md:text-2xl">Solicitações</h3>
          <p className="mt-0.5 text-xs font-semibold text-slate-400">
            Acompanhe pedidos de agenda e responda rápido.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Pendentes</div>
            <div className="text-xl font-black text-yellow-200">{pendentes}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Confirmadas</div>
            <div className="text-xl font-black text-emerald-200">{confirmados}</div>
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 rounded-[18px] border border-white/10 bg-white/[0.045] p-1.5">
        <button type="button" onClick={() => setAba('pendentes')} className={`h-10 rounded-[14px] text-xs font-black transition ${aba === 'pendentes' ? 'bg-[#ffd91a] text-blue-950 shadow-[0_10px_24px_rgba(250,204,21,0.2)]' : 'text-slate-300 hover:bg-white/[0.07]'}`}>
          Pendentes
        </button>

        <button type="button" onClick={() => setAba('confirmados')} className={`h-10 rounded-[14px] text-xs font-black transition ${aba === 'confirmados' ? 'bg-emerald-500 text-white shadow-[0_10px_24px_rgba(16,185,129,0.2)]' : 'text-slate-300 hover:bg-white/[0.07]'}`}>
          Confirmados
        </button>

        <button type="button" onClick={() => setAba('todos')} className={`h-10 rounded-[14px] text-xs font-black transition ${aba === 'todos' ? 'bg-white text-slate-950 shadow-[0_10px_24px_rgba(255,255,255,0.12)]' : 'text-slate-300 hover:bg-white/[0.07]'}`}>
          Todos
        </button>
      </div>

      <div className="space-y-3">
        {!filtrados.length ? (
          <div className="rounded-[22px] border border-dashed border-white/12 bg-white/[0.04] px-4 py-6 text-center">
            <div className="text-2xl">📅</div>
            <div className="mt-2 text-sm font-black text-slate-200">Nada nesta aba.</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Novas solicitações aparecem aqui em tempo real.
            </p>
          </div>
        ) : filtrados.map((item) => (
          <div key={item.id} className="rounded-[22px] border border-white/10 bg-white/[0.055] p-3 text-white shadow-[0_12px_34px_rgba(0,0,0,0.18)] md:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-base font-black md:text-lg">{item.clienteNome || 'Cliente'}</div>
                <div className="mt-1 text-xs font-semibold text-slate-400 md:text-sm">
                  📅 {item.data || 'sem data'} • {item.hora || 'horário'}
                </div>
              </div>

              <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-200">
                {(item.status || 'pendente').toUpperCase()}
              </div>
            </div>

            <div className="mt-3 line-clamp-2 text-sm leading-relaxed text-slate-300">
              {item.descricao || 'Sem descrição'}
            </div>

            {item.valor ? (
              <div className="mt-3 inline-flex rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm font-black text-emerald-200">
                💰 R$ {item.valor}
              </div>
            ) : null}

            {(item.status || 'pendente') === 'pendente' ? (
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => responder(item.id, 'aceito')}
                  className="h-11 flex-1 rounded-2xl bg-emerald-500 text-sm font-black text-white shadow-[0_12px_28px_rgba(16,185,129,0.2)] transition hover:bg-emerald-400 active:scale-[0.98]"
                >
                  Aceitar
                </button>

                <button
                  type="button"
                  onClick={() => responder(item.id, 'recusado')}
                  className="h-11 flex-1 rounded-2xl border border-red-400/20 bg-red-500/12 text-sm font-black text-red-200 transition hover:bg-red-500/18 active:scale-[0.98]"
                >
                  Recusar
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
