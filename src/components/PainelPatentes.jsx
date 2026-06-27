'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import Patente, {
  SERVICOS_POR_NIVEL,
  calcularPatentePorServicos,
  getPatenteTitle,
  getPatenteVisual,
  progressoPatentePorServicos,
  proximoMarcoPatente,
} from './Patente'

const LEVELS = [1, 2, 3, 4, 5]

const TRACK_META = {
  corre: {
    label: 'Corre',
    eyebrow: 'Trilha Corre',
    short: 'Corre rapido',
    icon: '⚡',
    accent: 'from-blue-500 via-violet-500 to-fuchsia-500',
    soft: 'from-blue-500/20 via-violet-500/16 to-fuchsia-500/12',
    ring: 'border-violet-300/30',
    progress: 'from-blue-400 to-violet-500',
    nextTone: 'text-violet-100',
  },
  prof: {
    label: 'Profissional',
    eyebrow: 'Trilha Profissional',
    short: 'Servicos profissionais',
    icon: '💼',
    accent: 'from-emerald-400 via-cyan-400 to-blue-500',
    soft: 'from-emerald-400/18 via-cyan-400/14 to-blue-500/12',
    ring: 'border-emerald-300/30',
    progress: 'from-emerald-400 to-cyan-400',
    nextTone: 'text-emerald-100',
  },
}

const BENEFITS = {
  corre: {
    1: ['Aceitar pedidos', 'Perfil basico'],
    2: ['Mais confianca visual', 'Selo de evolucao'],
    3: ['Perfil mais forte', 'Badge destacado'],
    4: ['Alta experiencia', 'Prioridade em buscas'],
    5: ['Patente maxima', 'Destaque especial'],
  },
  prof: {
    1: ['Vitrine profissional', 'Agenda basica'],
    2: ['Mais credibilidade', 'Servicos em destaque'],
    3: ['Autoridade visual', 'Portfolio valorizado'],
    4: ['Referencia local', 'Prioridade em agendamentos'],
    5: ['Profissional elite', 'Destaque premium'],
  },
}

const ACHIEVEMENTS = [
  { icon: '🏁', title: 'Primeiro servico', target: 1 },
  { icon: '🏆', title: '5 servicos', target: 5 },
  { icon: '👑', title: '10 servicos', target: 10 },
  { icon: '⭐', title: '15 servicos', target: 15 },
  { icon: '💎', title: '30 servicos', target: 30 },
]

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

function buildTrack({ tipo, servicos, savedNivel, enabled = true }) {
  const serviceNivel = calcularPatentePorServicos(servicos)
  const nivel = Math.max(1, Math.min(5, Math.max(serviceNivel, toNumber(savedNivel, 1))))
  const nextMark = proximoMarcoPatente(servicos)
  const nextNivel = nivel >= 5 ? null : nivel + 1
  const currentMark = SERVICOS_POR_NIVEL[nivel] || 0
  const nextLevelMark = nextNivel ? SERVICOS_POR_NIVEL[nextNivel] : SERVICOS_POR_NIVEL[5]
  const localProgress = nextNivel
    ? clampPercent(((servicos - currentMark) / Math.max(nextLevelMark - currentMark, 1)) * 100)
    : 100

  return {
    tipo,
    meta: TRACK_META[tipo],
    servicos,
    nivel,
    title: getPatenteTitle(tipo, nivel),
    visual: getPatenteVisual(tipo, nivel),
    progress: nivel >= 5 ? 100 : Math.max(localProgress, clampPercent(progressoPatentePorServicos(servicos))),
    nextMark,
    nextNivel,
    nextTitle: nextNivel ? getPatenteTitle(tipo, nextNivel) : 'Nivel maximo',
    missing: nextMark ? Math.max(0, nextMark - servicos) : 0,
    enabled,
  }
}

function StatTile({ label, value, detail, tone = 'blue' }) {
  const toneClass = tone === 'yellow' ? 'text-yellow-200' : tone === 'green' ? 'text-emerald-200' : 'text-blue-200'

  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.06] px-3 py-3 shadow-[0_14px_28px_rgba(0,0,0,0.18)]">
      <div className={`text-2xl font-black leading-none ${toneClass}`}>{value}</div>
      <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/55">{label}</div>
      {detail ? <div className="mt-1 text-[11px] font-bold text-white/45">{detail}</div> : null}
    </div>
  )
}

