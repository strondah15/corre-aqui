
'use client'

import { useEffect, useMemo, useState } from 'react'
import { ref, onValue, update } from 'firebase/database'
import { database } from '@/lib/firebase'

export default function AgendaPanel({ uid }) {
  const [lista, setLista] = useState([])
  const [aba, setAba] = useState('pendentes')

  useEffect(() => {
    if (!uid) return

    const off = onValue(ref(database, 'agendamentos'), (snap) => {
      const raw = snap.val() || {}
      const arr = Object.entries(raw)
        .map(([id, v]) => ({ id, ...(v || {}) }))
        .filter((a) => a.profissionalId === uid)
        .sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0))

      setLista(arr)
    })

    return () => off()
  }, [uid])

  const filtrados = useMemo(() => {
    if (aba === 'todos') return lista
    if (aba === 'confirmados') return lista.filter((i) => i.status === 'aceito')
    return lista.filter((i) => (i.status || 'pendente') === 'pendente')
  }, [lista, aba])

  const responder = async (id, status) => {
    await update(ref(database, `agendamentos/${id}`), {
      status,
      atualizadoEm: Date.now(),
    })
  }

  const pendentes = lista.filter((i) => (i.status || 'pendente') === 'pendente').length

  return (
    <div className="w-full">
      <div className="flex gap-2 mb-4">
        <button onClick={() => setAba('pendentes')} className={`px-4 py-2 rounded-2xl text-sm font-black ${aba === 'pendentes' ? 'bg-blue-600 text-white' : 'bg-white/10 text-white'}`}>
          Pendentes {pendentes ? `• ${pendentes}` : ''}
        </button>

        <button onClick={() => setAba('confirmados')} className={`px-4 py-2 rounded-2xl text-sm font-black ${aba === 'confirmados' ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white'}`}>
          Confirmados
        </button>

        <button onClick={() => setAba('todos')} className={`px-4 py-2 rounded-2xl text-sm font-black ${aba === 'todos' ? 'bg-white text-slate-900' : 'bg-white/10 text-white'}`}>
          Todos
        </button>
      </div>

      <div className="space-y-3">
        {filtrados.map((item) => (
          <div key={item.id} className="rounded-[28px] border border-white/10 bg-[#07111f] p-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-black text-lg">{item.clienteNome || 'Cliente'}</div>
                <div className="text-sm text-slate-300 mt-1">
                  📅 {item.data || 'sem data'} • {item.hora || 'horário'}
                </div>
              </div>

              <div className="text-xs px-3 py-1 rounded-full bg-white/10 border border-white/10 font-black">
                {(item.status || 'pendente').toUpperCase()}
              </div>
            </div>

            <div className="mt-3 text-sm text-slate-300">
              {item.descricao || 'Sem descrição'}
            </div>

            {item.valor ? (
              <div className="mt-3 inline-flex px-3 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 text-emerald-200 text-sm font-black">
                💰 R$ {item.valor}
              </div>
            ) : null}

            {(item.status || 'pendente') === 'pendente' ? (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => responder(item.id, 'aceito')}
                  className="flex-1 rounded-2xl bg-emerald-600 py-3 font-black text-white"
                >
                  Aceitar
                </button>

                <button
                  onClick={() => responder(item.id, 'recusado')}
                  className="flex-1 rounded-2xl bg-red-500/15 border border-red-400/20 py-3 font-black text-red-200"
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
