'use client'

import { motion } from 'framer-motion'
import Patente, {
  SERVICOS_POR_NIVEL,
  calcularPatentePorServicos,
  getPatenteTitle,
  getPatenteVisual,
  progressoPatentePorServicos,
  proximoMarcoPatente,
} from './Patente'

const BENEFICIOS_CORRE = {
  1: ['Aceitar pedidos', 'Perfil básico', 'Histórico iniciado'],
  2: ['Selo de evolução', 'Mais confiança visual', 'Progresso visível'],
  3: ['Perfil mais forte', 'Histórico consolidado', 'Badge destacado'],
  4: ['Sinal de alta experiência', 'Ficha mais confiável', 'Animação especial'],
  5: ['Patente máxima', 'Selo raro', 'Perfil de referência'],
}

const BENEFICIOS_PRO = {
  1: ['Ficha profissional', 'Agenda aberta', 'Serviços técnicos'],
  2: ['Selo de especialista', 'Mais confiança', 'Histórico profissional'],
  3: ['Ficha mais robusta', 'Badge destacado', 'Reputação forte'],
  4: ['Referência local', 'Sinal de experiência', 'Perfil mais valorizado'],
  5: ['Patente máxima', 'Selo raro', 'Profissional de referência'],
}

function toNumber(...values) {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return 0
}

function getServicos(accountStats, serviceStats, tipo) {
  if (tipo === 'prof') {
    return Math.max(
      toNumber(accountStats?.servicosProf, accountStats?.['serviçosProf']),
      toNumber(serviceStats?.comoProfissional, serviceStats?.comoProf),
    )
  }

  return Math.max(
    toNumber(accountStats?.servicosCorre, accountStats?.['serviçosCorre']),
    toNumber(serviceStats?.comoCorre),
  )
}

function ProgressCard({ tipo, servicos, isProfissional }) {
  const nivel = calcularPatentePorServicos(servicos)
  const progresso = Math.round(progressoPatentePorServicos(servicos))
  const proximo = proximoMarcoPatente(servicos)
  const atual = getPatenteTitle(tipo, nivel)
  const prox = proximo ? getPatenteTitle(tipo, nivel + 1) : 'Máxima'
  const faltam = proximo ? Math.max(0, proximo - Number(servicos || 0)) : 0
  const visual = getPatenteVisual(tipo, nivel)
  const bloqueado = tipo === 'prof' && !isProfissional

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#071120]/90 p-5 shadow-[0_22px_70px_rgba(0,0,0,0.3)]"
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${visual.cor}`} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
            {tipo === 'prof' ? 'Trilha profissional' : 'Trilha Corre'}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Patente tipo={tipo} nivel={nivel} />
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-black text-slate-300">
              {servicos} serviço{servicos === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <motion.div
          animate={bloqueado ? {} : { rotate: [0, -4, 4, 0], scale: [1, 1.04, 1] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${visual.cor} text-2xl shadow-[0_18px_45px_rgba(0,0,0,0.28)]`}
        >
          {tipo === 'prof' ? '💎' : '⚡'}
        </motion.div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-black text-white">{bloqueado ? 'Ative o modo profissional' : `${atual} → ${prox}`}</span>
          <span className="font-black text-cyan-200">{bloqueado ? '0%' : `${progresso}%`}</span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: bloqueado ? '0%' : `${progresso}%` }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className={`h-full rounded-full bg-gradient-to-r ${visual.cor}`}
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          {bloqueado
            ? 'A trilha profissional começa quando você ativa seu currículo profissional.'
            : proximo
              ? `Faltam ${faltam} serviço${faltam === 1 ? '' : 's'} concluído${faltam === 1 ? '' : 's'} para a próxima patente.`
              : 'Você chegou na patente máxima desta trilha.'}
        </p>
      </div>
    </motion.section>
  )
}

