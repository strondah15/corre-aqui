'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const TITULOS_PROFISSIONAL = {
  1: 'Profissional',
  2: 'Especialista',
  3: 'Mestre',
  4: 'Referência',
  5: 'Imparável',
}

const TITULOS_CORRE = {
  1: 'Iniciante',
  2: 'Corredor',
  3: 'Resolvedor',
  4: 'Brabo',
  5: 'Lendário',
}

/* ✅ FALTAVA ISSO AQUI */
const TITULOS = {
  prof: TITULOS_PROFISSIONAL,
  corre: TITULOS_CORRE,
}

const Stars = ({ n = 1, size = 'sm', boom = false }) => {
  const total = Math.max(1, Math.min(5, Number(n || 1)))
  const s =
    size === 'sm' ? 'text-[12px]' : size === 'md' ? 'text-[14px]' : 'text-[16px]'

  return (
    <span
      className={[
        'tracking-[2px] font-black inline-flex',
        s,
        boom ? 'patente-stars-boom' : '',
      ].join(' ')}
    >
      {'★'.repeat(total)}
    </span>
  )
}

export default function Patente({
  tipo = 'corre', // 'corre' | 'prof'
  nivel = 1, // 1..5
  size = 'sm', // sm | md | lg
  showLabel = true,
  animateOnLevelUp = true,
}) {
  const t = String(tipo) === 'prof' ? 'prof' : 'corre'
  const n = Math.max(1, Math.min(5, Number(nivel || 1)))

  /* ✅ AGORA FUNCIONA */
  const label = TITULOS?.[t]?.[n] || (t === 'prof' ? 'Profissional' : 'Corre')

  const pad =
    size === 'sm'
      ? 'px-2 py-1'
      : size === 'md'
      ? 'px-2.5 py-1.5'
      : 'px-3 py-2'
  const text =
    size === 'sm'
      ? 'text-[11px]'
      : size === 'md'
      ? 'text-[12px]'
      : 'text-[13px]'

  const theme =
    t === 'prof'
      ? 'bg-sky-500/12 border-sky-400/20 text-sky-100'
      : 'bg-yellow-300/12 border-yellow-300/20 text-yellow-100'

  const prevRef = useRef(n)
  const [levelUp, setLevelUp] = useState(false)

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = n

    if (!animateOnLevelUp) return
    if (n > prev) {
      setLevelUp(true)
      const tmr = setTimeout(() => setLevelUp(false), 950)
      return () => clearTimeout(tmr)
    }
  }, [n, animateOnLevelUp])

  const progress = useMemo(() => `${(n / 5) * 100}%`, [n])

  return (
    <>
      <style jsx>{`
        .patente-up {
          animation: patentePop 900ms ease-out;
        }
        @keyframes patentePop {
          0% { transform: scale(1); filter: brightness(1); }
          20% { transform: scale(1.05); filter: brightness(1.15); }
          45% { transform: scale(1.01); }
          100% { transform: scale(1); filter: brightness(1); }
        }

        .patente-shine::after {
          content: '';
          position: absolute;
          inset: -20%;
          background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.18) 40%, transparent 70%);
          transform: translateX(-120%) rotate(12deg);
          animation: shineMove 900ms ease-out;
          pointer-events: none;
        }
        @keyframes shineMove {
          0% { transform: translateX(-120%) rotate(12deg); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translateX(120%) rotate(12deg); opacity: 0; }
        }

        .patente-stars-boom {
          animation: starsBoom 650ms ease-out;
          text-shadow: 0 0 10px rgba(255,255,255,0.25);
        }
        @keyframes starsBoom {
          0% { transform: scale(1); opacity: 0.9; }
          40% { transform: scale(1.22); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }

        .spark {
          position: absolute;
          right: 10px;
          top: -10px;
          font-size: 14px;
          opacity: 0;
        }
        .spark.on {
          animation: sparkPop 850ms ease-out;
        }
        @keyframes sparkPop {
          0% { transform: translateY(8px) scale(0.8); opacity: 0; }
          25% { opacity: 1; }
          70% { opacity: 1; transform: translateY(-6px) scale(1.1); }
          100% { opacity: 0; transform: translateY(-14px) scale(0.9); }
        }
      `}</style>

      <div
        className={[
          'relative inline-flex items-center gap-2 rounded-2xl border backdrop-blur-md overflow-hidden',
          theme,
          pad,
          levelUp ? 'patente-up patente-shine' : '',
        ].join(' ')}
      >
        <span className={['spark', levelUp ? 'on' : ''].join(' ')}>✨</span>

        <span className="inline-flex items-center justify-center w-6 h-6 rounded-xl bg-black/25 border border-white/10">
          {t === 'prof' ? '🧑‍🔧' : '⚡'}
        </span>

        <div className="leading-tight">
          <div className="flex items-center gap-2">
            <Stars n={n} size={size} boom={levelUp} />
            {showLabel && <span className={`${text} font-extrabold`}>{label}</span>}
          </div>

          <div className="mt-0.5 h-[2px] w-full rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-white/35" style={{ width: progress }} />
          </div>
        </div>
      </div>
    </>
  )
}
