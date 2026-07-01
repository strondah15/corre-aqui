'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { database } from '@/lib/firebase'
import { auth } from '@/lib/firebase'
import { createPrivateRequest } from '@/lib/privateRequests'

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function safeStr(value) {
  return String(value || '').trim()
}

function safeUrl(value) {
  const url = safeStr(value)
  if (!url) return ''
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(url)) return url
  return ''
}

function pickText(...values) {
  return values.map((value) => safeStr(value)).find(Boolean) || ''
}

function getAvatarUrl(profissional = {}) {
  return safeUrl(
    profissional.fotoURL ||
      profissional.avatarUrl ||
      profissional.avatarURL ||
      profissional.photoURL ||
      profissional.imageUrl ||
      profissional.profile?.fotoURL ||
      profissional.profile?.avatarUrl ||
      profissional.profile?.avatarURL ||
      profissional.profile?.photoURL ||
      profissional.profile?.imageUrl ||
      profissional.profissional?.fotoURL ||
      profissional.profissional?.photoURL ||
      ''
  )
}

function getInitials(nome) {
  const parts = safeStr(nome).split(/\s+/).filter(Boolean)
  const initials = parts.slice(0, 2).map((part) => part[0]).join('')
  return initials.toUpperCase() || 'CA'
}

function formatDateLabel(value) {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return 'Escolher data'

  const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const day = String(date.getDate()).padStart(2, '0')

  return `${weekdays[date.getDay()]}, ${day} ${months[date.getMonth()]}`
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M7 4v3M17 4v3M5 9h14M6 6h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

function IconEdit() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="m15.5 5.5 3 3M5 19l3.2-.7L18.7 7.8a2.1 2.1 0 0 0-3-3L5.2 15.3 5 19Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

function IconInfo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M12 8h.01M11 12h1v4h1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

const durationOptions = [
  { value: '30min', label: '30 min' },
  { value: '1h', label: '1 hora' },
  { value: '2h', label: '2 horas' },
  { value: '4h', label: '4 horas' },
]

const valueOptions = [
  { value: 'R$ 50', label: 'R$ 50' },
  { value: 'R$ 100', label: 'R$ 100' },
  { value: 'R$ 150', label: 'R$ 150' },
]

export default function ModalAgenda({ open, onClose, profissional, servico = null }) {
  const [data, setData] = useState(tomorrow())
  const [hora, setHora] = useState('09:00')
  const [duracao, setDuracao] = useState('1h')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)

  if (!open || !profissional) return null

  const profissionalId = profissional.uid || profissional.id
  const profissionalNome = pickText(profissional.nome, profissional.profile?.nome, 'Profissional')
  const profissao = pickText(
    servico?.titulo,
    servico?.nome,
    profissional.profTitulo,
    profissional.profile?.profTitulo,
    profissional.profissional?.profTitulo,
    profissional.correTitulo,
    profissional.corre?.titulo,
    'Profissional'
  )
  const agendaAberta =
    profissional.agendaAberta ??
    profissional.profile?.agendaAberta ??
    profissional.profissional?.agendaAberta ??
    true
  const nota = Number(
    profissional.notaMedia ||
      profissional.rating ||
      profissional.trustStats?.notaMedia ||
      profissional.trustStats?.rating ||
      profissional.profissional?.notaMedia ||
      0
  )
  const avaliacoes = Number(
    profissional.avaliacoesCount ||
      profissional.qtdAvaliacoes ||
      profissional.trustStats?.avaliacoes ||
      profissional.trustStats?.reviews ||
      profissional.profissional?.avaliacoesCount ||
      0
  )
  const avatarUrl = getAvatarUrl(profissional)
  const descricaoLength = descricao.length

  async function enviar() {
    if (!profissionalId || salvando) return

    setSalvando(true)

    try {
      const authUser = auth.currentUser
      const clienteId = authUser?.uid || localStorage.getItem('meuId') || ''
      const clienteNome = localStorage.getItem('meuNome') || authUser?.displayName || 'Cliente'

      await createPrivateRequest({
        database,
        cliente: {
          uid: clienteId,
          nome: clienteNome,
          fotoURL: authUser?.photoURL || '',
        },
        profissional: {
          ...profissional,
          uid: profissionalId,
          id: profissionalId,
          nome: profissionalNome,
        },
        servico: servico || {
          id: profissionalId,
          titulo: profissao,
          nome: profissao,
          descricao,
          valor,
        },
        tipo: 'agendamento',
        agendamento: {
          data,
          hora,
          duracao,
          descricao,
          valor,
        },
      })

      onClose?.()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/82 px-3 py-3 text-slate-950 backdrop-blur-md md:px-4 md:py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.()
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="relative flex max-h-[96dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-[24px] border border-white/70 bg-white shadow-[0_28px_90px_rgba(2,6,23,0.45)]"
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4 md:px-5 md:pt-5">
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-xl font-black text-slate-900 transition hover:bg-slate-100 active:scale-95"
            aria-label="Voltar"
          >
            ←
          </button>
          <h2 className="text-sm font-black text-slate-950 md:text-base">Agendar serviço</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-xl font-black text-slate-900 transition hover:bg-slate-100 active:scale-95"
            aria-label="Fechar agenda"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:px-5">
          <section className="rounded-[18px] border border-slate-100 bg-white p-3 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-3">
              <div
                className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-blue-50 bg-cover bg-center text-lg font-black text-blue-700 ring-4 ring-slate-100"
                style={avatarUrl ? { backgroundImage: `url(${JSON.stringify(avatarUrl)})` } : undefined}
              >
                {avatarUrl ? <span className="sr-only">{profissionalNome}</span> : getInitials(profissionalNome)}
              </div>

              <div className="min-w-0">
                <div className="truncate text-base font-black text-slate-950">{profissionalNome}</div>
                <div className="truncate text-xs font-semibold text-slate-500">{profissao}</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs font-black text-emerald-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]" />
                  {agendaAberta ? 'Disponível hoje' : 'Agenda fechada'}
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs font-bold text-slate-700">
                  <span className="text-amber-400">★</span>
                  {nota > 0 ? nota.toFixed(1) : '--'}
                  {avaliacoes > 0 ? <span className="font-semibold text-slate-500">({avaliacoes} avaliações)</span> : null}
                </div>
              </div>
            </div>
          </section>

          <section className="mt-4">
            <div className="text-sm font-black text-slate-950">Quando você precisa?</div>
            <div className="mt-2 grid grid-cols-2 gap-2.5">
              <label className="relative min-h-[88px] overflow-hidden rounded-[14px] border border-slate-200 bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                <span className="flex items-center gap-2 text-xs font-black text-blue-600">
                  <IconCalendar />
                  Data
                </span>
                <span className="mt-2 block text-[11px] font-black leading-tight text-slate-900">{formatDateLabel(data)}</span>
                <span className="absolute bottom-3 right-3 text-slate-500">⌄</span>
                <input
                  type="date"
                  value={data}
                  onChange={(event) => setData(event.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="Data do serviço"
                />
              </label>

              <label className="relative min-h-[88px] overflow-hidden rounded-[14px] border border-slate-200 bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                <span className="flex items-center gap-2 text-xs font-black text-slate-500">
                  <IconClock />
                  Horário
                </span>
                <span className="mt-2 block text-[11px] font-black leading-tight text-slate-900">{hora}</span>
                <span className="absolute bottom-3 right-3 text-slate-500">⌄</span>
                <input
                  type="time"
                  value={hora}
                  onChange={(event) => setHora(event.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="Horário do serviço"
                />
              </label>
            </div>
          </section>

          <section className="mt-4">
            <div className="text-sm font-black text-slate-950">Duração aproximada</div>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {durationOptions.map((option) => {
                const active = duracao === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDuracao(option.value)}
                    className={[
                      'h-10 shrink-0 rounded-[13px] border px-3 text-xs font-black transition active:scale-95',
                      active
                        ? 'border-blue-600 bg-blue-600 text-white shadow-[0_10px_22px_rgba(37,99,235,0.24)]'
                        : 'border-slate-200 bg-white text-slate-700',
                    ].join(' ')}
                  >
                    {option.label}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setDuracao('1 dia')}
                className={[
                  'grid h-10 w-10 shrink-0 place-items-center rounded-[13px] border text-lg font-black transition active:scale-95',
                  duracao === '1 dia'
                    ? 'border-blue-600 bg-blue-600 text-white shadow-[0_10px_22px_rgba(37,99,235,0.24)]'
                    : 'border-slate-200 bg-white text-slate-700',
                ].join(' ')}
                aria-label="Selecionar duração de um dia"
                title="1 dia"
              >
                +
              </button>
            </div>
          </section>

          <label className="mt-4 block">
            <span className="text-sm font-black text-slate-950">Descreva o serviço</span>
            <div className="mt-2 rounded-[15px] border border-slate-200 bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.07)] focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
              <textarea
                rows={4}
                maxLength={200}
                value={descricao}
                onChange={(event) => setDescricao(event.target.value)}
                placeholder="Ex: Preciso instalar uma torneira..."
                className="min-h-[88px] w-full resize-none bg-transparent text-sm font-semibold leading-relaxed text-slate-800 outline-none placeholder:text-slate-400"
              />
              <div className="text-right text-[11px] font-bold text-slate-400">{descricaoLength}/200</div>
            </div>
          </label>

          <section className="mt-4">
            <div className="text-sm font-black text-slate-950">Valor que você pretende pagar (opcional)</div>
            <div className="mt-2 flex gap-2">
              {valueOptions.map((option) => {
                const active = safeStr(valor) === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setValor(option.value)}
                    className={[
                      'h-9 flex-1 rounded-full border px-2 text-xs font-black transition active:scale-95',
                      active ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700',
                    ].join(' ')}
                  >
                    {option.label}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setValor('')}
                className="h-9 flex-1 rounded-full border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 transition active:scale-95"
              >
                Outro
              </button>
            </div>

            <label className="mt-2 flex min-h-[48px] items-center justify-between gap-3 rounded-[14px] border border-slate-200 bg-white px-3 shadow-[0_10px_24px_rgba(15,23,42,0.07)] focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
              <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-black text-blue-600">
                <span className="grid h-5 w-5 place-items-center rounded-full border border-blue-100 text-[10px]">R$</span>
                <input
                  value={valor}
                  onChange={(event) => setValor(event.target.value)}
                  placeholder="A combinar"
                  inputMode="decimal"
                  className="min-w-0 flex-1 bg-transparent font-black text-blue-600 outline-none placeholder:text-blue-400"
                  aria-label="Valor pretendido"
                />
              </span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
                Editável
                <IconEdit />
              </span>
            </label>
          </section>

          <div className="mt-4 flex items-start gap-2 rounded-[15px] border border-blue-100 bg-blue-50 px-3 py-3 text-[11px] font-semibold leading-snug text-slate-500">
            <span className="mt-0.5 text-blue-600">
              <IconInfo />
            </span>
            O profissional receberá sua solicitação e poderá aceitar ou combinar outro horário.
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            disabled={salvando || !profissionalId}
            onClick={enviar}
            className="mt-4 h-14 w-full rounded-[18px] bg-[linear-gradient(135deg,#2557ff_0%,#16bdd7_100%)] px-4 text-sm font-black text-white shadow-[0_16px_34px_rgba(37,99,235,0.34)] transition disabled:cursor-not-allowed disabled:opacity-65"
          >
            {salvando ? 'Enviando...' : 'Enviar solicitação'}
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}
