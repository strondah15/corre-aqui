'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ref, push, set, serverTimestamp } from 'firebase/database'
import { database } from '@/lib/firebase'

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

const inputClass =
  'mt-1.5 w-full rounded-2xl border border-white/10 bg-white/[0.065] px-3 py-3 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-blue-300/35 focus:bg-white/[0.09] focus:ring-2 focus:ring-blue-400/20'

const labelClass = 'text-[11px] uppercase tracking-[0.14em] font-black text-slate-400'

export default function ModalAgenda({ open, onClose, profissional }) {
  const [data, setData] = useState(tomorrow())
  const [hora, setHora] = useState('09:00')
  const [duracao, setDuracao] = useState('1h')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)

  if (!open || !profissional) return null

  const profissionalId = profissional.uid || profissional.id
  const profissionalNome =
    profissional.nome ||
    profissional.profile?.nome ||
    'Profissional'

  async function enviar() {
    if (!profissionalId || salvando) return

    setSalvando(true)

    try {
      const clienteId = localStorage.getItem('meuId') || ''
      const clienteNome = localStorage.getItem('meuNome') || 'Cliente'

      const novo = push(ref(database, 'agendamentos'))

      await set(novo, {
        profissionalId,
        profissionalNome,
        clienteId,
        clienteNome,
        data,
        hora,
        duracao,
        descricao,
        valor,
        status: 'pendente',
        criadoEm: Date.now(),
        atualizadoEm: serverTimestamp(),
      })

      onClose?.()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/75 px-4 py-5 text-white backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
        className="relative max-h-[92dvh] w-full max-w-[460px] overflow-hidden rounded-[32px] border border-white/10 bg-[#07111f]/96 shadow-[0_30px_110px_rgba(0,0,0,0.62)]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(124,58,237,0.24),transparent_36%),radial-gradient(circle_at_88%_16%,rgba(37,99,235,0.20),transparent_34%)]" />

        <div className="relative border-b border-white/10 bg-white/[0.035] px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex rounded-full border border-violet-200/20 bg-violet-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-violet-100">
                📅 Agenda inteligente
              </div>

              <h2 className="mt-3 text-2xl font-black leading-tight tracking-tight text-white">
                Agendar serviço
              </h2>

              <p className="mt-1 text-sm font-semibold text-slate-300">
                com {profissionalNome}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.07] text-lg font-black text-white/80 transition hover:bg-white/[0.12]"
              aria-label="Fechar agenda"
            >
              x
            </button>
          </div>
        </div>

        <div className="relative max-h-[calc(92dvh-128px)] overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelClass}>Data</span>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className={labelClass}>Hora</span>
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <label className="mt-3 block">
            <span className={labelClass}>Duração estimada</span>
            <select
              value={duracao}
              onChange={(e) => setDuracao(e.target.value)}
              className={inputClass}
            >
              <option>1h</option>
              <option>2h</option>
              <option>4h</option>
              <option>1 dia</option>
              <option>3 dias</option>
              <option>1 semana</option>
            </select>
          </label>

          <label className="mt-3 block">
            <span className={labelClass}>Detalhes do serviço</span>
            <textarea
              rows={3}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: preciso instalar uma torneira..."
              className={`${inputClass} resize-none font-semibold leading-relaxed`}
            />
          </label>

          <label className="mt-3 block">
            <span className={labelClass}>Valor opcional</span>
            <div className="mt-1.5 flex items-center rounded-2xl border border-white/10 bg-white/[0.065] px-3 transition focus-within:border-emerald-300/35 focus-within:ring-2 focus-within:ring-emerald-400/20">
              <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-1 text-sm font-black text-emerald-200">
                R$
              </span>
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="120"
                inputMode="decimal"
                className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500"
              />
            </div>
          </label>

          <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.045] p-3 text-xs leading-relaxed text-slate-400">
            A solicitação fica pendente até o profissional aceitar ou recusar.
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            disabled={salvando}
            onClick={enviar}
            className="mt-4 w-full rounded-[22px] bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 px-4 py-4 text-sm font-black text-white shadow-[0_18px_46px_rgba(79,70,229,0.32)] transition disabled:cursor-not-allowed disabled:opacity-65"
          >
            {salvando ? 'Enviando...' : 'Solicitar agendamento'}
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}
