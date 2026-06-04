'use client'

import { motion } from 'framer-motion'

export default function BottomBar({
  active,
  onTab,
  unreadCount = 0,
  agendaCount = 0,
  problemasCount = 0,
  hidden = false,
  modoApp = 'corre',
  disponivel = true,
  collapsed = false,
}) {
  if (hidden) return null
  if (modoApp !== 'corre') return null

  const totalAgenda = Number(agendaCount || 0)

  const navItems = [
    { id: 'inbox', label: 'Inbox', icon: '💬', count: unreadCount },
    { id: 'agenda', label: 'Agenda', icon: '📅', count: totalAgenda },
    { id: 'seguranca', label: 'Seguro', icon: '🛡️', count: problemasCount },
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
          'relative flex h-12 w-12 flex-col items-center justify-center rounded-2xl text-[9px] font-black transition-all duration-200 active:scale-[0.96] md:w-16 md:text-[10px]',
          selected
            ? 'bg-slate-950 text-white md:bg-white md:text-slate-950'
            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 md:text-slate-300 md:hover:bg-white/[0.1] md:hover:text-white',
        ].join(' ')}
        aria-pressed={selected}
      >
        <span className="text-xl leading-none">{item.icon}</span>
        <span className="mt-0.5 leading-none">{item.label}</span>
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
      <div className="mx-auto flex h-[70px] w-full max-w-[390px] items-center justify-between rounded-full border border-slate-200 bg-white px-3 text-slate-950 shadow-[0_18px_58px_rgba(15,23,42,0.24)] backdrop-blur-xl md:max-w-[430px] md:border-white/10 md:bg-slate-950/92 md:px-4 md:text-white">
        {navButton(navItems[0])}
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          onClick={() => onTab?.('disponivel')}
          className={[
            '-mt-9 grid h-[74px] w-[74px] shrink-0 place-items-center rounded-full border-[6px] border-white text-white shadow-[0_18px_38px_rgba(37,99,235,0.28)] transition active:scale-[0.96] md:-mt-8 md:h-[78px] md:w-[78px] md:border-slate-950',
            disponivel
              ? 'bg-[linear-gradient(135deg,#0b73ff_0%,#16c784_48%,#ffd91a_100%)]'
              : 'bg-[linear-gradient(135deg,#334155_0%,#ef4444_58%,#fb7185_100%)]',
          ].join(' ')}
          aria-pressed={disponivel}
          title={disponivel ? 'Ficar indisponível' : 'Ficar disponível'}
        >
          <span className="flex flex-col items-center justify-center leading-none">
            <span
              className={[
                'mb-1 h-3 w-3 rounded-full ring-[5px] ring-white/20',
                disponivel ? 'bg-emerald-100 animate-pulse' : 'bg-rose-100',
              ].join(' ')}
            />
            <span className="text-[9px] font-black uppercase tracking-tight">
              {disponivel ? 'Disponível' : 'Oculto'}
            </span>
          </span>
        </motion.button>
        {navButton(navItems[1])}
        {navButton(navItems[2])}
      </div>
    </div>
  )
}
