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
  const beneficios = tipo === 'prof' ? BENEFICIOS_PRO : BENEFICIOS_CORRE
  const proximosBeneficios = proximo
    ? (beneficios[nivel + 1] || []).slice(0, 2)
    : (beneficios[nivel] || []).slice(0, 2)

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative overflow-hidden rounded-[20px] border border-white/10 bg-[#071120]/90 p-3 shadow-[0_18px_55px_rgba(0,0,0,0.28)] md:rounded-[28px] md:p-4 md:shadow-[0_22px_70px_rgba(0,0,0,0.3)]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-300 to-yellow-300" />
      <div className={`pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${visual.cor} opacity-20 blur-3xl`} />

      <div className="relative flex items-start justify-between gap-3 md:gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 md:text-xs md:tracking-[0.18em]">
            {tipo === 'prof' ? 'Trilha profissional' : 'Trilha Corre'}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 md:gap-2">
            <Patente tipo={tipo} nivel={nivel} size="sm" />
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-black text-slate-300 md:px-3 md:text-xs">
              {servicos} serviço{servicos === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <motion.div
          animate={bloqueado ? {} : { rotate: [0, -4, 4, 0], scale: [1, 1.04, 1] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${visual.cor} text-xl shadow-[0_16px_38px_rgba(0,0,0,0.26)] md:h-12 md:w-12 md:rounded-2xl md:text-2xl md:shadow-[0_18px_45px_rgba(0,0,0,0.28)]`}
        >
          {tipo === 'prof' ? '💎' : '⚡'}
        </motion.div>
      </div>

      <div className="relative mt-3 md:mt-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Evolução</div>
            <div className="mt-0.5 line-clamp-1 text-sm font-black text-white md:text-base">
              {bloqueado ? 'Ative o modo profissional' : `${atual} → ${prox}`}
            </div>
          </div>
          <motion.div
            key={`${tipo}-${progresso}-${bloqueado}`}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="shrink-0 rounded-2xl border border-yellow-300/30 bg-yellow-300 px-3 py-1.5 text-base font-black text-blue-950 shadow-[0_10px_26px_rgba(250,204,21,0.2)] md:text-lg"
          >
            {bloqueado ? '0%' : `${progresso}%`}
          </motion.div>
        </div>

        <div className="mt-2.5 h-3 overflow-hidden rounded-full border border-white/10 bg-white/10 shadow-inner md:h-3.5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: bloqueado ? '0%' : `${progresso}%` }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-300 to-yellow-300 shadow-[0_0_24px_rgba(34,211,238,0.35)]"
          />
        </div>

        <p className="mt-2 text-[11px] leading-snug text-slate-400 md:text-xs md:leading-relaxed">
          {bloqueado
            ? 'A trilha profissional começa quando você ativa seu currículo profissional.'
            : proximo
              ? `Faltam ${faltam} serviço${faltam === 1 ? '' : 's'} concluído${faltam === 1 ? '' : 's'} para a próxima patente.`
              : 'Você chegou na patente máxima desta trilha.'}
        </p>

        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-yellow-200">
            Próximo desbloqueio
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(bloqueado ? ['Ficha profissional', 'Agenda aberta'] : proximosBeneficios).map((beneficio, index) => (
              <span
                key={`${beneficio}-${index}`}
                className="rounded-full border border-blue-300/20 bg-blue-400/10 px-2.5 py-1 text-[11px] font-black text-blue-100"
              >
                {index === 0 ? '🏅' : '⭐'} {beneficio}
              </span>
            ))}
          </div>
        </div>
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
      initial={{ opacity: 0, y: 10, scale: ativa ? 0.96 : 1 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        boxShadow: ativa
          ? [
              '0 0 0 rgba(34,211,238,0)',
              '0 0 44px rgba(34,211,238,0.22)',
              '0 0 24px rgba(250,204,21,0.12)',
            ]
          : '0 12px 28px rgba(0,0,0,0.18)',
      }}
      whileHover={{ y: -2 }}
      transition={{
        layout: { type: 'spring', stiffness: 220, damping: 22 },
        default: { type: 'tween', duration: 0.42, ease: 'easeOut' },
        boxShadow: { type: 'tween', duration: 1.1, ease: 'easeInOut' },
      }}
      className={[
        'relative overflow-hidden rounded-[16px] border p-2.5 text-white transition-all md:rounded-[20px] md:p-3',
        ativa
          ? 'border-yellow-300/70 bg-[linear-gradient(135deg,#06162b_0%,#09233a_48%,#172038_100%)] ring-2 ring-cyan-300/25'
          : desbloqueada
            ? 'border-blue-200/12 bg-[linear-gradient(135deg,#071120_0%,#0b1c2f_56%,#0f172a_100%)]'
            : 'border-slate-300/10 bg-[linear-gradient(135deg,#111827_0%,#172033_100%)] opacity-75',
      ].join(' ')}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${desbloqueada ? 'from-blue-500 via-cyan-300 to-yellow-300' : visual.cor} ${desbloqueada ? 'opacity-100' : 'opacity-35'}`} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_92%_18%,rgba(56,189,248,0.14),transparent_28%)]" />
      {ativa ? (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-yellow-300/25 blur-2xl"
          animate={{ opacity: [0.35, 0.8, 0.35], scale: [0.95, 1.18, 0.95] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : null}

      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-100/70 md:text-[11px] md:tracking-[0.2em]">
              Nível {nivel}
            </span>
            {ativa ? (
              <motion.span
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="rounded-full border border-yellow-200 bg-yellow-300 px-2 py-0.5 text-[9px] font-black text-blue-950 shadow-[0_0_18px_rgba(250,204,21,0.28)]"
              >
                ATUAL
              </motion.span>
            ) : null}
          </div>
          <h3 className="mt-0.5 truncate text-sm font-black text-white md:text-base">{nome}</h3>
          <div className="mt-0.5 text-[11px] font-bold text-blue-100/62">
            {SERVICOS_POR_NIVEL[nivel]}+ serviços
          </div>
        </div>

        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${visual.cor} text-base shadow-[0_14px_34px_rgba(0,0,0,0.23)] md:h-10 md:w-10 md:text-lg md:shadow-[0_16px_40px_rgba(0,0,0,0.25)]`}>
          {visual.icon}
        </div>
      </div>

      <div className="relative mt-2 flex flex-wrap gap-1.5">
        {beneficios.map((b) => (
          <div
            key={b}
            className={[
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black md:text-[11px]',
              desbloqueada
                ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
                : 'border-white/8 bg-white/[0.03] text-slate-400',
            ].join(' ')}
          >
            <span className={desbloqueada ? 'text-emerald-300' : 'text-slate-500'}>✓</span>
            <span>{b}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

export default function PainelPatentes({ accountStats = {}, serviceStats = {}, isProfissional = false }) {
  const servicosCorre = getServicos(accountStats, serviceStats, 'corre')
  const servicosProf = getServicos(accountStats, serviceStats, 'prof')
  const nivelCorreAtual = Math.max(
    toNumber(accountStats?.patenteCorre) || 1,
    calcularPatentePorServicos(servicosCorre)
  )
  const nivelProAtual = isProfissional
    ? Math.max(toNumber(accountStats?.patenteProf) || 1, calcularPatentePorServicos(servicosProf))
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

      <div className="grid gap-3 lg:grid-cols-2 md:gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-cyan-300/10 bg-[#071120] px-3 py-2 shadow-[0_14px_34px_rgba(15,23,42,0.12)]">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Patentes Corre</div>
            <div className="rounded-full bg-white/[0.08] px-2 py-1 text-[10px] font-black text-slate-200">N{nivelCorreAtual}/5</div>
          </div>
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

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-yellow-300/10 bg-[#071120] px-3 py-2 shadow-[0_14px_34px_rgba(15,23,42,0.12)]">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-yellow-300">Patentes Profissional</div>
            <div className="rounded-full bg-white/[0.08] px-2 py-1 text-[10px] font-black text-slate-200">
              {isProfissional ? `N${nivelProAtual}/5` : 'Bloqueada'}
            </div>
          </div>
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
