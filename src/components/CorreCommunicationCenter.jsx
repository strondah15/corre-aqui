'use client'

import { cloneElement, isValidElement, useCallback, useEffect, useState } from 'react'

const TABS = [
  { id: 'conversations', label: 'Conversas', icon: '💬' },
  { id: 'notices', label: 'Avisos', icon: '🔔' },
]

function normalizeTab(value) {
  return value === 'notices' ? 'notices' : 'conversations'
}

function Counter({ value }) {
  const count = Math.max(0, Number(value || 0))
  if (!count) return null

  return (
    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white shadow-sm">
      {count > 99 ? '99+' : count}
    </span>
  )
}

export default function CorreCommunicationCenter({
  conversations,
  notices,
  activeTab,
  initialTab = 'conversations',
  onTabChange,
  className = '',
}) {
  const [internalTab, setInternalTab] = useState(() => normalizeTab(initialTab))
  const [counts, setCounts] = useState({ conversations: 0, notices: 0 })
  const controlled = activeTab === 'conversations' || activeTab === 'notices'
  const selectedTab = controlled ? normalizeTab(activeTab) : internalTab

  useEffect(() => {
    if (!controlled) setInternalTab(normalizeTab(initialTab))
  }, [controlled, initialTab])

  const updateConversationCount = useCallback((value) => {
    const count = Math.max(0, Number(value || 0))
    setCounts((current) => (
      current.conversations === count ? current : { ...current, conversations: count }
    ))
  }, [])

  const updateNoticeCount = useCallback((value) => {
    const count = Math.max(0, Number(value || 0))
    setCounts((current) => (
      current.notices === count ? current : { ...current, notices: count }
    ))
  }, [])

  const selectTab = (nextTab) => {
    const normalized = normalizeTab(nextTab)
    if (!controlled) setInternalTab(normalized)
    onTabChange?.(normalized)
  }

  const conversationPanel = isValidElement(conversations)
    ? cloneElement(conversations, {
      compact: true,
      onUnreadCountChange: updateConversationCount,
    })
    : conversations
  const noticePanel = isValidElement(notices)
    ? cloneElement(notices, {
      compact: true,
      onUnreadCountChange: updateNoticeCount,
    })
    : notices

  return (
    <section
      className={[
        'overflow-hidden rounded-[24px] border border-slate-200/90 bg-white/95 text-slate-950 shadow-[0_18px_55px_rgba(15,23,42,0.13)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 dark:text-white md:rounded-[30px]',
        className,
      ].join(' ')}
      aria-label="Central de comunicação"
    >
      <div className="border-b border-slate-200/90 bg-gradient-to-br from-white via-sky-50/70 to-amber-50/60 px-3 pb-3 pt-3 dark:border-white/10 dark:from-slate-950 dark:via-blue-950/35 dark:to-slate-900 md:px-4 md:pt-4">
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600 dark:text-cyan-300">
              Central de comunicação
            </div>
            <h2 className="mt-0.5 truncate text-lg font-black tracking-tight text-slate-950 dark:text-white md:text-xl">
              Conversas e avisos
            </h2>
          </div>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-blue-600 text-base text-white shadow-[0_10px_22px_rgba(37,99,235,0.22)]" aria-hidden="true">
            ✦
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Escolha entre conversas e avisos"
          className="mt-3 grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-slate-100/90 p-1 dark:border-white/10 dark:bg-white/[0.06]"
        >
          {TABS.map((tab) => {
            const selected = selectedTab === tab.id
            return (
              <button
                key={tab.id}
                id={`corre-communication-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`corre-communication-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(tab.id)}
                className={[
                  'flex h-10 min-w-0 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black transition active:scale-[0.98] md:h-11 md:text-sm',
                  selected
                    ? 'bg-white text-blue-700 shadow-[0_8px_20px_rgba(15,23,42,0.10)] dark:bg-blue-600 dark:text-white'
                    : 'text-slate-600 hover:bg-white/70 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/[0.08] dark:hover:text-white',
                ].join(' ')}
              >
                <span aria-hidden="true">{tab.icon}</span>
                <span className="truncate">{tab.label}</span>
                <Counter value={counts[tab.id]} />
              </button>
            )
          })}
        </div>
      </div>

      <div
        id="corre-communication-panel-conversations"
        role="tabpanel"
        aria-labelledby="corre-communication-tab-conversations"
        hidden={selectedTab !== 'conversations'}
        className="min-h-[18rem] bg-white dark:bg-slate-950"
      >
        {conversationPanel}
      </div>
      <div
        id="corre-communication-panel-notices"
        role="tabpanel"
        aria-labelledby="corre-communication-tab-notices"
        hidden={selectedTab !== 'notices'}
        className="min-h-[18rem] bg-white dark:bg-slate-950"
      >
        {noticePanel}
      </div>
    </section>
  )
}
