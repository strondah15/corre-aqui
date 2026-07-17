'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import Mapadinamico from '@/components/Mapadinamico'
import PerfilDrawer from '@/components/PerfilDrawer'
import { auth } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { promptClientTutorialIntro, promptWorkerTutorialIntro } from '@/components/tutorial/TutorialProvider'
import { TUTORIAL_KEYS } from '@/lib/tutorial/tutorialConfig'

const modes = {
  cliente: {
    title: 'Preciso de ajuda',
    description: 'Encontre algu\u00e9m perto para resolver o que voc\u00ea precisa.',
    accent: 'violet',
    tags: ['Pedido r\u00e1pido', 'Chat integrado'],
  },
  corre: {
    title: 'Quero trabalhar',
    description: 'Aceite pedidos e aumente sua renda no seu tempo.',
    accent: 'orange',
    tags: ['Aceite pedidos', 'Ganhe no seu tempo'],
  },
}

const LIST_STATE_PREFIX = 'correAqui:listState:v2'
const LIST_RETURN_FLAG = 'correAqui:returningToList'

function deveMostrarIntroCliente() {
  try {
    return (
      localStorage.getItem(TUTORIAL_KEYS.cliente) !== 'true' &&
      localStorage.getItem(TUTORIAL_KEYS.clientePulado) !== 'true'
    )
  } catch {
    return false
  }
}

function deveMostrarIntroTrabalhar() {
  try {
    return (
      localStorage.getItem(TUTORIAL_KEYS.trabalhar) !== 'true' &&
      localStorage.getItem(TUTORIAL_KEYS.trabalharPulado) !== 'true'
    )
  } catch {
    return false
  }
}