function TrackTabs({ activeTipo, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/20 p-1">
      {(['corre', 'prof']).map((tipo) => {
        const meta = TRACK_META[tipo]
        const active = activeTipo === tipo

        return (
          <button
            key={tipo}
            type="button"
            onClick={() => onChange(tipo)}
            className={[
              'rounded-xl px-3 py-2 text-xs font-black transition',
              active
                ? `bg-gradient-to-r ${meta.accent} text-white shadow-[0_14px_28px_rgba(37,99,235,0.25)]`
                : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white',
            ].join(' ')}
          >
            <span className="mr-1">{meta.icon}</span>
            {meta.label}
          </button>
        )
      })}
    </div>
  )
}

function LevelBadge({ tipo, level, active, unlocked }) {
  const visual = getPatenteVisual(tipo, level)
  const title = getPatenteTitle(tipo, level)

  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <div
        className={[
          'relative grid h-12 w-12 place-items-center rounded-2xl border text-lg font-black ring-1 transition md:h-14 md:w-14',
          unlocked ? `border-white/20 bg-gradient-to-br ${visual.cor} text-white ${visual.ring}` : 'border-white/10 bg-white/[0.04] text-white/35 ring-white/5',
          active ? 'scale-110 shadow-[0_0_30px_rgba(168,85,247,0.35)]' : '',
        ].join(' ')}
      >
        {active ? <span className="absolute -top-1.5 h-2 w-2 rounded-full bg-yellow-300 shadow-[0_0_18px_rgba(250,204,21,0.8)]" /> : null}
        <span>{visual.icon}</span>
      </div>
      <div className="text-center">
        <div className={['text-xs font-black', active ? 'text-white' : unlocked ? 'text-white/75' : 'text-white/35'].join(' ')}>
          {level}
        </div>
        <div className={['max-w-[64px] truncate text-[10px] font-bold', active ? 'text-violet-200' : 'text-white/45'].join(' ')}>
          {title}
        </div>
      </div>
    </div>
  )
}

