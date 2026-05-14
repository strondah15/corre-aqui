'use client'

import { useState } from 'react'
import { ref, push, set, serverTimestamp } from 'firebase/database'
import { database } from '@/lib/firebase'

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

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
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 430,
          borderRadius: 32,
          overflow: 'hidden',
          background: '#ffffff',
          boxShadow: '0 30px 90px rgba(0,0,0,0.45)',
          border: '1px solid rgba(255,255,255,0.4)',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg,#7c3aed,#4f46e5,#2563eb)',
            padding: '22px 20px',
            color: '#fff',
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  fontSize: 11,
                  fontWeight: 900,
                }}
              >
                📅 Agenda inteligente
              </div>

              <div
                style={{
                  marginTop: 14,
                  fontSize: 26,
                  fontWeight: 900,
                  lineHeight: 1,
                  color: '#fff',
                }}
              >
                Agendar serviço
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.85)',
                }}
              >
                com {profissionalNome}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: 40,
                height: 40,
                borderRadius: 18,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.14)',
                color: '#fff',
                fontWeight: 900,
                fontSize: 18,
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: 18 }}>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide font-black text-slate-500">
                Data
              </span>

              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none"
              />
            </label>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wide font-black text-slate-500">
                Hora
              </span>

              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none"
              />
            </label>
          </div>

          <div className="mt-3">
            <span className="text-[11px] uppercase tracking-wide font-black text-slate-500">
              Duração estimada
            </span>

            <select
              value={duracao}
              onChange={(e) => setDuracao(e.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none"
            >
              <option>1h</option>
              <option>2h</option>
              <option>4h</option>
              <option>1 dia</option>
              <option>3 dias</option>
              <option>1 semana</option>
            </select>
          </div>

          <div className="mt-3">
            <span className="text-[11px] uppercase tracking-wide font-black text-slate-500">
              Detalhes do serviço
            </span>

            <textarea
              rows={3}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: preciso instalar uma torneira..."
              className="mt-1.5 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none"
            />
          </div>

          <div className="mt-3">
            <span className="text-[11px] uppercase tracking-wide font-black text-slate-500">
              Valor opcional
            </span>

            <div className="mt-1.5 flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3">
              <span className="text-sm font-black text-slate-400">R$</span>

              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="120"
                className="w-full bg-transparent px-2 py-3 text-sm font-bold outline-none"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={salvando}
            onClick={enviar}
            className="mt-4 w-full rounded-[22px] bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-4 text-sm font-black text-white"
          >
            {salvando ? 'Enviando...' : 'Solicitar agendamento'}
          </button>
        </div>
      </div>
    </div>
  )
}
