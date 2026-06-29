'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import {
  SERVICOS_POR_NIVEL,
  calcularPatentePorServicos,
} from './Patente'

const LEVELS = [1, 2, 3, 4, 5]

const TRACKS = {
  corre: {
    label: 'Corre',
    tabIcon: '⚡',
    subtitle: 'Trilha Corre',
    activeTab: 'from-yellow-300 via-yellow-400 to-orange-400 text-slate-950',
    progress: 'from-blue-500 via-violet-500 to-yellow-300',
    glow: 'rgba(250,204,21,0.32)',
    names: {
      1: 'Iniciante',
      2: 'Corredor',
      3: 'Resolvedor',
      4: 'Brabo',
      5: 'Lendário',
    },
    levelIcons: {
      1: '⚡',
      2: '🏃',
      3: '⚡',
      4: '⭐',
      5: '👑',
    },
    benefits: {
      1: ['Aceitar pedidos', 'Perfil básico', 'Histórico iniciado'],
      2: ['Selo de evolução', 'Mais confiança visual', 'Progresso visível'],
      3: ['Perfil mais forte', 'Badge destacado', 'Histórico consolidado'],
      4: ['Sinal de alta experiência', 'Perfil mais confiável', 'Prioridade em buscas'],
      5: ['Patente máxima', 'Selo raro', 'Perfil de referência'],
    },
  },
  prof: {
    label: 'Profissional',
    tabIcon: '💼',
    subtitle: 'Trilha Profissional',
    activeTab: 'from-emerald-400 via-cyan-400 to-violet-500 text-white',
    progress: 'from-emerald-400 via-cyan-400 to-violet-500',
    glow: 'rgba(52,211,153,0.28)',
    names: {
      1: 'Profissional',
      2: 'Especialista',
      3: 'Mestre',
      4: 'Referência',
      5: 'Imparável',
    },
    levelIcons: {
      1: '💼',
      2: '💎',
      3: '🔮',
      4: '⭐',
      5: '🏆',
    },
    benefits: {
      1: ['Ficha profissional', 'Agenda aberta', 'Serviços técnicos'],
      2: ['Selo de especialista', 'Mais confiança', 'Histórico profissional'],
      3: ['Ficha mais robusta', 'Badge destacado', 'Reputação forte'],
      4: ['Referência local', 'Sinal de experiência', 'Perfil mais valorizado'],
      5: ['Patente máxima', 'Selo raro', 'Profissional de referência'],
    },
  },
}

const LEVEL_STYLE = {
  1: {
    hex: '#38BDF8',
    card: 'border-cyan-400/40 bg-cyan-400/8',
    locked: 'border-slate-500/25 bg-slate-700/20',
    gradient: 'from-slate-300 via-slate-500 to-slate-800',
    shadow: 'rgba(56,189,248,0.26)',
  },
  2: {
    hex: '#38B2F6',
    card: 'border-blue-400/45 bg-blue-400/8',
    locked: 'border-slate-500/25 bg-slate-700/20',
    gradient: 'from-cyan-300 via-blue-500 to-blue-800',
    shadow: 'rgba(59,130,246,0.28)',
  },
  3: {
    hex: '#A855F7',
    card: 'border-violet-400/60 bg-violet-500/10',
    locked: 'border-slate-500/25 bg-slate-700/20',
    gradient: 'from-fuchsia-300 via-violet-500 to-purple-900',
    shadow: 'rgba(168,85,247,0.42)',
  },
  4: {
    hex: '#F59E0B',
    card: 'border-yellow-400/55 bg-yellow-400/9',
    locked: 'border-slate-500/25 bg-slate-700/20',
    gradient: 'from-yellow-200 via-amber-500 to-orange-800',
    shadow: 'rgba(245,158,11,0.32)',
  },
  5: {
    hex: '#EF4444',
    card: 'border-red-400/55 bg-red-500/8',
    locked: 'border-slate-500/25 bg-slate-700/20',
    gradient: 'from-orange-300 via-red-500 to-red-900',
    shadow: 'rgba(239,68,68,0.32)',
  },
}

