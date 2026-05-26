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
  'mt-1 w-full rounded-xl border border-white/10 bg-white/[0.065] px-3 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-blue-300/35 focus:bg-white/[0.09] focus:ring-2 focus:ring-blue-400/20 md:mt-1.5 md:rounded-2xl md:py-3'

const labelClass = 'text-[10px] uppercase tracking-[0.12em] font-black text-slate-400 md:text-[11px] md:tracking-[0.14em]'

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
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/75 px-2 py-2 text-white backdrop-blur-md md:px-4 md:py-5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
        className="relative max-h-[94dvh] w-full max-w-[460px] overflow-hidden rounded-[22px] border border-white/10 bg-[#07111f]/96 shadow-[0_28px_90px_rgba(0,0,0,0.58)] md:max-h-[92dvh] md:rounded-[32px] md:shadow-[0_30px_110px_rgba(0,0,0,0.62)]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(124,58,237,0.24),transparent_36%),radial-gradient(circle_at_88%_16%,rgba(37,99,235,0.20),transparent_34%)]" />

        <div className="relative border-b border-white/10 bg-white/[0.035] px-3 py-3 md:px-5 md:py-5">
          <div className="flex items-start justify-between gap-3 md:gap-4">
            <div className="min-w-0">
              <div className="inline-flex rounded-full border border-violet-200/20 bg-violet-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-100 md:px-3 md:text-[11px] md:tracking-[0.14em]">
                📅 Agenda inteligente
              </div>

              <h2 className="mt-2 text-xl font-black leading-tight tracking-tight text-white md:mt-3 md:text-2xl">
                Agendar serviço
              </h2>

              <p className="mt-0.5 truncate text-xs font-semibold text-slate-300 md:mt-1 md:text-sm">
                com {profissionalNome}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.07] text-base font-black text-white/80 transition hover:bg-white/[0.12] md:h-11 md:w-11 md:rounded-2xl md:text-lg"
              aria-label="Fechar agenda"
            >
              x
            </button>
          </div>
        </div>

        <div className="relative max-h-[calc(94dvh-96px)] overflow-y-auto p-3 md:max-h-[calc(92dvh-128px)] md:p-5">
          <div className="grid grid-cols-2 gap-2 md:gap-3">
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

          <label className="mt-2.5 block md:mt-3">
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

          <label className="mt-2.5 block md:mt-3">
            <span className={labelClass}>Detalhes do serviço</span>
            <textarea
              rows={3}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: preciso instalar uma torneira..."
              className={`${inputClass} resize-none font-semibold leading-snug md:leading-relaxed`}
            />
          </label>

          <label className="mt-2.5 block md:mt-3">
            <span className={labelClass}>Valor opcional</span>
            <div className="mt-1 flex items-center rounded-xl border border-white/10 bg-white/[0.065] px-3 transition focus-within:border-emerald-300/35 focus-within:ring-2 focus-within:ring-emerald-400/20 md:mt-1.5 md:rounded-2xl">
              <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-xs font-black text-emerald-200 md:py-1 md:text-sm">
                R$
              </span>
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="120"
                inputMode="decimal"
                className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-sm font-bold text-white outline-none placeholder:text-slate-500 md:py-3"
              />
            </div>
          </label>

          <div className="mt-3 rounded-[16px] border border-white/10 bg-white/[0.045] p-2.5 text-[11px] leading-snug text-slate-400 md:mt-4 md:rounded-[22px] md:p-3 md:text-xs md:leading-relaxed">
            A solicitação fica pendente até o profissional aceitar ou recusar.
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            disabled={salvando}
            onClick={enviar}
            className="mt-3 w-full rounded-[16px] bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 px-4 py-3 text-sm font-black text-white shadow-[0_16px_40px_rgba(79,70,229,0.3)] transition disabled:cursor-not-allowed disabled:opacity-65 md:mt-4 md:rounded-[22px] md:py-4 md:shadow-[0_18px_46px_rgba(79,70,229,0.32)]"
          >
            {salvando ? 'Enviando...' : 'Solicitar agendamento'}
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}