function PinArtwork({ isClient }) {
  return (
    <div className="relative grid h-full min-h-[130px] place-items-center sm:min-h-[158px]">
      <div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: "url('/cliente-home-map-bg-v3.png')" }} />
      <div className="relative z-10 h-[94px] w-[78px] drop-shadow-[0_12px_18px_rgba(15,23,42,0.22)] sm:h-[106px] sm:w-[84px]">
        <span
          className={[
            'absolute left-1/2 top-[3%] h-[66px] w-[62px] -translate-x-1/2 rounded-[52%] shadow-[0_12px_20px_rgba(15,23,42,0.22)] sm:h-[72px] sm:w-[64px]',
            isClient ? 'bg-gradient-to-br from-violet-500 via-violet-600 to-indigo-700' : 'bg-gradient-to-br from-amber-400 via-orange-500 to-orange-600',
          ].join(' ')}
        />
        <span className={[
          'absolute left-1/2 top-[34%] z-[1] -translate-x-1/2 border-l-[22px] border-r-[22px] border-t-[39px] border-l-transparent border-r-transparent sm:top-[35%] sm:border-l-[22px] sm:border-r-[22px] sm:border-t-[40px]',
          isClient ? 'border-t-violet-600' : 'border-t-orange-500',
        ].join(' ')} />
        <div className="absolute left-1/2 top-[21%] z-10 grid h-10 w-10 -translate-x-1/2 place-items-center sm:top-[19%] sm:h-14 sm:w-14">
          {isClient ? (
            <span className="relative grid h-8 w-11 place-items-center rounded-full border border-violet-100 bg-white text-[10px] font-black tracking-[0.12em] text-violet-600 shadow-sm sm:h-7 sm:w-10 sm:text-[10px]">
              <span className="relative z-10 -ml-0.5">•••</span>
              <span className="absolute -bottom-1 left-3.5 h-2.5 w-2.5 rotate-45 bg-white sm:left-4 sm:h-3 sm:w-3" />
            </span>
          ) : (
            <span className="relative block h-9 w-11 rounded-[4px] border-2 border-white bg-white shadow-sm sm:h-8 sm:w-11">
              <span className="absolute -top-2 left-2.5 h-3 w-4 rounded-t border-2 border-b-0 border-white bg-orange-400 sm:left-3 sm:h-3 sm:w-5" />
              <span className="absolute left-0 right-0 top-2.5 h-0.5 bg-orange-300 sm:top-3" />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function ModeCard({ id, mode, selected, onSelect, tutorialTarget }) {
  const isClient = mode.accent === 'violet'

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(id)}
      data-tutorial={tutorialTarget || undefined}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      className={[
        'group relative flex min-h-[280px] flex-col overflow-hidden rounded-[22px] border bg-white p-1.5 text-left shadow-[0_18px_45px_rgba(80,83,160,0.12)] backdrop-blur-xl transition sm:grid sm:min-h-[184px] sm:grid-cols-[150px_minmax(0,1fr)] sm:rounded-[28px] sm:p-3',
        selected
          ? isClient
            ? 'border-violet-400 ring-4 ring-violet-100'
            : 'border-orange-400 ring-4 ring-orange-100'
          : 'border-white/85 hover:border-blue-200',
      ].join(' ')}
      aria-pressed={selected}
      aria-label={mode.title}
    >
      <div className={[
        'absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-15 blur-[8px]',
        isClient ? 'bg-violet-500' : 'bg-orange-500',
      ].join(' ')} />
      <div className={[
        'absolute -bottom-12 -left-10 h-36 w-36 rotate-12 rounded-[42%] opacity-15 blur-[8px]',
        isClient ? 'bg-blue-400' : 'bg-yellow-400',
      ].join(' ')} />
      <div className={[
        'absolute bottom-20 right-10 h-3 w-3 rounded-full opacity-30',
        isClient ? 'bg-violet-300' : 'bg-orange-300',
      ].join(' ')} />

      <div className={[
        'relative h-[130px] min-h-[130px] overflow-hidden rounded-[17px] bg-[linear-gradient(145deg,rgba(255,255,255,.96),rgba(241,235,255,.92))] sm:row-span-1 sm:h-full sm:min-h-[158px] sm:rounded-[21px]',
        isClient ? '' : 'bg-[linear-gradient(145deg,rgba(255,255,255,.96),rgba(255,241,225,.94))]',
      ].join(' ')}>
        <PinArtwork isClient={isClient} />
        <span className={[
          'absolute bottom-1 right-1 z-20 grid h-7 w-7 place-items-center rounded-full text-sm font-light text-white shadow-lg transition group-hover:translate-x-1 sm:bottom-3 sm:right-3 sm:h-10 sm:w-10 sm:text-xl',
          isClient ? 'bg-violet-600 shadow-violet-300' : 'bg-orange-500 shadow-orange-300',
        ].join(' ')} aria-hidden="true">&rarr;</span>
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col justify-start px-1.5 py-2 sm:min-h-[158px] sm:justify-center sm:px-4 sm:py-2">
        <span className={[
          'mb-1 w-fit rounded-full px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] sm:mb-1.5 sm:px-2 sm:text-[9px] sm:tracking-[0.12em]',
          isClient ? 'bg-violet-50 text-violet-700' : 'bg-orange-50 text-orange-700',
        ].join(' ')}>{isClient ? 'Cliente' : 'Corre / Pro'}</span>
        <h2 className="min-h-[42px] text-[20px] font-black leading-[1.08] tracking-tight text-[#102451] sm:min-h-0 sm:text-xl">{mode.title}</h2>
        <p className="mt-1 line-clamp-3 max-w-none overflow-hidden text-[12px] font-semibold leading-[1.3] text-slate-600 sm:max-w-[240px] sm:text-xs sm:leading-relaxed">{mode.description}</p>
        <div className="mt-auto flex min-h-[18px] flex-wrap gap-1 pt-2 sm:mt-3 sm:pt-0">
          {mode.tags.map((tag) => (
            <span key={tag} className={[
              'rounded-full px-1.5 py-0.5 text-[10px] font-black leading-tight sm:px-2 sm:py-1 sm:text-[9px]',
              isClient ? 'bg-violet-50 text-violet-700' : 'bg-orange-50 text-orange-700',
            ].join(' ')}>{tag}</span>
          ))}
        </div>
      </div>
    </motion.button>
  )
}

