'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import Mapadinamico from '@/components/Mapadinamico'
import PerfilDrawer from '@/components/PerfilDrawer'
import { auth, database } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { get, ref, runTransaction, serverTimestamp, update } from '@/lib/firebaseDebug'
import { promptClientTutorialIntro, promptWorkerTutorialIntro } from '@/components/tutorial/TutorialProvider'
import { TUTORIAL_KEYS } from '@/lib/tutorial/tutorialConfig'
import { CATEGORIES } from '@/constants/categories'
import {
  PUBLIC_WORK_PROFILE_TYPES,
  buildQuickPublicWorkProfilePayload,
  canAppearInPublicDirectory,
  clearPrivatePublicProfileFields,
  normalizeProfileStatus,
  safePublicText,
} from '@/lib/publicWorkProfile'

const modes = {
  cliente: {
    title: 'Quero contratar',
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

const WORK_PROFILE_BLOCKED_STATUSES = new Set(['blocked', 'bloqueado', 'suspended', 'suspenso', 'deleted', 'deletado', 'removed', 'removido'])

function getInitialWorkForm(accountData = {}, authUser = null, publicProfile = {}) {
  const profile = accountData?.profile || {}
  const categoria =
    publicProfile?.primaryCategoryId ||
    publicProfile?.categoriaId ||
    publicProfile?.correCategorias?.[0] ||
    publicProfile?.profCategorias?.[0] ||
    profile?.correCategorias?.[0] ||
    profile?.profCategorias?.[0] ||
    ''

  return {
    nome: safePublicText(publicProfile?.nome || accountData?.nome || profile?.nome || authUser?.displayName),
    profileType:
      publicProfile?.profileType === PUBLIC_WORK_PROFILE_TYPES.PROFESSIONAL ||
      publicProfile?.isProfissional === true
        ? PUBLIC_WORK_PROFILE_TYPES.PROFESSIONAL
        : PUBLIC_WORK_PROFILE_TYPES.CORRE,
    categoriaId: safePublicText(categoria),
    cidade: safePublicText(publicProfile?.cidade || accountData?.cidade || profile?.cidade),
    bairro: safePublicText(publicProfile?.bairro || accountData?.bairro || profile?.bairro),
    fotoURL: safePublicText(publicProfile?.fotoURL || accountData?.fotoURL || profile?.fotoURL || authUser?.photoURL),
    consentimento: publicProfile?.profileVisible === true,
  }
}

function QuickWorkProfileSetup({ uid, authUser, accountData, publicProfile, onBack, onSaved }) {
  const [form, setForm] = useState(() => getInitialWorkForm(accountData, authUser, publicProfile))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setForm(getInitialWorkForm(accountData, authUser, publicProfile))
    setError('')
  }, [accountData, authUser, publicProfile])

  const status = normalizeProfileStatus(publicProfile || {})
  const blocked = WORK_PROFILE_BLOCKED_STATUSES.has(status)
  const nameOk = safePublicText(form.nome).length >= 2
  const cityOk = safePublicText(form.cidade).length >= 2
  const neighborhoodOk = safePublicText(form.bairro).length >= 2
  const categoryOk = CATEGORIES.some((category) => category.id === form.categoriaId)
  const canSave = !blocked && nameOk && cityOk && neighborhoodOk && categoryOk && form.consentimento === true && !saving

  const updateField = (field, value) => {
    setError('')
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const save = async (event) => {
    event.preventDefault()
    if (!uid || !authUser?.uid) {
      setError('Entre com sua conta para criar o perfil publico.')
      return
    }

    if (!canSave) {
      setError('Preencha nome, categoria, cidade, bairro e aceite aparecer para clientes.')
      return
    }

    try {
      setSaving(true)
      const now = Date.now()
      const payload = buildQuickPublicWorkProfilePayload({
        uid,
        account: { ...(accountData || {}), displayName: authUser?.displayName, photoURL: authUser?.photoURL },
        form,
        now,
      })

      await runTransaction(ref(database, `publicProfiles/${uid}`), (current) => {
        const currentStatus = normalizeProfileStatus(current || {})
        if (WORK_PROFILE_BLOCKED_STATUSES.has(currentStatus)) return current
        return clearPrivatePublicProfileFields({
          ...(current || {}),
          ...payload,
          createdAt: current?.createdAt || payload.createdAt || now,
          updatedAt: now,
          atualizadoEm: now,
        })
      })

      await update(ref(database, `users/${uid}`), {
        preferredMode: 'corre',
        workProfileStatus: 'quick_complete',
        isCorre: payload.isCorre === true,
        isProfissional: payload.isProfissional === true,
        cidade: payload.cidade,
        bairro: payload.bairro,
        atualizadoEm: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      const profilePatch = {
        isCorre: payload.isCorre === true,
        isProfissional: payload.isProfissional === true,
        correCategorias: payload.correCategorias || [],
        profCategorias: payload.profCategorias || [],
        cidade: payload.cidade,
        bairro: payload.bairro,
        atualizadoEm: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
      if (payload.isCorre) profilePatch.correRegiao = payload.regiao
      if (payload.isProfissional) profilePatch.profRegiao = payload.regiao

      await update(ref(database, `users/${uid}/profile`), profilePatch)

      try {
        localStorage.setItem('modoApp', 'corre')
      } catch {}

      onSaved?.(payload)
    } catch (err) {
      console.error('[PUBLIC_PROFILE] erro ao criar perfil publico', err)
      setError(err?.message || 'Nao foi possivel criar seu perfil publico agora.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="relative min-h-[100dvh] overflow-y-auto bg-[#eef7ff] px-3 py-4 text-[#102451] sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.18]" style={{ backgroundImage: "url('/cliente-home-map-bg-v3.png')" }} />
      <form
        onSubmit={save}
        className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/85 bg-white/92 p-4 shadow-[0_22px_70px_rgba(15,23,42,0.14)] backdrop-blur-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">Perfil publico de trabalho</div>
            <h1 className="mt-2 text-2xl font-black leading-tight sm:text-4xl">Complete seu cadastro Corre/Pro</h1>
            <p className="mt-2 max-w-xl text-sm font-semibold leading-relaxed text-slate-600">
              So aparece para clientes quem cria este perfil publico. Sua conta Google continua separada e protegida.
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-blue-100 bg-white text-xl font-black text-blue-950 shadow-sm"
            aria-label="Voltar"
          >
            &larr;
          </button>
        </div>

        {blocked ? (
          <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
            Seu perfil publico esta bloqueado ou suspenso. Ajuste isso pelo suporte antes de aparecer para clientes.
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Nome profissional</span>
            <input
              value={form.nome}
              onChange={(event) => updateField('nome', event.target.value)}
              className="mt-1 h-12 w-full rounded-2xl border border-blue-100 bg-white px-4 text-sm font-bold outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-400/15"
              placeholder="Ex: Robson Gomes"
              autoComplete="name"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Como voce vai trabalhar?</span>
            <select
              value={form.profileType}
              onChange={(event) => updateField('profileType', event.target.value)}
              className="mt-1 h-12 w-full rounded-2xl border border-blue-100 bg-white px-4 text-sm font-bold outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-400/15"
            >
              <option value={PUBLIC_WORK_PROFILE_TYPES.CORRE}>Corre rapido</option>
              <option value={PUBLIC_WORK_PROFILE_TYPES.PROFESSIONAL}>Profissional</option>
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Categoria principal</span>
            <select
              value={form.categoriaId}
              onChange={(event) => updateField('categoriaId', event.target.value)}
              className="mt-1 h-12 w-full rounded-2xl border border-blue-100 bg-white px-4 text-sm font-bold outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-400/15"
            >
              <option value="">Selecione</option>
              {CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>{category.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Cidade / regiao</span>
            <input
              value={form.cidade}
              onChange={(event) => updateField('cidade', event.target.value)}
              className="mt-1 h-12 w-full rounded-2xl border border-blue-100 bg-white px-4 text-sm font-bold outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-400/15"
              placeholder="Ex: Nova Iguacu"
              autoComplete="address-level2"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Bairro ou area de atendimento</span>
            <input
              value={form.bairro}
              onChange={(event) => updateField('bairro', event.target.value)}
              className="mt-1 h-12 w-full rounded-2xl border border-blue-100 bg-white px-4 text-sm font-bold outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-400/15"
              placeholder="Ex: Centro, bairros proximos"
              autoComplete="address-level3"
            />
          </label>
        </div>

        <label className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-slate-700">
          <input
            type="checkbox"
            checked={form.consentimento}
            onChange={(event) => updateField('consentimento', event.target.checked)}
            className="mt-1 h-5 w-5 rounded border-emerald-300 text-emerald-600"
          />
          <span>
            Quero criar meu perfil publico de trabalho e aparecer para clientes quando meu perfil estiver ativo.
            <span className="mt-1 block text-xs font-semibold text-slate-500">Voce pode pausar a visibilidade depois nas configuracoes do perfil.</span>
          </span>
        </label>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>
        ) : null}

        <button
          type="submit"
          disabled={!canSave}
          className="mt-5 min-h-14 w-full rounded-[20px] bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-[0_18px_38px_rgba(37,99,235,0.24)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {saving ? 'Criando perfil...' : 'Criar perfil e continuar'}
        </button>
      </form>
    </main>
  )
}

function QuickWorkProfileSuccess({ onContinue, onBack }) {
  const progress = [
    ['Nome', true],
    ['Tipo', true],
    ['Categoria', true],
    ['Regiao', true],
    ['Descricao', false],
    ['Servicos', false],
    ['Portfolio', false],
    ['Agenda', false],
    ['WhatsApp', false],
  ]

  return (
    <main className="relative min-h-[100dvh] overflow-y-auto bg-[#eef7ff] px-3 py-4 text-[#102451] sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.18]" style={{ backgroundImage: "url('/cliente-home-map-bg-v3.png')" }} />
      <section className="relative mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col justify-center">
        <div className="overflow-hidden rounded-[30px] border border-white/85 bg-white/94 p-5 text-center shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur-2xl sm:p-8">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-4xl text-emerald-600 shadow-[0_18px_36px_rgba(16,185,129,0.18)]">
            &#10003;
          </div>
          <div className="mt-5 text-[11px] font-black uppercase tracking-[0.2em] text-blue-700">Perfil de trabalho</div>
          <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">Seu perfil ja esta visivel!</h1>
          <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-relaxed text-slate-600">
            Complete sua ficha para aumentar suas chances de ser encontrado por clientes da sua regiao.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2 text-left sm:grid-cols-3">
            {progress.map(([label, done]) => (
              <div
                key={label}
                className={[
                  'flex items-center gap-2 rounded-2xl border px-3 py-3 text-xs font-black',
                  done ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-slate-50 text-slate-500',
                ].join(' ')}
              >
                <span className={[
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px]',
                  done ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400',
                ].join(' ')}>
                  {done ? '\u2713' : '...'}
                </span>
                <span>{label}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onContinue}
              className="min-h-14 rounded-[18px] bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-[0_18px_38px_rgba(37,99,235,0.24)] transition active:scale-[0.98]"
            >
              Entrar no modo Corre/Pro
            </button>
            <button
              type="button"
              onClick={onBack}
              className="min-h-14 rounded-[18px] border border-blue-100 bg-white px-5 py-4 text-sm font-black text-blue-950 transition active:scale-[0.98]"
            >
              Voltar
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

export default function ModoGate() {
  const [selectedMode, setSelectedMode] = useState('cliente')
  const [stage, setStage] = useState('select')
  const [openPerfilGlobal, setOpenPerfilGlobal] = useState(false)
  const [uid, setUid] = useState(null)
  const [authUser, setAuthUser] = useState(null)
  const [accountData, setAccountData] = useState({})
  const [publicProfile, setPublicProfile] = useState(null)
  const [checkingWorkProfile, setCheckingWorkProfile] = useState(false)
  const [workProfileError, setWorkProfileError] = useState('')

  useEffect(() => {
    let active = true

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!active) return
      setUid(user?.uid || null)
      setAuthUser(user || null)
      setWorkProfileError('')

      if (!user?.uid) {
        setAccountData({})
        setPublicProfile(null)
        return
      }

      try {
        const [accountSnap, publicSnap] = await Promise.all([
          get(ref(database, `users/${user.uid}`)).catch(() => null),
          get(ref(database, `publicProfiles/${user.uid}`)).catch(() => null),
        ])
        if (!active) return
        setAccountData(accountSnap?.val?.() || {})
        setPublicProfile(publicSnap?.val?.() || null)
      } catch (error) {
        if (!active) return
        console.warn('[PUBLIC_PROFILE] erro ao carregar perfil publico', error)
        setAccountData({})
        setPublicProfile(null)
      }
    })

    return () => {
      active = false
      unsub()
    }
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

  const persistPreferredMode = useCallback(async (mode) => {
    if (!uid) return
    try {
      await update(ref(database, `users/${uid}`), {
        preferredMode: mode,
        modoAtual: mode,
        atualizadoEm: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    } catch (error) {
      console.warn('[MODO] nao foi possivel salvar preferencia', error)
    }
  }, [uid])

  const abrirApp = useCallback((mode) => {
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
  }, [])

  const continuar = async (mode = selectedMode) => {
    setWorkProfileError('')
    setSelectedMode(mode)
    await persistPreferredMode(mode)

    if (mode === 'cliente') {
      abrirApp(mode)
      return
    }

    if (!uid || !authUser?.uid) {
      setWorkProfileError('Entre com sua conta para criar o perfil Corre/Pro.')
      return
    }

    setCheckingWorkProfile(true)
    try {
      const [accountSnap, publicSnap] = await Promise.all([
        get(ref(database, `users/${uid}`)).catch(() => null),
        get(ref(database, `publicProfiles/${uid}`)).catch(() => null),
      ])
      const nextAccount = accountSnap?.val?.() || accountData || {}
      const nextPublicProfile = publicSnap?.val?.() || null
      setAccountData(nextAccount)
      setPublicProfile(nextPublicProfile)

      if (canAppearInPublicDirectory(nextPublicProfile, nextAccount)) {
        abrirApp('corre')
        return
      }

      const status = normalizeProfileStatus(nextPublicProfile || {})
      if (WORK_PROFILE_BLOCKED_STATUSES.has(status)) {
        setWorkProfileError('Seu perfil publico esta bloqueado ou suspenso. Fale com o suporte antes de aparecer para clientes.')
        return
      }

      setStage('work-profile')
    } catch (error) {
      console.error('[PUBLIC_PROFILE] erro ao verificar perfil publico', error)
      setWorkProfileError('Nao foi possivel verificar seu perfil publico agora.')
    } finally {
      setCheckingWorkProfile(false)
    }
  }

  const voltarParaAbas = () => {
    setStage('select')
  }

  if (stage === 'app') {
    return <Mapadinamico initialMode={selectedMode} onBackToMode={voltarParaAbas} />
  }

  if (stage === 'work-profile') {
    return (
      <QuickWorkProfileSetup
        uid={uid}
        authUser={authUser}
        accountData={accountData}
        publicProfile={publicProfile}
        onBack={() => setStage('select')}
        onSaved={(payload) => {
          setPublicProfile(payload)
          setStage('work-profile-success')
        }}
      />
    )
  }

  if (stage === 'work-profile-success') {
    return (
      <QuickWorkProfileSuccess
        onContinue={() => abrirApp('corre')}
        onBack={() => setStage('select')}
      />
    )
  }

  return (
    <main className="relative z-[1] isolate h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-[#f7fbff] px-3 py-2 text-[#102451] sm:h-auto sm:min-h-[100dvh] sm:max-h-none sm:px-6 sm:py-5 md:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#e7f6ff_0%,#f7fbff_42%,#ffffff_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.16]" style={{ backgroundImage: "url('/cliente-home-map-bg-v3.png')" }} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,.72)_70%,rgba(255,255,255,.9))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[46%] bg-[linear-gradient(180deg,rgba(184,225,245,.18),rgba(255,255,255,0))]" />
      <div className="pointer-events-none absolute -left-20 top-24 h-64 w-64 rounded-full bg-blue-100/35 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-cyan-100/40 blur-3xl" />
      <div className="pointer-events-none absolute right-[18%] top-16 h-20 w-20 rounded-full bg-white/60 blur-2xl" />

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

        {workProfileError ? (
          <div className="mt-2 rounded-2xl border border-rose-100 bg-white/85 px-4 py-3 text-center text-xs font-bold text-rose-700 sm:mt-4 sm:text-sm">
            {workProfileError}
          </div>
        ) : null}

        {checkingWorkProfile ? (
          <div className="mt-2 rounded-2xl border border-blue-100 bg-white/70 px-4 py-3 text-center text-xs font-black uppercase tracking-[0.14em] text-blue-700 sm:mt-4">
            Verificando perfil publico...
          </div>
        ) : null}

        <div className="mt-2 grid grid-cols-2 gap-x-1.5 gap-y-1 rounded-[18px] border border-white/95 bg-white/88 px-2 py-2 shadow-[0_12px_30px_rgba(80,83,160,0.06)] sm:mt-5 sm:grid-cols-5 sm:gap-1 sm:rounded-[20px] sm:px-3 sm:py-3">
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
          className="mx-auto mt-1.5 flex min-h-10 w-full max-w-[260px] items-center justify-center gap-2 rounded-[16px] border border-white/95 bg-white/82 px-5 text-sm font-black text-[#102451] shadow-[0_10px_24px_rgba(80,83,160,0.06)] backdrop-blur-xl transition hover:bg-white/95 active:scale-[0.98] sm:mt-4 sm:min-h-12 sm:rounded-[18px] sm:text-sm"
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