const STATUS_META = {
  atual: {
    label: 'Atual',
    className: 'border-violet-300/60 bg-violet-500/22 text-violet-100 shadow-[0_0_24px_rgba(168,85,247,0.28)]',
    icon: '●',
  },
  desbloqueado: {
    label: 'Desbloqueado',
    className: 'border-emerald-300/35 bg-emerald-400/16 text-emerald-100',
    icon: '✓',
  },
  bloqueado: {
    label: 'Bloqueado',
    className: 'border-slate-400/20 bg-slate-500/12 text-slate-300',
    icon: '🔒',
  },
}

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value || 0)))
}

function getFirstNumber(...values) {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return 0
}

function getServicos(accountStats = {}, serviceStats = {}, tipo = 'corre') {
  if (tipo === 'prof') {
    return getFirstNumber(
      accountStats.servicosProf,
      accountStats.servicosProfissional,
      serviceStats.servicosProf,
      serviceStats.servicosProfissional,
      serviceStats.prof,
      serviceStats.profissional,
      serviceStats.total,
    )
  }

  return getFirstNumber(
    accountStats.servicosCorre,
    accountStats.servicosRapidos,
    serviceStats.servicosCorre,
    serviceStats.servicosRapidos,
    serviceStats.corre,
    serviceStats.rapidos,
  )
}

function getStatus(level, currentLevel) {
  if (level === currentLevel) return 'atual'
  return level < currentLevel ? 'desbloqueado' : 'bloqueado'
}

function getTrackTitle(tipo, level) {
  return TRACKS[tipo]?.names?.[level] || 'Patente'
}

function getTrackIcon(tipo, level) {
  return TRACKS[tipo]?.levelIcons?.[level] || TRACKS[tipo]?.tabIcon || '★'
}

function buildTrack({ tipo, servicos, savedNivel, enabled = true }) {
  const serviceNivel = calcularPatentePorServicos(servicos)
  const nivel = Math.max(1, Math.min(5, Math.max(serviceNivel, toNumber(savedNivel, 1))))
  const nextNivel = nivel >= 5 ? null : nivel + 1
  const currentMark = SERVICOS_POR_NIVEL[nivel] || 0
  const nextMark = nextNivel ? SERVICOS_POR_NIVEL[nextNivel] : SERVICOS_POR_NIVEL[5]
  const progress = nivel >= 5
    ? 100
    : clampPercent(((servicos - currentMark) / Math.max(nextMark - currentMark, 1)) * 100)

  return {
    tipo,
    meta: TRACKS[tipo],
    servicos,
    nivel,
    title: getTrackTitle(tipo, nivel),
    nextNivel,
    nextTitle: nextNivel ? getTrackTitle(tipo, nextNivel) : 'Nível máximo',
    nextMark,
    missing: nextNivel ? Math.max(0, nextMark - servicos) : 0,
    progress,
    enabled,
  }
}

function StatusBadge({ status, compact = false }) {
  const meta = STATUS_META[status]

  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full border font-black uppercase tracking-[0.08em]',
        compact ? 'px-2 py-1 text-[9px]' : 'px-3 py-1.5 text-[10px]',
        meta.className,
      ].join(' ')}
    >
      <span>{meta.icon}</span>
      {meta.label}
    </span>
  )
}

function TrailStatusMark({ status }) {
  if (status === 'atual') {
    return (
      <span className="mt-2 rounded-full border border-violet-300/50 bg-violet-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-violet-100">
        Atual
      </span>
    )
  }

  if (status === 'desbloqueado') {
    return (
      <span className="mt-2 grid h-5 w-5 place-items-center rounded-full bg-emerald-400/20 text-[11px] font-black text-emerald-200 ring-1 ring-emerald-300/35">
        ✓
      </span>
    )
  }

  return (
    <span className="mt-2 grid h-5 w-5 place-items-center rounded-full bg-slate-500/15 text-[10px] font-black text-slate-400 ring-1 ring-slate-300/15">
      🔒
    </span>
  )
}