export default function ModoGate() {
  const [selectedMode, setSelectedMode] = useState('cliente')
  const [stage, setStage] = useState('select')
  const [openPerfilGlobal, setOpenPerfilGlobal] = useState(false)
  const [uid, setUid] = useState(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || null)
    })

    return () => unsub()
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('modoApp')
      if (saved === 'cliente' || saved === 'corre') setSelectedMode(saved)
    } catch {}
  }, [])

  useEffect(() => {
    try {
      const returningKey = sessionStorage.getItem(LIST_RETURN_FLAG) || ''
      const clienteKey = `${LIST_STATE_PREFIX}:cliente`
      const correKey = `${LIST_STATE_PREFIX}:corre`
      if (returningKey === clienteKey || returningKey === correKey) {
        const mode = returningKey === clienteKey ? 'cliente' : 'corre'
        setSelectedMode(mode)
        setStage('app')
      }
    } catch {}
  }, [])

  const continuar = (mode = selectedMode) => {
    try {
      localStorage.setItem('modoApp', mode)
    } catch {}
    setSelectedMode(mode)

    if (mode === 'cliente' && deveMostrarIntroCliente()) {
      promptClientTutorialIntro({
        onLater: () => setStage('app'),
      })
      return
    }

    if (mode === 'corre' && deveMostrarIntroTrabalhar()) {
      promptWorkerTutorialIntro({
        onLater: () => setStage('app'),
      })
      return
    }

    setStage('app')
  }

  const voltarParaAbas = () => {
    setStage('select')
  }

  if (stage === 'app') {
    return <Mapadinamico initialMode={selectedMode} onBackToMode={voltarParaAbas} />
  }

  return (
    <main className="relative h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-[#eef7ff] px-3 py-2 text-[#102451] sm:h-auto sm:min-h-[100dvh] sm:max-h-none sm:px-6 sm:py-5 md:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#cfeafa_0%,#eaf6fc_38%,#f8fbff_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.24]" style={{ backgroundImage: "url('/cliente-home-map-bg-v3.png')" }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[46%] bg-[linear-gradient(180deg,rgba(151,213,240,.28),rgba(255,255,255,0))]" />
      <div className="pointer-events-none absolute -left-20 top-24 h-64 w-64 rounded-full bg-blue-200/35 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-cyan-200/35 blur-3xl" />
      <div className="pointer-events-none absolute right-[18%] top-16 h-20 w-20 rounded-full bg-white/45 blur-2xl" />

      <div className="relative mx-auto flex h-full min-h-0 w-full max-w-[780px] flex-col justify-start py-1 sm:h-auto sm:min-h-[calc(100vh-4rem)] sm:justify-center sm:py-0">
        <header className="mx-auto mt-0 max-w-[620px] text-center sm:mt-2">
          <div className="flex items-center justify-center gap-1.5 sm:gap-2">
            <Image
              src="/corre-logo-mark.png"
              width={512}
              height={512}
              alt="Corre Aqui"
              priority
              unoptimized
              className="h-11 w-11 object-contain drop-shadow-[0_12px_22px_rgba(15,23,42,0.20)] sm:h-20 sm:w-20"
            />
            <div className="text-xl font-black tracking-tight text-[#102451] sm:text-3xl">
              CORRE <span className="text-violet-600">AQUI</span>
            </div>
          </div>
          <h1 className="mt-2 text-[28px] font-black leading-[0.96] tracking-tight sm:mt-5 sm:text-5xl">
            Como voc&ecirc; quer usar<br className="hidden sm:block" /> o Corre Aqui hoje?
          </h1>
          <p className="mt-1.5 text-[13px] font-semibold text-slate-600 sm:mt-3 sm:text-base">Escolha uma op&ccedil;&atilde;o para continuar</p>
        </header>

        <section data-tutorial="modo" className="mt-2.5 grid grid-cols-2 gap-2 sm:mt-9 sm:gap-5" aria-label="Escolha como usar o Corre Aqui">
          {Object.entries(modes).map(([id, mode]) => (
            <ModeCard
              key={id}
              id={id}
              mode={mode}
              selected={selectedMode === id}
              onSelect={continuar}
              tutorialTarget={id === 'corre' ? 'modo-trabalhar' : undefined}
            />
          ))}
        </section>

        <div className="mt-2 grid grid-cols-2 gap-x-1.5 gap-y-1 rounded-[18px] border border-white/90 bg-white/75 px-2 py-2 shadow-[0_12px_30px_rgba(80,83,160,0.08)] sm:mt-5 sm:grid-cols-5 sm:gap-1 sm:rounded-[20px] sm:px-3 sm:py-3">
          {[
            ['\u26a1', 'Pedido r\u00e1pido', 'text-orange-500'],
            ['\ud83d\udcac', 'Chat integrado', 'text-blue-600'],
            ['\ud83d\udccd', 'Pessoas pr\u00f3ximas', 'text-violet-600'],
            ['\ud83d\udee1', 'Atendimento seguro', 'text-blue-700'],
            ['\u2605', 'Avalia\u00e7\u00f5es reais', 'text-yellow-500'],
          ].map(([icon, label, color]) => (
            <div key={label} className="flex items-center justify-center gap-1.5 px-1 text-center sm:flex-col sm:gap-0.5">
              <span className={['text-base leading-none', color].join(' ')} aria-hidden="true">{icon}</span>
              <span className="text-[11px] font-black leading-tight text-slate-600 sm:text-[11px]">{label}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setOpenPerfilGlobal(true)}
          data-tutorial="perfil"
          className="mx-auto mt-1.5 flex min-h-10 w-full max-w-[260px] items-center justify-center gap-2 rounded-[16px] border border-white/90 bg-white/55 px-5 text-sm font-black text-[#102451] shadow-[0_10px_24px_rgba(80,83,160,0.08)] backdrop-blur-xl transition hover:bg-white/80 active:scale-[0.98] sm:mt-4 sm:min-h-12 sm:rounded-[18px] sm:text-sm"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#102451] text-xs text-white" aria-hidden="true">&#9881;</span>
          Configura&ccedil;&otilde;es
        </button>

        <PerfilDrawer
          open={openPerfilGlobal}
          onClose={() => setOpenPerfilGlobal(false)}
          uid={uid}
        />
      </div>
    </main>
  )
}
