'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { ref, onValue, update, serverTimestamp } from 'firebase/database'
import { database } from '@/lib/firebase'
import { CATEGORIES } from '@/constants/categories'
import dynamic from 'next/dynamic'
const PlanosCorreAqui = dynamic(() => import('@/components/PlanosCorreAqui'), { ssr: false })

/* =======================
   Utils
======================= */
const toInt = (v, fallback) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

const safeStr = (v) => String(v ?? '').trim()

const cleanWhats = (txt) => {
  const s = String(txt || '').trim()
  if (!s) return ''
  // deixa só números
  const only = s.replace(/[^\d]/g, '')
  // limita pra não virar “texto infinito”
  return only.slice(0, 18)
}

const safeUrl = (u) => {
  const s = String(u || '').trim()
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) return s // deixa passar (vc pode querer url sem https)
  return s
}

export default function PerfilDrawer({ open, onClose, uid }) {
  if (!open) return null
  if (!uid) return null

  const [tab, setTab] = useState('perfil') // perfil | config | profissional | monetizacao
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  const [profile, setProfile] = useState({
    // 🔥 SAFE DEFAULT

    nome: '',
    bio: '',
    cidade: '',
    fotoURL: '',
    avatarEmoji: '',
  })

  const [settings, setSettings] = useState({
    visivelNoMapa: true,
    notificacoes: true,
    raioKm: 3,
    modoIA: 'direto',
    appMode: 'cliente',
    objetivo: '',
    regrasIA: '',
    mapa: {
      mostrarOnline: true,
      aoVivo: false,
      limiteOnline: 30,
    },
  })

  // ✅ ficha técnica profissional
  const [prof, setProf] = useState({
    isProfissional: false,
    isCorre: false,
    profCategorias: [],
    profResumo: '',
    profWhats: '',
    profPrecoBase: '',
    profCidadeAtende: '',
  })

  const userBasePath = useMemo(() => (uid ? `users/${uid}` : null), [uid])

  const showToast = useCallback((t) => {
    setToast(t)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }, [])

  // fecha toast timer ao desmontar/fechar
  useEffect(() => {
    if (!open) {
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = null
      setToast(null)
    }
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = null
    }
  }, [open])

  // trava scroll do body quando aberto
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (open) setTab('perfil')
  }, [open])

  // listeners
  useEffect(() => {
    if (!open || !uid || !userBasePath) return

    setLoading(true)

    const pRef = ref(database, `${userBasePath}/profile`)
    const sRef = ref(database, `${userBasePath}/settings`)
    const proRef = ref(database, `${userBasePath}/profissional`)

    let gotProfile = false
    let gotSettings = false
    let gotProf = false

    const done = () => {
      if (gotProfile && gotSettings && gotProf) setLoading(false)
    }

    const off1 = onValue(
      pRef,
      (snap) => {
        gotProfile = true
        if (snap.exists()) {
          const v = snap.val() || {}
          setProfile((prev) => ({ ...prev, ...v }))
        } else {
          // se não existir, mantém defaults
          setProfile((prev) => ({ ...prev }))
        }
        done()
      },
      () => {
        gotProfile = true
        done()
      }
    )

    const off2 = onValue(
      sRef,
      (snap) => {
        gotSettings = true
        if (snap.exists()) {
          const v = snap.val() || {}
          setSettings((prev) => ({
            ...prev,
            ...v,
            mapa: { ...(prev.mapa || {}), ...(v.mapa || {}) },
          }))
        } else {
          setSettings((prev) => ({ ...prev }))
        }
        done()
      },
      () => {
        gotSettings = true
        done()
      }
    )

    const off3 = onValue(
      proRef,
      (snap) => {
        gotProf = true
        if (snap.exists()) {
          const v = snap.val() || {}
          setProf((prev) => ({
            ...prev,
            ...v,
            profCategorias: Array.isArray(v?.profCategorias) ? v.profCategorias : [],
          }))
        } else {
          setProf((prev) => ({ ...prev, profCategorias: Array.isArray(prev.profCategorias) ? prev.profCategorias : [] }))
        }
        done()
      },
      () => {
        gotProf = true
        done()
      }
    )

    return () => {
      off1()
      off2()
      off3()
    }
  }, [open, uid, userBasePath])

  // ESC fecha
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const salvarPerfil = useCallback(async () => {
    if (!uid || !userBasePath) return showToast({ type: 'err', text: 'Sem usuário logado.' })
    setSaving(true)
    try {
      const nomeClean = safeStr(profile?.nome || '') || 'Anônimo'
      const fotoClean = safeUrl(profile?.fotoURL || '')
      const emojiClean = safeStr(profile?.avatarEmoji || '').slice(0, 8) // evita string gigante

      const patch = {
        ...profile,
        nome: nomeClean,
        fotoURL: fotoClean,
        avatarEmoji: emojiClean,
        atualizadoEm: serverTimestamp(),
      }

      await update(ref(database, `${userBasePath}/profile`), patch)

      // ✅ espelha raiz (leitura rápida)
      await update(ref(database, `${userBasePath}`), {
        nome: nomeClean,
        fotoURL: fotoClean || null,
        avatarEmoji: emojiClean || null,
        updatedAt: serverTimestamp(),
      })

      // ✅ localStorage (pra aparecer no app sem recarregar)
      try {
        localStorage.setItem('meuNome', nomeClean)
        localStorage.setItem('fotoURL', fotoClean || '')
        localStorage.setItem('avatarEmoji', emojiClean || '')
      } catch {}

      showToast({ type: 'ok', text: '✅ Perfil salvo!' })
    } catch (e) {
      console.error(e)
      showToast({ type: 'err', text: '❌ Erro ao salvar perfil.' })
    } finally {
      setSaving(false)
    }
  }, [uid, userBasePath, profile, showToast])

  const salvarConfig = useCallback(async () => {
    if (!uid || !userBasePath) return showToast({ type: 'err', text: 'Sem usuário logado.' })
    setSaving(true)
    try {
      const raio = clamp(toInt(settings.raioKm, 3), 1, 50)
      const limite = clamp(toInt(settings?.mapa?.limiteOnline, 30), 5, 120)

      const patch = {
        ...settings,
        appMode: settings?.appMode === 'cliente' ? 'cliente' : 'corre',
        visivelNoMapa: !!settings.visivelNoMapa,
        notificacoes: !!settings.notificacoes,
        raioKm: raio,
        mapa: {
          mostrarOnline: !!settings?.mapa?.mostrarOnline,
          aoVivo: !!settings?.mapa?.aoVivo,
          limiteOnline: limite,
        },
        atualizadoEm: serverTimestamp(),
      }

      await update(ref(database, `${userBasePath}/settings`), patch)

      showToast({ type: 'ok', text: '✅ Configurações salvas!' })
    } catch (e) {
      console.error(e)
      showToast({ type: 'err', text: '❌ Erro ao salvar configurações.' })
    } finally {
      setSaving(false)
    }
  }, [uid, userBasePath, settings, showToast])

  const salvarProfissional = useCallback(async () => {
    if (!uid || !userBasePath) return showToast({ type: 'err', text: 'Sem usuário logado.' })
    setSaving(true)
    try {
      const patch = {
        isProfissional: !!prof.isProfissional,
        profResumo: safeStr(prof.profResumo),
        profWhats: cleanWhats(prof.profWhats),
        profPrecoBase: safeStr(prof.profPrecoBase),
        profCidadeAtende: safeStr(prof.profCidadeAtende),
        profCategorias: Array.isArray(prof.profCategorias) ? prof.profCategorias : [],
        atualizadoEm: serverTimestamp(),
      }

      // 1) salva em /profissional/*
      await update(ref(database, `${userBasePath}/profissional`), patch)

      // 2) espelha na raiz (pra leitura rápida)
      await update(ref(database, `${userBasePath}`), {
        isProfissional: patch.isProfissional,
        profCategorias: patch.profCategorias,
        profResumo: patch.profResumo,
        profWhats: patch.profWhats,
        profPrecoBase: patch.profPrecoBase,
        profCidadeAtende: patch.profCidadeAtende,
        updatedAt: serverTimestamp(),
      })

      showToast({ type: 'ok', text: '✅ Ficha técnica salva!' })
    } catch (e) {
      console.error(e)
      showToast({ type: 'err', text: '❌ Erro ao salvar ficha técnica.' })
    } finally {
      setSaving(false)
    }
  }, [uid, userBasePath, prof, showToast])

  const toggleCategoriaProf = useCallback((id) => {
    setProf((p) => {
      const arr = Array.isArray(p.profCategorias) ? p.profCategorias : []
      const exists = arr.includes(id)
      const next = exists ? arr.filter((x) => x !== id) : [...arr, id]
      return { ...p, profCategorias: next }
    })
  }, [])

  if (!open) return null

  const previewEmoji = safeStr(profile?.avatarEmoji || '')
  const previewFoto = safeStr(profile?.fotoURL || '')

  const glass = 'bg-white/10 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/40'

  return (
    <div className="fixed inset-0 z-[9999]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}  />

      <div
        className={[
          'absolute right-0 top-0 h-full w-[390px] max-w-[92vw]',
          glass,
          'border-l border-white/10',
          'text-gray-100',
          'p-4 flex flex-col',
          'translate-x-0 animate-in slide-in-from-right duration-200',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-center">
              ⚙️
            </div>
            <div className="leading-tight">
              <div className="font-semibold text-gray-100">Perfil & Config</div>
              <div className="text-xs text-gray-400">Ajuste sua identidade e seu modo profissional</div>
            </div>
          </div>

          <button
            className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center"
            onClick={onClose}
            aria-label="Fechar"
            type="button"
            title="Fechar (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-2 flex-wrap">
          <TabButton active={tab === 'perfil'} onClick={() => setTab('perfil')}>
            👤 Perfil
          </TabButton>
          <TabButton active={tab === 'config'} onClick={() => setTab('config')}>
            ⚙️ Config
          </TabButton>
          <TabButton active={tab === 'profissional'} onClick={() => setTab('profissional')}>
            🧑‍🔧 Profissional
          </TabButton>
          <TabButton active={tab === 'monetizacao'} onClick={() => setTab('monetizacao')}>
            💸 Monetização
          </TabButton>
        </div>

        <div className="mt-4 flex-1 overflow-auto pr-1">
          {loading ? (
            <Skeleton  />
          ) : (
            <>
              {/* PERFIL */}
              {tab === 'perfil' && (
                <div className="space-y-3">
                  <div className="rounded-2xl p-3 bg-white/5 border border-white/10 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden">
                      {previewFoto ? (
                        <img
                          src={previewFoto}
                          alt="Avatar"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                         />
                      ) : (
                        <span className="text-2xl">{previewEmoji || '🙂'}</span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-100">Seu avatar no mapa</div>
                      <div className="text-[11px] text-gray-400">Foto tem prioridade. Se não tiver foto, usa o emoji.</div>
                    </div>
                  </div>

                  <Field
                    label="Nome"
                    value={profile?.nome || ''}
                    onChange={(v) => setProfile((p) => ({ ...p, nome: v }))}
                    placeholder="Ex: Robson"
                   />

                  <Field
                    label="Cidade"
                    value={profile?.cidade || ''}
                    onChange={(v) => setProfile((p) => ({ ...p, cidade: v }))}
                    placeholder="Ex: São Paulo"
                   />

                  <Field
                    label="Foto URL"
                    value={profile?.fotoURL || ''}
                    onChange={(v) => setProfile((p) => ({ ...p, fotoURL: v }))}
                    placeholder="https://..."
                   />

                  <Field
                    label="Avatar Emoji (opcional)"
                    value={profile?.avatarEmoji || ''}
                    onChange={(v) => setProfile((p) => ({ ...p, avatarEmoji: v }))}
                    placeholder="Ex: 😎"
                   />

                  <Textarea
                    label="Bio"
                    value={(profile?.bio || '')}
                    onChange={(v) => setProfile((p) => ({ ...p, bio: v }))}
                    placeholder="Fala sobre você em 1-2 linhas…"
                   />

                  <button
                    onClick={salvarPerfil}
                    disabled={saving}
                    className="w-full rounded-2xl bg-black/70 hover:bg-black/80 border border-white/10 text-white py-2.5 font-semibold disabled:opacity-60"
                    type="button"
                  >
                    {saving ? 'Salvando…' : 'Salvar Perfil'}
                  </button>
                </div>
              )}

              {/* CONFIG */}
              {tab === 'config' && (
                <div className="space-y-4">
                  <Toggle
                    label="Visível no mapa"
                    desc="Se desligar, você não aparece como online."
                    checked={!!settings.visivelNoMapa}
                    onChange={(v) => setSettings((s) => ({ ...s, visivelNoMapa: v }))}
                   />

                  <Toggle
                    label="Notificações"
                    desc="Ativa avisos de mensagens e missões."
                    checked={!!settings.notificacoes}
                    onChange={(v) => setSettings((s) => ({ ...s, notificacoes: v }))}
                   />

                  <Field
                    label="Raio (km)"
                    type="number"
                    value={String(settings.raioKm ?? 3)}
                    onChange={(v) => setSettings((s) => ({ ...s, raioKm: v }))}
                    placeholder="3"
                   />


                  {/* ✅ Modo do app */}
                  <div className="rounded-2xl p-3 bg-white/5 border border-white/10">
                    <div className="text-sm font-semibold text-gray-100">🧭 Modo do app</div>
                    <div className="text-[11px] text-gray-400 mt-1">Cliente vê só mapa + pedir. Trabalho vê só trabalhos + ficar disponível.</div>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSettings((s) => ({ ...s, appMode: "cliente" }))}
                        className={[
                          "flex-1 h-[42px] rounded-2xl text-sm font-semibold transition border",
                          (settings?.appMode === "cliente" || !settings?.appMode)
                            ? "bg-white text-black border-white"
                            : "bg-white/10 text-gray-100 border-white/10 hover:bg-white/15",
                        ].join(' ')}
                      >
                        🛒 Cliente
                      </button>

                      <button
                        type="button"
                        onClick={() => setSettings((s) => ({ ...s, appMode: "corre" }))}
                        className={[
                          "flex-1 h-[42px] rounded-2xl text-sm font-semibold transition border",
                          settings?.appMode === "corre"
                            ? "bg-emerald-400 text-black border-emerald-300"
                            : "bg-white/10 text-gray-100 border-white/10 hover:bg-white/15",
                        ].join(' ')}
                      >
                        🧑‍🔧 Trabalho
                      </button>
                    </div>

                    <div className="text-[11px] text-gray-500 mt-2">Você pode mudar isso depois.</div>
                  </div>


                  {/* ✅ Seção Mapa */}
                  <div className="rounded-2xl p-3 bg-white/5 border border-white/10">
                    <div className="text-sm font-semibold text-gray-100">🗺️ Configurações do mapa</div>
                    <div className="text-[11px] text-gray-400 mt-1">
                      Controle como os online aparecem e o limite de marcadores.
                    </div>

                    <div className="mt-3 space-y-3">
                      <Toggle
                        label="Mostrar online no mapa"
                        desc="Se desligar, oculta os marcadores de pessoas online."
                        checked={!!settings?.mapa?.mostrarOnline}
                        onChange={(v) =>
                          setSettings((s) => ({
                            ...s,
                            mapa: { ...(s.mapa || {}), mostrarOnline: v },
                          }))
                        }
                       />

                      <Toggle
                        label="Ao vivo (modo forte)"
                        desc="Deixa o mapa mais atualizado em tempo real."
                        checked={!!settings?.mapa?.aoVivo}
                        onChange={(v) =>
                          setSettings((s) => ({
                            ...s,
                            mapa: { ...(s.mapa || {}), aoVivo: v },
                          }))
                        }
                       />

                      {/* ✅ melhor: slider + valor */}
                      <div className="rounded-2xl px-3 py-3 bg-white/5 border border-white/10">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-100">Limite de online no mapa</div>
                            <div className="text-[11px] text-gray-400 mt-0.5">(mínimo 5 · máximo 120)</div>
                          </div>
                          <div className="text-xs font-bold text-gray-100 w-10 text-right">
                            {clamp(toInt(settings?.mapa?.limiteOnline, 30), 5, 120)}
                          </div>
                        </div>

                        <input
                          type="range"
                          min={5}
                          max={120}
                          value={clamp(toInt(settings?.mapa?.limiteOnline, 30), 5, 120)}
                          onChange={(e) =>
                            setSettings((s) => ({
                              ...s,
                              mapa: { ...(s.mapa || {}), limiteOnline: Number(e.target.value) },
                            }))
                          }
                          className="mt-2 w-full"
                         />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={salvarConfig}
                    disabled={saving}
                    className="w-full rounded-2xl bg-black/70 hover:bg-black/80 border border-white/10 text-white py-2.5 font-semibold disabled:opacity-60"
                    type="button"
                  >
                    {saving ? 'Salvando…' : 'Salvar Configurações'}
                  </button>
                </div>
              )}

              {/* PROFISSIONAL */}
              {tab === 'profissional' && (
                <div className="space-y-3">
                  <Toggle
                    label="Sou corre (entregas / bicos rápidos)"
                    desc='Se ligar, você aparece na busca de "Corre" disponível.'
                    checked={!!prof.isCorre}
                    onChange={(v) => setProf((p) => ({ ...p, isCorre: v }))}
                   />


                  <Toggle
                    label="Sou profissional / faço bicos"
                    desc="Se ligar, você aparece como profissional (por categoria)."
                    checked={!!prof.isProfissional}
                    onChange={(v) => setProf((p) => ({ ...p, isProfissional: v }))}
                   />

                  <Textarea
                    label="Resumo do serviço"
                    value={prof.profResumo}
                    onChange={(v) => setProf((p) => ({ ...p, profResumo: v }))}
                    placeholder="Ex: Faço elétrica, tomadas, chuveiro, manutenção..."
                   />

                  <Field
                    label="WhatsApp (opcional)"
                    value={prof.profWhats}
                    onChange={(v) => setProf((p) => ({ ...p, profWhats: v }))}
                    placeholder="Ex: 11999999999"
                   />

                  <Field
                    label="Preço base (opcional)"
                    value={prof.profPrecoBase}
                    onChange={(v) => setProf((p) => ({ ...p, profPrecoBase: v }))}
                    placeholder="Ex: 50"
                   />

                  <Field
                    label="Cidade que atende (opcional)"
                    value={prof.profCidadeAtende}
                    onChange={(v) => setProf((p) => ({ ...p, profCidadeAtende: v }))}
                    placeholder="Ex: São Paulo - Zona Sul"
                   />

                  <div className="rounded-2xl p-3 bg-white/5 border border-white/10">
                    <div className="text-sm font-semibold text-gray-100">Categorias que você atende</div>
                    <div className="text-[11px] text-gray-400 mt-1">
                      Escolha as categorias que você trabalha.
                    </div>

                    <div className={`mt-3 flex flex-wrap gap-2 ${!prof.isProfissional ? 'opacity-50 pointer-events-none' : ''}`}>
                      {CATEGORIES.map((c) => {
                        const active = (prof.profCategorias || []).includes(c.id)
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleCategoriaProf(c.id)}
                            className={[
                              'px-3 py-2 rounded-2xl border text-sm font-semibold transition',
                              active
                                ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-100'
                                : 'bg-white/10 border-white/10 text-gray-100 hover:bg-white/15',
                            ].join(' ')}
                          >
                            {c.emoji} {c.label}
                          </button>
                        )
                      })}
                    </div>

                    {!prof.isProfissional && (
                      <div className="mt-2 text-[11px] text-gray-400">
                        Ligue “Sou profissional” pra selecionar categorias.
                      </div>
                    )}
                  </div>

                  <button
                    onClick={salvarProfissional}
                    disabled={saving}
                    className="w-full rounded-2xl bg-blue-600 hover:bg-blue-700 border border-white/10 text-white py-2.5 font-semibold disabled:opacity-60"
                    type="button"
                  >
                    {saving ? 'Salvando…' : 'Salvar Ficha Técnica'}
                  </button>
                </div>
              )}

              {/* MONETIZAÇÃO */}
              {tab === 'monetizacao' && (
                {tab==='monetizacao' && <PlanosCorreAqui  />
              )}
            < />
          )}
        </div>

        <div className="pt-3 mt-3 border-t border-white/10 text-xs text-gray-400">
          Dados em: <span className="font-semibold text-gray-200">users/{uid || '...'}</span>
        </div>

        {toast && (
          <div
            className={[
              'fixed right-4 bottom-4 z-[10000]',
              'px-4 py-3 rounded-2xl border shadow-xl',
              toast.type === 'ok'
                ? 'bg-emerald-500/15 border-emerald-400/20 text-emerald-100'
                : toast.type === 'err'
                ? 'bg-rose-500/15 border-rose-400/20 text-rose-100'
                : 'bg-white/10 border-white/10 text-gray-100',
              'backdrop-blur-xl',
            ].join(' ')}
          >
            {toast.text}
          </div>
        )}
      </div>
    </div>
  )
}

/* =======================
   UI Helpers
======================= */

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={[
        'rounded-2xl px-4 py-2 text-sm font-semibold border transition',
        active ? 'bg-blue-600 text-white border-blue-500/40' : 'bg-white/5 text-gray-200 border-white/10 hover:bg-white/10',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-200">{label}</label>
      <input
        type={type}
        className="w-full rounded-2xl px-3 py-2.5 bg-white/10 border border-white/10 text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
       />
    </div>
  )
}

function Textarea({ label, value, onChange, placeholder }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-200">{label}</label>
      <textarea
        className="w-full rounded-2xl px-3 py-2.5 min-h-[96px] bg-white/10 border border-white/10 text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
       />
    </div>
  )
}

function Toggle({ label, desc, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3 bg-white/5 border border-white/10">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-100">{label}</div>
        {desc ? <div className="text-[11px] text-gray-400 mt-0.5">{desc}</div> : null}
      </div>

      <button
        onClick={() => onChange(!checked)}
        type="button"
        className={[
          'w-12 h-7 rounded-full relative border transition',
          checked ? 'bg-blue-500/70 border-blue-300/30' : 'bg-white/10 border-white/15',
        ].join(' ')}
        aria-pressed={checked}
        title={checked ? 'Ligado' : 'Desligado'}
      >
        <span
          className={[
            'absolute top-1 w-5 h-5 rounded-full bg-white transition-all',
            checked ? 'left-6' : 'left-1',
          ].join(' ')}
         />
      </button>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="h-10 rounded-2xl bg-white/10 border border-white/10 animate-pulse"  />
      <div className="h-10 rounded-2xl bg-white/10 border border-white/10 animate-pulse"  />
      <div className="h-24 rounded-2xl bg-white/10 border border-white/10 animate-pulse"  />
      <div className="h-10 rounded-2xl bg-white/10 border border-white/10 animate-pulse"  />
    </div>
  )
}
