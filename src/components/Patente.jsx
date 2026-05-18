'use client'

export const XP_POR_NIVEL = {
  1: 0,
  2: 200,
  3: 600,
  4: 1400,
  5: 3000,
}

export const SERVICOS_POR_NIVEL = {
  1: 0,
  2: 5,
  3: 15,
  4: 30,
  5: 60,
}

export const TITULOS_CORRE = {
  1: 'Iniciante',
  2: 'Corredor',
  3: 'Resolvedor',
  4: 'Brabo',
  5: 'Lendário',
}

export const TITULOS_PROFISSIONAL = {
  1: 'Profissional',
  2: 'Especialista',
  3: 'Mestre',
  4: 'Referência',
  5: 'Imparável',
}

export const PATENTE_VISUAL = {
  corre: {
    1: { cor: 'from-slate-500 to-slate-700', ring: 'ring-slate-300/15', icon: '⚡' },
    2: { cor: 'from-cyan-400 to-blue-500', ring: 'ring-cyan-300/25', icon: '⚡' },
    3: { cor: 'from-emerald-400 to-teal-500', ring: 'ring-emerald-300/25', icon: '⚡' },
    4: { cor: 'from-violet-400 to-fuchsia-500', ring: 'ring-fuchsia-300/25', icon: '⚡' },
    5: { cor: 'from-amber-300 to-orange-500', ring: 'ring-amber-300/35', icon: '🏆' },
  },
  prof: {
    1: { cor: 'from-slate-500 to-slate-700', ring: 'ring-slate-300/15', icon: '🧰' },
    2: { cor: 'from-sky-400 to-cyan-500', ring: 'ring-sky-300/25', icon: '💎' },
    3: { cor: 'from-indigo-400 to-violet-500', ring: 'ring-violet-300/25', icon: '💎' },
    4: { cor: 'from-amber-300 to-yellow-500', ring: 'ring-yellow-300/35', icon: '⭐' },
    5: { cor: 'from-pink-400 to-rose-500', ring: 'ring-rose-300/35', icon: '🏆' },
  },
}

function clampNivel(nivel = 1) {
  const n = Number(nivel || 1)
  return Math.max(1, Math.min(5, Number.isFinite(n) ? Math.round(n) : 1))
}

export function calcularPatente(xp = 0) {
  const n = Number(xp || 0)
  if (n >= XP_POR_NIVEL[5]) return 5
  if (n >= XP_POR_NIVEL[4]) return 4
  if (n >= XP_POR_NIVEL[3]) return 3
  if (n >= XP_POR_NIVEL[2]) return 2
  return 1
}

export function progressoNivel(xp = 0) {
  const nivel = calcularPatente(xp)

  if (nivel === 5) return 100

  const atual = XP_POR_NIVEL[nivel]
  const prox = XP_POR_NIVEL[nivel + 1]

  return Math.max(0, Math.min(100, ((Number(xp || 0) - atual) / (prox - atual)) * 100))
}

export function calcularPatentePorServicos(servicos = 0) {
  const n = Number(servicos || 0)
  if (n >= SERVICOS_POR_NIVEL[5]) return 5
  if (n >= SERVICOS_POR_NIVEL[4]) return 4
  if (n >= SERVICOS_POR_NIVEL[3]) return 3
  if (n >= SERVICOS_POR_NIVEL[2]) return 2
  return 1
}

export function progressoPatentePorServicos(servicos = 0) {
  const total = Number(servicos || 0)
  const nivel = calcularPatentePorServicos(total)
  if (nivel === 5) return 100

  const atual = SERVICOS_POR_NIVEL[nivel]
  const prox = SERVICOS_POR_NIVEL[nivel + 1]
  return Math.max(0, Math.min(100, ((total - atual) / (prox - atual)) * 100))
}

export function proximoMarcoPatente(servicos = 0) {
  const nivel = calcularPatentePorServicos(servicos)
  if (nivel === 5) return null
  return SERVICOS_POR_NIVEL[nivel + 1]
}

export function getPatenteTitle(tipo = 'corre', nivel = 1) {
  const n = clampNivel(nivel)
  return tipo === 'prof' || tipo === 'profissional' ? TITULOS_PROFISSIONAL[n] : TITULOS_CORRE[n]
}

export function getPatenteVisual(tipo = 'corre', nivel = 1) {
  const key = tipo === 'profissional' ? 'prof' : tipo
  const n = clampNivel(nivel)
  return PATENTE_VISUAL[key]?.[n] || PATENTE_VISUAL.corre[n]
}

export default function Patente({
  tipo = 'corre',
  nivel = 1,
  size = 'md',
  showLabel = true,
  pulse = true,
}) {
  const n = clampNivel(nivel)
  const visual = getPatenteVisual(tipo, n)
  const nome = getPatenteTitle(tipo, n)
  const isSmall = size === 'sm'
  const isTiny = size === 'xs'

  const iconSize = isTiny ? 'h-7 w-7 text-sm rounded-xl' : isSmall ? 'h-8 w-8 text-base rounded-xl' : 'h-10 w-10 text-lg rounded-2xl'
  const wrapperSize = isTiny ? 'gap-1 px-1.5 py-1 text-[10px]' : isSmall ? 'gap-1.5 px-2 py-1.5 text-[11px]' : 'gap-2 px-2.5 py-2 text-xs'

  return (
    <span
      className={[
        'relative inline-flex max-w-full items-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] font-black text-white shadow-[0_12px_32px_rgba(0,0,0,0.2)] ring-1 backdrop-blur-xl',
        visual.ring,
        wrapperSize,
      ].join(' ')}
      title={`${nome} · nível ${n}`}
    >
      {pulse ? (
        <span className={`absolute inset-0 opacity-35 bg-gradient-to-r ${visual.cor} blur-xl`} />
      ) : null}
      <span className={`relative grid shrink-0 place-items-center bg-gradient-to-br ${visual.cor} ${iconSize}`}>
        {visual.icon}
      </span>
      {showLabel ? (
        <span className="relative min-w-0 truncate">
          {nome}
          <span className="ml-1 text-white/60">N{n}</span>
        </span>
      ) : (
        <span className="sr-only">{nome} nível {n}</span>
      )}
    </span>
  )
}