function Medal({ tipo, level, size = 'md', active = false, locked = false }) {
  const style = LEVEL_STYLE[level]
  const icon = getTrackIcon(tipo, level)
  const lockedTone = locked ? 'opacity-65 grayscale saturate-50' : 'opacity-100'
  const sizeClass = {
    xs: 'h-12 w-12 text-lg',
    sm: 'h-16 w-16 text-2xl',
    md: 'h-24 w-24 text-4xl',
    lg: 'h-36 w-36 text-6xl',
  }[size]
  const innerClass = {
    xs: 'h-9 w-9 rounded-xl',
    sm: 'h-12 w-12 rounded-2xl',
    md: 'h-[4.5rem] w-[4.5rem] rounded-[22px]',
    lg: 'h-28 w-28 rounded-[34px]',
  }[size]

  return (
    <div className={`relative grid ${sizeClass} shrink-0 place-items-center`}>
      <div
        className={[
          'absolute inset-0 rounded-full blur-2xl transition-opacity',
          active ? 'opacity-90' : locked ? 'opacity-22' : 'opacity-45',
          `bg-gradient-to-br ${style.gradient}`,
        ].join(' ')}
        style={{ boxShadow: `0 0 70px ${style.shadow}` }}
      />
      {active ? (
        <div className="absolute -top-3 left-1/2 flex -translate-x-1/2 gap-1 text-yellow-200 drop-shadow-[0_0_10px_rgba(250,204,21,0.75)]">
          <span className="text-xs">★</span>
          <span className="text-base">★</span>
          <span className="text-xs">★</span>
        </div>
      ) : null}
      <div
        className={[
          'relative grid place-items-center overflow-hidden border border-white/25 shadow-[inset_0_1px_18px_rgba(255,255,255,0.20)]',
          `bg-gradient-to-br ${style.gradient}`,
          lockedTone,
          innerClass,
        ].join(' ')}
        style={{ clipPath: 'polygon(50% 0%, 88% 17%, 88% 68%, 50% 100%, 12% 68%, 12% 17%)' }}
      >
        <span className="absolute left-1/2 top-2 h-1/4 w-1/2 -translate-x-1/2 rounded-full bg-white/25 blur-sm" />
        <span
          className={[
            'absolute left-1/2 top-1/2 z-10 grid h-[62%] w-[62%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/20 text-[0.82em] text-white shadow-[0_8px_18px_rgba(0,0,0,0.26)] drop-shadow-[0_3px_12px_rgba(0,0,0,0.4)]',
            locked ? 'opacity-90' : 'opacity-100',
          ].join(' ')}
        >
          {icon}
        </span>
        <span className="drop-shadow-[0_3px_12px_rgba(0,0,0,0.4)]">{locked ? '◆' : icon}</span>
      </div>
      <div
        className={[
          'absolute inset-x-3 bottom-1 h-2 rounded-full blur-sm',
          locked ? 'bg-slate-600/30' : `bg-gradient-to-r ${style.gradient}`,
          active ? 'opacity-95' : 'opacity-40',
        ].join(' ')}
      />
    </div>
  )
}

function SectionLabel({ number, children }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.08em] text-yellow-300">
      <span>{number}.</span>
      <span>{children}</span>
    </div>
  )
}

function Header({ onBack }) {
  return (
    <header className="rounded-[24px] border border-white/10 bg-[#0A1728]/90 p-4 shadow-[0_22px_58px_rgba(0,0,0,0.32)] md:p-5">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-2xl font-black text-white shadow-[0_12px_32px_rgba(0,0,0,0.26)] transition hover:-translate-y-0.5 hover:bg-white/[0.1] motion-reduce:transition-none"
          aria-label="Voltar"
        >
          ←
        </button>
        <div className="min-w-0">
          <h2 className="text-2xl font-black leading-none text-white md:text-3xl">Patentes</h2>
          <p className="mt-2 text-sm font-semibold text-slate-300">
            Evolua concluindo serviços e desbloqueie benefícios.
          </p>
        </div>
      </div>
    </header>
  )
}