function CardPatente({ nivel, tipo, ativa, desbloqueada }) {
  const visual = getPatenteVisual(tipo, nivel)
  const nome = getPatenteTitle(tipo, nivel)
  const beneficios = tipo === 'prof' ? BENEFICIOS_PRO[nivel] : BENEFICIOS_CORRE[nivel]

  return (
    <motion.div
      layout
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      className={[
        'relative overflow-hidden rounded-[26px] border p-4 transition-all',
        ativa
          ? 'border-cyan-300/35 bg-white/[0.07] shadow-[0_0_42px_rgba(34,211,238,0.15)]'
          : desbloqueada
            ? 'border-white/12 bg-white/[0.04]'
            : 'border-white/8 bg-white/[0.025] opacity-70',
      ].join(' ')}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${visual.cor} ${desbloqueada ? 'opacity-100' : 'opacity-35'}`} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Nível {nivel}</div>
          <h3 className="mt-1 text-lg font-black text-white">{nome}</h3>
          <div className="mt-1 text-xs font-bold text-slate-500">
            {SERVICOS_POR_NIVEL[nivel]}+ serviços
          </div>
        </div>

        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${visual.cor} text-xl shadow-[0_16px_40px_rgba(0,0,0,0.25)]`}>
          {visual.icon}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {beneficios.map((b) => (
          <div key={b} className="flex items-center gap-2 text-sm text-slate-300">
            <span className={desbloqueada ? 'text-emerald-300' : 'text-slate-600'}>✓</span>
            <span>{b}</span>
          </div>
        ))}
      </div>

      {ativa ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-400/10 px-3 py-2 text-sm font-black text-cyan-100"
        >
          Patente atual
        </motion.div>
      ) : null}
    </motion.div>
  )
}

export default function PainelPatentes({ accountStats = {}, serviceStats = {}, isProfissional = false }) {
  const servicosCorre = getServicos(accountStats, serviceStats, 'corre')
  const servicosProf = getServicos(accountStats, serviceStats, 'prof')
  const nivelCorreAtual = toNumber(accountStats?.patenteCorre) || calcularPatentePorServicos(servicosCorre)
  const nivelProAtual = isProfissional
    ? (toNumber(accountStats?.patenteProf) || calcularPatentePorServicos(servicosProf))
    : 0
  const xp = toNumber(accountStats?.xp)
  const moedas = toNumber(accountStats?.moedas)

  return (
    <div className="mt-5 space-y-5">
      <section className="relative overflow-hidden rounded-[34px] border border-cyan-400/10 bg-[#071120]/92 p-5 shadow-[0_25px_80px_rgba(0,0,0,.34)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-black text-white md:text-3xl">Minhas patentes</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
              A patente sobe quando serviços são concluídos. XP e moedas continuam como recompensa de atividade diária.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center">
              <div className="text-lg font-black text-white">{xp}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">XP</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center">
              <div className="text-lg font-black text-white">{moedas}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Moedas</div>
            </div>
            <div className="col-span-2 rounded-2xl border border-cyan-300/15 bg-cyan-400/10 px-4 py-3 text-center sm:col-span-1">
              <div className="text-lg font-black text-cyan-100">{servicosCorre + servicosProf}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300/80">Concluídos</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ProgressCard tipo="corre" servicos={servicosCorre} isProfissional={isProfissional} />
        <ProgressCard tipo="prof" servicos={servicosProf} isProfissional={isProfissional} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Patentes Corre</div>
          {[1, 2, 3, 4, 5].map((nivel) => (
            <CardPatente
              key={`corre-${nivel}`}
              nivel={nivel}
              tipo="corre"
              ativa={nivel === nivelCorreAtual}
              desbloqueada={nivel <= nivelCorreAtual}
            />
          ))}
        </div>

        <div className="space-y-3">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-yellow-300">Patentes Profissional</div>
          {[1, 2, 3, 4, 5].map((nivel) => (
            <CardPatente
              key={`prof-${nivel}`}
              nivel={nivel}
              tipo="prof"
              ativa={isProfissional && nivel === nivelProAtual}
              desbloqueada={isProfissional && nivel <= nivelProAtual}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