function TrackProgressHero({ track }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`overflow-hidden rounded-[24px] border ${track.meta.ring} bg-gradient-to-br ${track.meta.soft} p-4 shadow-[0_18px_55px_rgba(0,0,0,0.22)] md:p-5`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="grid h-24 w-24 shrink-0 place-items-center rounded-[28px] border border-white/10 bg-black/25 shadow-[0_0_50px_rgba(124,58,237,0.28)]">
          <Patente tipo={track.tipo} nivel={track.nivel} showLabel={false} pulse />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-white/55">{track.meta.eyebrow}</div>
          <h3 className="mt-1 text-2xl font-black leading-tight text-white">
            Sua evolucao {track.meta.label}
          </h3>
          <div className="mt-1 inline-flex rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-xs font-black text-white">
            Nivel {track.nivel} - {track.title}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm font-bold text-white/75">
          <span>{track.servicos} servicos concluidos</span>
          <span>{track.progress}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${track.meta.progress} shadow-[0_0_22px_rgba(99,102,241,0.42)] transition-all duration-500`}
            style={{ width: `${track.progress}%` }}
          />
        </div>
        <div className="mt-2 text-xs font-bold text-white/50">
          {track.nextMark ? `Faltam ${track.missing} servicos para o proximo nivel` : 'Voce chegou ao nivel maximo desta trilha.'}
        </div>
      </div>

      <div className="relative mt-6">
        <div className="absolute left-6 right-6 top-6 h-px bg-gradient-to-r from-white/15 via-white/35 to-white/15" />
        <div className="relative flex justify-between gap-2">
          {LEVELS.map((level) => (
            <LevelBadge
              key={`${track.tipo}-hero-${level}`}
              tipo={track.tipo}
              level={level}
              active={level === track.nivel}
              unlocked={level <= track.nivel}
            />
          ))}
        </div>
      </div>
    </motion.section>
  )
}

function PatentLevelCard({ tipo, level, currentLevel }) {
  const visual = getPatenteVisual(tipo, level)
  const title = getPatenteTitle(tipo, level)
  const unlocked = level <= currentLevel
  const active = level === currentLevel
  const meta = TRACK_META[tipo]

  return (
    <motion.div
      layout
      className={[
        'relative overflow-hidden rounded-[18px] border p-3 transition',
        active
          ? `border-white/25 bg-gradient-to-r ${meta.soft} shadow-[0_0_35px_rgba(124,58,237,0.24)]`
          : unlocked
            ? 'border-white/10 bg-white/[0.07]'
            : 'border-white/8 bg-white/[0.03] opacity-70',
      ].join(' ')}
    >
      {active ? <div className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${meta.accent}`} /> : null}
      <div className="flex items-start gap-3">
        <div
          className={[
            'grid h-10 w-10 shrink-0 place-items-center rounded-2xl border text-base font-black',
            unlocked ? `border-white/20 bg-gradient-to-br ${visual.cor} text-white` : 'border-white/10 bg-white/[0.05] text-white/35',
          ].join(' ')}
        >
          {visual.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-black text-white">
              Nivel {level} - {title}
            </h4>
            {active ? (
              <span className="rounded-full bg-violet-400/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-violet-100">
                Atual
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-[11px] font-bold text-white/45">
            {SERVICOS_POR_NIVEL[level]} servicos
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(BENEFITS[tipo]?.[level] || []).map((benefit) => (
              <span
                key={`${tipo}-${level}-${benefit}`}
                className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-bold text-white/70"
              >
                {unlocked ? '✓' : '•'} {benefit}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function PatentCards({ track }) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3 md:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-white/45">Cards de patentes</div>
          <h3 className="text-lg font-black text-white">Beneficios por nivel</h3>
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-black text-white/70">
          {track.meta.label}
        </div>
      </div>

      <div className="space-y-2">
        {LEVELS.map((level) => (
          <PatentLevelCard key={`${track.tipo}-level-${level}`} tipo={track.tipo} level={level} currentLevel={track.nivel} />
        ))}
      </div>
    </section>
  )
}

function Overview({ track, xp, moedas, totalServicos }) {
  return (
    <section className="space-y-3 rounded-[24px] border border-white/10 bg-white/[0.04] p-3 md:p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Nivel atual" value={track.nivel} detail={track.title} tone="yellow" />
        <StatTile label="Servicos" value={totalServicos} detail="concluidos" />
        <StatTile label="XP" value={xp} detail="acumulado" tone="green" />
        <StatTile label="Moedas" value={moedas} detail="ganhas" tone="yellow" />
      </div>

      <div className="rounded-[20px] border border-white/10 bg-black/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-black text-yellow-200">
              {track.nextNivel ? `Proximo nivel: ${track.nextTitle}` : 'Nivel maximo alcancado'}
            </div>
            <div className="mt-1 text-xs font-bold text-white/50">
              {track.nextMark ? `Faltam ${track.missing} servicos` : 'Continue mantendo boa reputacao para se destacar.'}
            </div>
          </div>
          <div className="text-sm font-black text-white">{track.progress}%</div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-orange-400" style={{ width: `${track.progress}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {LEVELS.map((level) => {
          const active = level === track.nivel
          const unlocked = level <= track.nivel

          return (
            <div
              key={`${track.tipo}-reward-${level}`}
              className={[
                'rounded-[16px] border p-2 text-center',
                active
                  ? 'border-yellow-300/80 bg-yellow-300/10'
                  : unlocked
                    ? 'border-white/12 bg-white/[0.05]'
                    : 'border-white/8 bg-white/[0.025]',
              ].join(' ')}
            >
              <div className="text-[10px] font-black text-white/45">{level}</div>
              <Patente tipo={track.tipo} nivel={level} size="xs" showLabel={false} pulse={active} />
              <div className={['mt-1 truncate text-[10px] font-black', active ? 'text-yellow-200' : 'text-white/55'].join(' ')}>
                {getPatenteTitle(track.tipo, level)}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function DualTracks({ correTrack, profTrack, activeTipo, onChange }) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3 md:p-4">
      <div className="mb-3">
        <div className="text-xs font-black uppercase tracking-[0.16em] text-white/45">Trilha dupla</div>
        <h3 className="text-lg font-black text-white">Corre e Profissional</h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {([correTrack, profTrack]).map((track) => {
          const active = activeTipo === track.tipo

          return (
            <button
              key={`track-${track.tipo}`}
              type="button"
              onClick={() => onChange(track.tipo)}
              className={[
                'rounded-[20px] border p-3 text-left transition',
                active ? `${track.meta.ring} bg-white/[0.08]` : 'border-white/10 bg-black/20 hover:bg-white/[0.06]',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Patente tipo={track.tipo} nivel={track.nivel} size="sm" showLabel={false} pulse={active} />
                  <div>
                    <div className="text-xs font-black text-white/55">{track.meta.eyebrow}</div>
                    <div className="text-base font-black text-white">Nivel {track.nivel}</div>
                  </div>
                </div>
                <span className={['rounded-full px-2 py-1 text-[10px] font-black', track.enabled ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/10 text-white/45'].join(' ')}>
                  {track.enabled ? 'Ativa' : 'Opcional'}
                </span>
              </div>

              <div className="mt-3 text-sm font-black text-white">{track.title}</div>
              <div className="mt-1 text-xs font-bold text-white/50">{track.servicos} servicos concluidos</div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full bg-gradient-to-r ${track.meta.progress}`} style={{ width: `${track.progress}%` }} />
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function Missions({ track, avaliacoes, notaMedia }) {
  const serviceTarget = track.nextMark || SERVICOS_POR_NIVEL[5]
  const missions = [
    {
      label: `Concluir ${serviceTarget} servicos`,
      value: `${Math.min(track.servicos, serviceTarget)}/${serviceTarget}`,
      progress: clampPercent((track.servicos / Math.max(serviceTarget, 1)) * 100),
    },
    {
      label: 'Receber avaliacoes',
      value: `${avaliacoes}/5`,
      progress: clampPercent((avaliacoes / 5) * 100),
    },
    {
      label: 'Manter nota 4.8+',
      value: notaMedia ? notaMedia.toFixed(1) : '0.0',
      progress: clampPercent((notaMedia / 5) * 100),
    },
  ]

  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3 md:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-white/45">Detalhes da patente</div>
          <h3 className="text-xl font-black text-white">
            Nivel {track.nivel} - {track.title}
          </h3>
          <div className="text-xs font-bold text-white/45">{track.meta.eyebrow}</div>
        </div>
        <Patente tipo={track.tipo} nivel={track.nivel} size="sm" showLabel={false} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[0.85fr_1.15fr]">
        <div className={`rounded-[22px] border ${track.meta.ring} bg-gradient-to-br ${track.meta.soft} p-4 text-center`}>
          <div className="mx-auto grid h-24 w-24 place-items-center rounded-[28px] border border-white/10 bg-black/25">
            <Patente tipo={track.tipo} nivel={track.nivel} showLabel={false} />
          </div>
          <div className="mt-3 text-2xl font-black text-white">{track.servicos}/{track.nextMark || SERVICOS_POR_NIVEL[5]}</div>
          <div className="text-xs font-bold text-white/50">Servicos concluidos</div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full rounded-full bg-gradient-to-r ${track.meta.progress}`} style={{ width: `${track.progress}%` }} />
          </div>
        </div>

        <div className="space-y-3 rounded-[22px] border border-white/10 bg-black/20 p-3">
          <div>
            <div className="text-sm font-black text-white">Beneficios desbloqueados</div>
            <div className="mt-2 space-y-1">
              {(BENEFITS[track.tipo]?.[track.nivel] || []).map((benefit) => (
                <div key={`${track.tipo}-benefit-${benefit}`} className="flex items-center gap-2 text-xs font-bold text-white/70">
                  <span className="text-emerald-300">✓</span>
                  {benefit}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-black text-white">Missoes para evoluir</div>
            <div className="mt-2 space-y-2">
              {missions.map((mission) => (
                <div key={`${track.tipo}-mission-${mission.label}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-2">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-white/65">
                    <span>{mission.label}</span>
                    <span>{mission.value}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full bg-gradient-to-r ${track.meta.progress}`} style={{ width: `${mission.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-2">
        {ACHIEVEMENTS.map((item) => {
          const done = track.servicos >= item.target

          return (
            <div
              key={`${track.tipo}-achievement-${item.title}`}
              className={[
                'rounded-[16px] border p-2 text-center',
                done ? 'border-yellow-300/35 bg-yellow-300/10 text-yellow-100' : 'border-white/10 bg-white/[0.035] text-white/40',
              ].join(' ')}
            >
              <div className="text-lg">{item.icon}</div>
              <div className="mt-1 truncate text-[9px] font-black">{item.title}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function PremiumStage({ track }) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.18),rgba(2,6,23,0.15)_42%,rgba(2,6,23,0.45))] p-4 text-center">
      <div className="flex items-center justify-between gap-3">
        <div className="text-left">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-white/45">Layout premium</div>
          <h3 className="text-lg font-black text-white">Sua jornada de patentes</h3>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-black text-white/60">
          {track.meta.label}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-5 items-end gap-2">
        {LEVELS.map((level) => {
          const active = level === track.nivel
          const unlocked = level <= track.nivel
          const height = active ? 'h-20' : level < track.nivel ? 'h-14' : 'h-10'

          return (
            <div key={`${track.tipo}-stage-${level}`} className="flex flex-col items-center gap-2">
              <div className={['grid place-items-center rounded-t-2xl border border-white/10 bg-white/[0.04] px-2', height].join(' ')}>
                <Patente tipo={track.tipo} nivel={level} size={active ? 'sm' : 'xs'} showLabel={false} pulse={active} />
              </div>
              <div className={['text-xs font-black', active ? 'text-yellow-200' : unlocked ? 'text-white/70' : 'text-white/35'].join(' ')}>
                {level}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mx-auto mt-5 max-w-md text-sm font-bold text-white/60">
        Sua dedicacao te leva cada vez mais longe. Evolua concluindo servicos, mantendo boa nota e atualizando seu perfil.
      </p>
    </section>
  )
}

export default function PainelPatentes({ accountStats = {}, serviceStats = {}, isProfissional = false }) {
  const [activeTipo, setActiveTipo] = useState('corre')

  const xp = toNumber(accountStats.xp)
  const moedas = toNumber(accountStats.moedas)
  const servicosCorre = getServicos(accountStats, serviceStats, 'corre')
  const servicosProf = getServicos(accountStats, serviceStats, 'prof')
  const avaliacoes = toNumber(serviceStats.avaliacoes)
  const notaMedia = toNumber(serviceStats.notaMedia)

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
  const totalServicos = servicosCorre + servicosProf

  return (
    <div className="space-y-4 text-white">
      <section className="overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.95),rgba(2,6,23,0.86))] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.26)] md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-yellow-300">Patentes Corre Aqui</div>
            <h2 className="mt-1 text-2xl font-black leading-tight md:text-3xl">Evolua em cada servico</h2>
            <p className="mt-2 max-w-2xl text-sm font-bold leading-relaxed text-white/55">
              Acompanhe seu nivel, beneficios, recompensas e o quanto falta para a proxima patente.
            </p>
          </div>

          <div className="w-full lg:w-[320px]">
            <TrackTabs activeTipo={activeTipo} onChange={setActiveTipo} />
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <TrackProgressHero track={activeTrack} />
        <Overview track={activeTrack} xp={xp} moedas={moedas} totalServicos={totalServicos} />
      </div>

      <DualTracks correTrack={correTrack} profTrack={profTrack} activeTipo={activeTipo} onChange={setActiveTipo} />

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <PatentCards track={activeTrack} />
        <Missions track={activeTrack} avaliacoes={avaliacoes} notaMedia={notaMedia} />
      </div>

      <PremiumStage track={activeTrack} />

      {!isProfissional && activeTipo === 'prof' ? (
        <div className="rounded-[20px] border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">
          Ative o perfil profissional para evoluir tambem nessa trilha e liberar beneficios para agenda e portfolio.
        </div>
      ) : null}
    </div>
  )
}
