'use client'

import { motion } from 'framer-motion'

function BottomIcon({ type, className = '' }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.35,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }

  if (type === 'agenda') {
    return (
      <svg {...common}>
        <path d="M7 3v3" />
        <path d="M17 3v3" />
        <path d="M4 9h16" />
        <rect x="4" y="5" width="16" height="16" rx="4" />
      </svg>
    )
  }

  if (type === 'ganhos') {
    return (
      <svg {...common}>
        <path d="M6 10h12" />
        <path d="M7 15h7" />
        <rect x="4" y="6" width="16" height="14" rx="4" />
        <path d="M8 6V4h8v2" />
      </svg>
    )
  }

  if (type === 'inbox') {
    return (
      <svg {...common}>
        <path d="M21 11.5a7.5 7.5 0 0 1-9.9 7.1L5 20l1.5-5.3A7.5 7.5 0 1 1 21 11.5Z" />
        <path d="M8.5 11.5h.01" />
        <path d="M12 11.5h.01" />
        <path d="M15.5 11.5h.01" />
      </svg>
    )
  }

  if (type === 'perfil') {
    return (
      <svg {...common}>
        <path d="M12 3l7 3v5c0 4.3-2.8 7.8-7 10-4.2-2.2-7-5.7-7-10V6l7-3Z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10.5V20h13v-9.5" />
      <path d="M9.5 20v-5h5v5" />
    </svg>
  )
}

export default function BottomBar({
  active,
  onTab,
  unreadCount = 0,
  agendaCount = 0,
  hidden = false,
  modoApp = 'corre',
  collapsed = false,
}) {
  if (hidden) return null
  if (modoApp !== 'corre') return null

  const navItems = [
    { id: 'inicio', label: 'Início', icon: 'inicio', count: 0 },
    { id: 'agenda', label: 'Agenda', icon: 'agenda', count: Number(agendaCount || 0) },
    { id: 'ganhos', label: 'Ganhos', icon: 'ganhos', count: 0 },
    { id: 'inbox', label: 'Chat', icon: 'inbox', count: Number(unreadCount || 0) },
  ]

  const navButton = (item) => {
    const selected = active === item.id

    return (
      <motion.button
        key={item.id}
        type="button"
        whileTap={{ scale: 0.96 }}
        onClick={() => onTab?.(item.id)}
        title={item.label}
        className={[
          'relative flex h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-2xl text-[9px] font-black transition-all duration-200 active:scale-[0.96] md:h-[52px] md:text-[10px]',
          selected
            ? 'bg-[#ffd91a] text-blue-950 shadow-[0_10px_24px_rgba(250,204,21,0.26)]'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 md:text-slate-300 md:hover:bg-white/[0.1] md:hover:text-white',
        ].join(' ')}
        aria-pressed={selected}
      >
        <BottomIcon type={item.icon} className="h-[21px] w-[21px] md:h-6 md:w-6" />
        <span className="mt-0.5 max-w-full truncate px-0.5 leading-none">{item.label}</span>
        {item.count > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white ring-2 ring-white md:h-6 md:min-w-6 md:text-[11px]">
            {item.count > 99 ? '99+' : item.count}
          </span>
        ) : null}
      </motion.button>
    )
  }

  return (
    <div
      className={[
        'fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.45rem)] z-[9998] px-3 transition-all duration-300 ease-out will-change-transform md:inset-x-auto md:right-6 md:bottom-6 md:px-0',
        collapsed ? 'translate-y-[135%] opacity-0 pointer-events-none' : 'translate-y-0 opacity-100',
      ].join(' ')}
    >
      <div className="mx-auto flex h-[66px] w-full max-w-[430px] items-center justify-between gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 text-slate-950 shadow-[0_18px_58px_rgba(15,23,42,0.24)] backdrop-blur-xl md:max-w-[470px] md:border-white/10 md:bg-slate-950/92 md:px-3 md:text-white">
        {navItems.map(navButton)}
      </div>
    </div>
  )
}