function Tabs({ activeTipo, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-[22px] border border-white/10 bg-[#081321] p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
      {(['corre', 'prof']).map((tipo) => {
        const active = activeTipo === tipo
        const track = TRACKS[tipo]

        return (
          <button
            key={tipo}
            type="button"
            onClick={() => onChange(tipo)}
            className={[
              'relative overflow-hidden rounded-[18px] px-3 py-3 text-sm font-black uppercase tracking-[0.02em] transition motion-reduce:transition-none md:text-base',
              active
                ? `bg-gradient-to-r ${track.activeTab} shadow-[0_14px_34px_rgba(250,204,21,0.24)]`
                : 'bg-transparent text-slate-300 hover:bg-white/[0.06] hover:text-white',
            ].join(' ')}
          >
            {active ? (
              <motion.span
                layoutId="patente-active-tab"
                className="absolute inset-0 rounded-[18px] ring-1 ring-white/20"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span className="relative inline-flex items-center justify-center gap-2">
              <span>{track.tabIcon}</span>
              {track.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function StatPill({ icon, value, label }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-[#122238] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <span className="text-2xl font-black leading-none text-white">{value}</span>
      </div>
      <div className="mt-1 text-[11px] font-bold text-slate-400">{label}</div>
    </div>
  )
}

function EvolutionCard({ track, xp, moedas }) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-[#0B1627] p-4 shadow-[0_24px_68px_rgba(0,0,0,0.28)] md:p-5">
      <SectionLabel number="1">Minha evolução</SectionLabel>
      <div className="grid gap-5 md:grid-cols-[170px_1fr] md:items-center">
        <div className="flex justify-center md:justify-start">
          <Medal tipo={track.tipo} level={track.nivel} size="lg" active />
        </div>

        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-300">Nível atual</div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h3 className="text-3xl font-black leading-tight text-white md:text-4xl">{track.title}</h3>
            <span className="rounded-xl border border-violet-300/30 bg-violet-500/24 px-3 py-1.5 text-sm font-black text-violet-100">
              Nível {track.nivel}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <StatPill icon="🧾" value={track.servicos} label="Serviços concluídos" />
            <StatPill icon="XP" value={xp} label="XP" />
            <StatPill icon="🪙" value={moedas} label="Moedas" />
          </div>
        </div>
      </div>
    </section>
  )
}

function ProgressCard({ track }) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-[#0B1627] p-4 shadow-[0_22px_58px_rgba(0,0,0,0.24)] md:p-5">
      <SectionLabel number="2">Progresso para o próximo nível</SectionLabel>
      <div className="grid gap-4 sm:grid-cols-[1fr_92px] sm:items-center">
        <div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-black text-white">
              Próximo nível:{' '}
              <span className="text-yellow-300">{track.nextNivel ? track.nextTitle : 'Máximo'}</span>
            </div>
            <div className="text-xl font-black text-white">{track.progress}%</div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-700/70">
            <motion.div
              key={`${track.tipo}-${track.nivel}-${track.progress}`}
              initial={{ width: 0 }}
              animate={{ width: `${track.progress}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className={`h-full rounded-full bg-gradient-to-r ${track.meta.progress} shadow-[0_0_22px_rgba(250,204,21,0.34)]`}
            />
          </div>
          <div className="mt-3 text-sm font-semibold text-slate-400">
            {track.nextNivel ? `Faltam ${track.missing} serviços para evoluir` : 'Você alcançou a última patente desta trilha.'}
          </div>
        </div>
        <div className="mx-auto">
          <Medal tipo={track.tipo} level={track.nextNivel || track.nivel} size="sm" active={!!track.nextNivel} locked={!track.nextNivel} />
        </div>
      </div>
    </section>
  )
}

function Trail({ track, onSelect }) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-[#0B1627] p-4 shadow-[0_22px_58px_rgba(0,0,0,0.22)] md:p-5">
      <SectionLabel number="3">Trilha visual de patentes</SectionLabel>
      <div className="relative overflow-hidden rounded-[20px] bg-[#09182A]/55 px-1 py-3">
        <div className="absolute left-[10%] right-[10%] top-[47px] h-px bg-gradient-to-r from-slate-600/50 via-blue-300/60 to-slate-600/50" />
        <div className="relative grid grid-cols-5 gap-1 sm:gap-2">
          {LEVELS.map((level) => {
            const status = getStatus(level, track.nivel)
            const active = status === 'atual'
            const unlocked = status !== 'bloqueado'

            return (
              <button
                key={`${track.tipo}-trail-${level}`}
                type="button"
                onClick={() => onSelect(level)}
                className={[
                  'relative flex min-w-0 flex-col items-center rounded-[18px] px-1 py-2 text-center transition hover:-translate-y-1 hover:bg-white/[0.04] motion-reduce:transition-none',
                  active ? 'bg-white/[0.04]' : '',
                ].join(' ')}
              >
                <Medal tipo={track.tipo} level={level} size={active ? 'sm' : 'xs'} active={active} locked={!unlocked} />
                <div className={['mt-2 text-sm font-black leading-none', unlocked ? 'text-white' : 'text-slate-500'].join(' ')}>
                  {level}
                </div>
                <div className={['mt-1 w-full truncate text-[10px] font-bold sm:text-xs', active ? 'text-violet-200' : unlocked ? 'text-slate-300' : 'text-slate-500'].join(' ')}>
                  {getTrackTitle(track.tipo, level)}
                </div>
                <TrailStatusMark status={status} />
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function PatentCard({ track, level, onSelect }) {
  const status = getStatus(level, track.nivel)
  const active = status === 'atual'
  const unlocked = status !== 'bloqueado'
  const style = LEVEL_STYLE[level]
  const benefits = TRACKS[track.tipo].benefits[level]

  return (
    <motion.button
      type="button"
      layout
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={() => onSelect(level)}
      className={[
        'group relative w-full overflow-hidden rounded-[24px] border p-4 text-left shadow-[0_18px_48px_rgba(0,0,0,0.20)] transition motion-reduce:transition-none',
        unlocked ? style.card : style.locked,
        active ? 'ring-1 ring-violet-300/60' : '',
      ].join(' ')}
      style={active ? { boxShadow: `0 0 34px ${style.shadow}, 0 18px 48px rgba(0,0,0,0.24)` } : undefined}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(255,255,255,0.08),transparent_34%)] opacity-80" />
      <div className="relative grid gap-4 md:grid-cols-[1fr_116px_1.2fr] md:items-center">
        <div className="min-w-0">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-300">Nível {level}</div>
          <h4 className="mt-2 text-2xl font-black leading-tight text-white">{getTrackTitle(track.tipo, level)}</h4>
          <div className="mt-1 text-sm font-semibold text-slate-300">{SERVICOS_POR_NIVEL[level]}+ serviços</div>
        </div>

        <div className="flex justify-start md:justify-center">
          <Medal tipo={track.tipo} level={level} size="md" active={active} locked={!unlocked} />
        </div>

        <div className="min-w-0">
          <div className="mb-2 text-sm font-bold text-slate-300">Benefícios desbloqueados</div>
          <div className="space-y-1.5">
            {benefits.map((benefit) => (
              <div key={`${track.tipo}-${level}-${benefit}`} className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <span className={unlocked ? 'text-emerald-300' : 'text-slate-500'}>✓</span>
                <span>{benefit}</span>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <StatusBadge status={status} />
          </div>
        </div>
      </div>
    </motion.button>
  )
}

function PatentList({ track, onSelect }) {
  return (
    <section className="space-y-3">
      <SectionLabel number="4">Lista de patentes - {track.meta.label}</SectionLabel>
      {LEVELS.map((level) => (
        <PatentCard key={`${track.tipo}-card-${level}`} track={track} level={level} onSelect={onSelect} />
      ))}
    </section>
  )
}

function HowItWorks() {
  return (
    <section className="rounded-[24px] border border-white/10 bg-[#0B1627] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.22)] md:p-5">
      <div className="flex items-center gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-yellow-300/30 bg-yellow-300/12 text-3xl text-yellow-200">
          ★
        </div>
        <div className="min-w-0">
          <div className="text-sm font-black uppercase tracking-[0.12em] text-yellow-300">Como funciona</div>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-300">
            Suas patentes aumentam conforme você conclui serviços. Quanto maior sua patente, mais confiança seu perfil transmite.
          </p>
        </div>
      </div>
    </section>
  )
}

function Legend() {
  return (
    <section className="grid gap-3 rounded-[24px] border border-white/10 bg-[#0B1627] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.20)] md:grid-cols-[1.1fr_1fr] md:p-5">
      <div>
        <SectionLabel number="5">Legenda de status</SectionLabel>
        <div className="flex flex-wrap gap-3">
          <StatusBadge status="desbloqueado" />
          <StatusBadge status="atual" />
          <StatusBadge status="bloqueado" />
        </div>
      </div>
      <div>
        <SectionLabel number="6">Cores por nível</SectionLabel>
        <div className="grid grid-cols-5 gap-2">
          {LEVELS.map((level) => (
            <div
              key={`color-${level}`}
              className={`rounded-2xl bg-gradient-to-br ${LEVEL_STYLE[level].gradient} px-2 py-3 text-center text-[10px] font-black uppercase text-white shadow-[0_12px_26px_rgba(0,0,0,0.2)]`}
            >
              Nível {level}
              <div className="mt-1 text-white/80">{LEVEL_STYLE[level].hex}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PatentModal({ selected, track, onClose }) {
  const status = getStatus(selected.level, track.nivel)
  const unlocked = status !== 'bloqueado'
  const benefits = TRACKS[track.tipo].benefits[selected.level]
  const nextText = track.nextNivel
    ? `Faltam ${track.missing} serviços para chegar em ${track.nextTitle}.`
    : 'Você já chegou ao nível máximo desta trilha.'

  return (
    <motion.div
      className="fixed inset-0 z-[10000] grid place-items-center bg-black/72 p-4 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.div
        className="relative w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/10 bg-[#07111F] p-4 text-white shadow-[0_30px_90px_rgba(0,0,0,0.55)] md:p-5"
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(168,85,247,0.24),transparent_32%),radial-gradient(circle_at_88%_12%,rgba(59,130,246,0.16),transparent_28%)]" />
        <div className="relative flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-xl font-black transition hover:bg-white/[0.1]"
            aria-label="Voltar"
          >
            ←
          </button>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-2xl font-black transition hover:bg-white/[0.1]"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="relative mt-4 grid gap-5 md:grid-cols-[220px_1fr]">
          <div className="text-center">
            <div className="text-sm font-bold text-slate-400">{track.meta.subtitle}</div>
            <h3 className="mt-1 text-3xl font-black text-violet-200">
              Nível {selected.level} - {getTrackTitle(track.tipo, selected.level)}
            </h3>
            <div className="mt-5 flex justify-center">
              <Medal tipo={track.tipo} level={selected.level} size="lg" active={status === 'atual'} locked={!unlocked} />
            </div>
            <div className="mt-4">
              <StatusBadge status={status} />
            </div>
            <div className="mt-5 text-2xl font-black text-white">
              {Math.min(track.servicos, track.nextMark)}/{track.nextMark}
            </div>
            <div className="text-sm font-semibold text-slate-400">Serviços concluídos</div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-white/10 bg-[#122238] p-4">
              <div className="text-base font-black text-white">Benefícios desbloqueados</div>
              <div className="mt-3 space-y-2">
                {benefits.map((benefit) => (
                  <div key={`modal-${track.tipo}-${selected.level}-${benefit}`} className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <span className={unlocked ? 'text-emerald-300' : 'text-slate-500'}>✓</span>
                    {benefit}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-[#122238] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-black text-white">Progresso para o próximo nível</div>
                  <div className="mt-1 text-sm font-semibold text-slate-400">
                    Você já concluiu {track.servicos} de {track.nextMark} serviços.
                  </div>
                </div>
                <div className="text-lg font-black text-white">{track.progress}%</div>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-700">
                <div className={`h-full rounded-full bg-gradient-to-r ${track.meta.progress}`} style={{ width: `${track.progress}%` }} />
              </div>
              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="text-sm font-black text-white">O que falta para desbloquear</div>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-400">{nextText}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={`w-full rounded-2xl bg-gradient-to-r ${track.meta.progress} px-5 py-4 text-base font-black text-white shadow-[0_18px_45px_rgba(37,99,235,0.28)] transition hover:-translate-y-0.5 motion-reduce:transition-none`}
            >
              Continuar evoluindo {track.meta.tabIcon}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function PainelPatentes({
  accountStats = {},
  serviceStats = {},
  isProfissional = false,
  onBack,
}) {
  const [activeTipo, setActiveTipo] = useState('corre')
  const [selectedPatent, setSelectedPatent] = useState(null)

  const xp = toNumber(accountStats.xp)
  const moedas = toNumber(accountStats.moedas)
  const servicosCorre = getServicos(accountStats, serviceStats, 'corre')
  const servicosProf = getServicos(accountStats, serviceStats, 'prof')

  const { correTrack, profTrack } = useMemo(() => {
    const corre = buildTrack({
      tipo: 'corre',
      servicos: servicosCorre,
      savedNivel: accountStats.patenteCorre,
      enabled: true,
    })
    const prof = buildTrack({
      tipo: 'prof',
      servicos: servicosProf,
      savedNivel: accountStats.patenteProf,
      enabled: isProfissional,
    })

    return { correTrack: corre, profTrack: prof }
  }, [accountStats.patenteCorre, accountStats.patenteProf, isProfissional, servicosCorre, servicosProf])

  const activeTrack = activeTipo === 'prof' ? profTrack : correTrack
  const modalTrack = selectedPatent?.tipo === 'prof' ? profTrack : correTrack

  const handleSelectPatent = (level) => {
    setSelectedPatent({ tipo: activeTrack.tipo, level })
  }

  return (
    <div className="rounded-[30px] bg-[#07111F] p-3 text-white shadow-[0_30px_90px_rgba(0,0,0,0.36)] md:p-4">
      <div className="space-y-4">
        <Header onBack={onBack} />
        <Tabs activeTipo={activeTipo} onChange={setActiveTipo} />

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTipo}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="grid gap-4 xl:grid-cols-[0.96fr_1.04fr]"
          >
            <div className="space-y-4">
              <EvolutionCard track={activeTrack} xp={xp} moedas={moedas} />
              <ProgressCard track={activeTrack} />
              <Trail track={activeTrack} onSelect={handleSelectPatent} />
              <HowItWorks />
            </div>

            <div className="space-y-4">
              <PatentList track={activeTrack} onSelect={handleSelectPatent} />
              <Legend />
              {!isProfissional && activeTipo === 'prof' ? (
                <div className="rounded-[24px] border border-emerald-300/24 bg-emerald-400/10 px-4 py-4 text-sm font-bold leading-relaxed text-emerald-100">
                  Ative o perfil profissional para evoluir nessa trilha e liberar benefícios para agenda e portfólio.
                </div>
              ) : null}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selectedPatent ? (
          <PatentModal
            selected={selectedPatent}
            track={modalTrack}
            onClose={() => setSelectedPatent(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
