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
      className="relative overflow-hidden rounded-[20px] border border-white/10 bg-[#071120]/90 p-3 shadow-[0_18px_55px_rgba(0,0,0,0.28)] md:rounded-[30px] md:p-5 md:shadow-[0_22px_70px_rgba(0,0,0,0.3)]"
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${visual.cor}`} />

      <div className="flex items-start justify-between gap-3 md:gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 md:text-xs md:tracking-[0.18em]">
            {tipo === 'prof' ? 'Trilha profissional' : 'Trilha Corre'}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 md:mt-2 md:gap-2">
            <Patente tipo={tipo} nivel={nivel} />
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-black text-slate-300 md:px-3 md:text-xs">
              {servicos} serviço{servicos === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <motion.div
          animate={bloqueado ? {} : { rotate: [0, -4, 4, 0], scale: [1, 1.04, 1] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${visual.cor} text-xl shadow-[0_16px_38px_rgba(0,0,0,0.26)] md:h-14 md:w-14 md:rounded-2xl md:text-2xl md:shadow-[0_18px_45px_rgba(0,0,0,0.28)]`}
        >
          {tipo === 'prof' ? '💎' : '⚡'}
        </motion.div>
      </div>

      <div className="mt-3 md:mt-5">
        <div className="flex items-center justify-between gap-3 text-xs md:text-sm">
          <span className="font-black text-white">{bloqueado ? 'Ative o modo profissional' : `${atual} → ${prox}`}</span>
          <span className="font-black text-cyan-200">{bloqueado ? '0%' : `${progresso}%`}</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10 md:mt-3 md:h-3">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: bloqueado ? '0%' : `${progresso}%` }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className={`h-full rounded-full bg-gradient-to-r ${visual.cor}`}
          />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-400 md:mt-3 md:text-xs md:leading-relaxed">
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
        'relative overflow-hidden rounded-[18px] border p-3 transition-all md:rounded-[26px] md:p-4',
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
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 md:text-[11px] md:tracking-[0.2em]">Nível {nivel}</div>
          <h3 className="mt-1 text-base font-black text-white md:text-lg">{nome}</h3>
          <div className="mt-1 text-xs font-bold text-slate-500">
            {SERVICOS_POR_NIVEL[nivel]}+ serviços
          </div>
        </div>

        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${visual.cor} text-lg shadow-[0_14px_34px_rgba(0,0,0,0.23)] md:h-12 md:w-12 md:rounded-2xl md:text-xl md:shadow-[0_16px_40px_rgba(0,0,0,0.25)]`}>
          {visual.icon}
        </div>
      </div>

      <div className="mt-3 space-y-1.5 md:mt-4 md:space-y-2">
        {beneficios.map((b) => (
          <div key={b} className="flex items-center gap-2 text-xs text-slate-300 md:text-sm">
            <span className={desbloqueada ? 'text-emerald-300' : 'text-slate-600'}>✓</span>
            <span>{b}</span>
          </div>
        ))}
      </div>

      {ativa ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-400/10 px-3 py-1.5 text-xs font-black text-cyan-100 md:mt-4 md:rounded-2xl md:py-2 md:text-sm"
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
    <div className="mt-3 space-y-3 md:mt-5 md:space-y-5">
      <section className="relative overflow-hidden rounded-[22px] border border-cyan-400/10 bg-[#071120]/92 p-3 shadow-[0_22px_65px_rgba(0,0,0,.32)] backdrop-blur-2xl md:rounded-[34px] md:p-5 md:shadow-[0_25px_80px_rgba(0,0,0,.34)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-white md:text-3xl">Minhas patentes</h2>
            <p className="mt-1.5 max-w-2xl text-xs leading-snug text-slate-300 md:mt-2 md:text-sm md:leading-relaxed">
              A patente sobe quando serviços são concluídos. XP e moedas continuam como recompensa de atividade diária.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center md:rounded-2xl md:px-4 md:py-3">
              <div className="text-base font-black text-white md:text-lg">{xp}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">XP</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center md:rounded-2xl md:px-4 md:py-3">
              <div className="text-base font-black text-white md:text-lg">{moedas}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Moedas</div>
            </div>
            <div className="col-span-2 rounded-xl border border-cyan-300/15 bg-cyan-400/10 px-3 py-2 text-center sm:col-span-1 md:rounded-2xl md:px-4 md:py-3">
              <div className="text-base font-black text-cyan-100 md:text-lg">{servicosCorre + servicosProf}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300/80">Concluídos</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2 md:gap-4">
        <ProgressCard tipo="corre" servicos={servicosCorre} isProfissional={isProfissional} />
        <ProgressCard tipo="prof" servicos={servicosProf} isProfissional={isProfissional} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 md:gap-5">
        <div className="space-y-2.5 md:space-y-3">
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

        <div className="space-y-2.5 md:space-y-3">
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
