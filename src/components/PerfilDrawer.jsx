'use client'

import { useEffect, useMemo, useState } from 'react'
import { ref, onValue, update, serverTimestamp } from 'firebase/database'
import { database } from '@/lib/firebase'
import dynamic from 'next/dynamic'

const PlanosCorreAqui = dynamic(() => import('@/components/PlanosCorreAqui'), {
  ssr: false
})

const initialProfile = {
  nome: '',
  cidade: '',
  fotoURL: '',
  avatarEmoji: '',
  bio: '',
  visivel: true,
  notificacoes: true,
  isCorre: true,
  correTitulo: '',
  correBio: '',
  correTransporte: '',
  correRegiao: '',
  correDisponibilidade: '',
  correExperiencia: '',
  isProfissional: false,
  titulo: '',
  descricao: '',
  whatsapp: '',
  preco: '',
  profRegiao: '',
  profExperiencia: '',
  plano: 'Free'
}

const tabLabel = {
  perfil: 'Perfil',
  corre: 'Corre',
  profissional: 'Profissional',
  config: 'Config',
  monetizacao: 'Monetização'
}

const tabIcon = {
  perfil: '👤',
  corre: '⚡',
  profissional: '🧑‍🔧',
  config: '⚙️',
  monetizacao: '💎'
}


const planoInfo = {
  Free: {
    nome: 'Free',
    icon: '🟢',
    badge: 'bg-emerald-500/15 border-emerald-400/20 text-emerald-300',
    descricao: 'Use o Corre Aqui com anúncios leves e 0% de taxa por serviço.',
  },
  Pro: {
    nome: 'Pro',
    icon: '💎',
    badge: 'bg-blue-500/15 border-blue-400/20 text-blue-300',
    descricao: 'Mais visibilidade, menos anúncios e recursos para crescer no app.',
  },
  Ultra: {
    nome: 'Ultra',
    icon: '🚀',
    badge: 'bg-fuchsia-500/15 border-fuchsia-400/20 text-fuchsia-300',
    descricao: 'Destaque máximo, prioridade e ferramentas avançadas para profissionais.',
  },
}

function PlanoResumo({ plano = 'Free', onOpenPlanos }) {
  const atual = planoInfo[plano] || planoInfo.Free

  return (
    <div className="mt-4 w-full rounded-3xl bg-gradient-to-br from-emerald-500/10 via-slate-900/80 to-blue-500/10 border border-white/10 p-4 text-left shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] font-black text-emerald-300">
            Monetização justa
          </div>
          <div className="mt-1 text-sm font-extrabold text-white">
            💚 Sem taxa do app
          </div>
          <div className="mt-1 text-xs leading-relaxed text-slate-300">
            100% do valor combinado fica com quem faz o serviço. O app cresce com planos, boost e anúncios leves.
          </div>
        </div>

        <span className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-black border ${atual.badge}`}>
          {atual.icon} {atual.nome}
        </span>
      </div>

      <button
        type="button"
        onClick={onOpenPlanos}
        className="mt-3 w-full rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-3 text-sm font-extrabold text-white active:scale-[0.98] transition"
      >
        Ver planos e vantagens
      </button>
    </div>
  )
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      {children}
      {hint ? <div className="mt-1 text-[11px] text-slate-500">{hint}</div> : null}
    </label>
  )
}

function inputClass(extra = '') {
  return [
    'w-full rounded-2xl bg-slate-900/70 border border-white/10',
    'px-4 py-3 text-slate-100 placeholder:text-slate-500',
    'outline-none focus:ring-2 focus:ring-blue-500/35 focus:border-blue-400/50',
    'transition',
    extra,
  ].join(' ')
}

export default function PerfilDrawer({ open, onClose, uid }) {
  const [tab, setTab] = useState('perfil')

  const [profile, setProfile] = useState(initialProfile)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)

  const userBasePath = useMemo(() => (uid ? `users/${uid}` : ''), [uid])

  useEffect(() => {
    if (!open || !uid) return

    const pRef = ref(database, `${userBasePath}/profile`)

    return onValue(pRef, (snap) => {
      if (snap.exists()) {
        setProfile((prev) => {
          const data = snap.val() || {}
          const corre = data.corre || {}
          const profissional = data.profissional || {}

          return {
            ...prev,
            ...data,
            isCorre: data.isCorre ?? corre.ativo ?? prev.isCorre,
            correTitulo: data.correTitulo || corre.titulo || '',
            correBio: data.correBio || corre.bio || '',
            correTransporte: data.correTransporte || corre.transporte || '',
            correRegiao: data.correRegiao || corre.regiao || '',
            correDisponibilidade: data.correDisponibilidade || corre.disponibilidade || '',
            correExperiencia: data.correExperiencia || corre.experiencia || '',
            isProfissional: data.isProfissional ?? profissional.ativo ?? prev.isProfissional,
            titulo: data.titulo || profissional.titulo || '',
            descricao: data.descricao || profissional.descricao || '',
            whatsapp: data.whatsapp || profissional.whatsapp || '',
            preco: data.preco || profissional.preco || '',
            profRegiao: data.profRegiao || profissional.regiao || '',
            profExperiencia: data.profExperiencia || profissional.experiencia || '',
            fotoURL: data.fotoURL || data.photoURL || data.avatar || prev.fotoURL || '',
            photoURL: data.photoURL || data.fotoURL || data.avatar || prev.photoURL || '',
            avatar: data.avatar || data.fotoURL || data.photoURL || prev.avatar || '',
            plano: data.plano || data.assinatura?.plano || prev.plano || 'Free',
          }
        })
      }
    })
  }, [open, uid, userBasePath])

  const salvar = async () => {
    if (!uid) return

    setSalvando(true)
    setSalvo(false)

    try {
      const corre = {
        ativo: !!profile.isCorre,
        titulo: profile.correTitulo || 'Corre rápido',
        bio: profile.correBio || '',
        transporte: profile.correTransporte || '',
        regiao: profile.correRegiao || profile.cidade || '',
        disponibilidade: profile.correDisponibilidade || '',
        experiencia: profile.correExperiencia || '',
      }

      const profissional = {
        ativo: !!profile.isProfissional,
        titulo: profile.titulo || '',
        descricao: profile.descricao || '',
        preco: profile.preco || '',
        whatsapp: profile.whatsapp || '',
        regiao: profile.profRegiao || profile.cidade || '',
        experiencia: profile.profExperiencia || '',
      }

      const fotoPrincipal = profile.fotoURL || profile.photoURL || profile.avatar || ''

      await update(ref(database, `${userBasePath}/profile`), {
        ...profile,
        fotoURL: fotoPrincipal || null,
        photoURL: fotoPrincipal || null,
        avatar: fotoPrincipal || profile.avatarEmoji || '',
        corre: {
          ...corre,
          fotoURL: fotoPrincipal || null,
          photoURL: fotoPrincipal || null,
        },
        profissional: {
          ...profissional,
          fotoURL: fotoPrincipal || null,
          photoURL: fotoPrincipal || null,
        },
        atualizadoEm: serverTimestamp()
      })

      await update(ref(database, `${userBasePath}`), {
        nome: profile.nome,
        fotoURL: fotoPrincipal || null,
        photoURL: fotoPrincipal || null,
        avatar: fotoPrincipal || profile.avatarEmoji || '',
        avatarEmoji: profile.avatarEmoji || '',
        cidade: profile.cidade || '',
        bio: profile.bio || '',
        isCorre: !!profile.isCorre,
        corre: {
          ...corre,
          fotoURL: fotoPrincipal || null,
          photoURL: fotoPrincipal || null,
        },
        isProfissional: !!profile.isProfissional,
        profissional: profile.isProfissional ? {
          ...profissional,
          fotoURL: fotoPrincipal || null,
          photoURL: fotoPrincipal || null,
        } : null,
        plano: profile.plano || 'Free',
        assinatura: {
          plano: profile.plano || 'Free',
          origem: 'perfil',
          atualizadoEm: serverTimestamp()
        }
      })

      await update(ref(database, `usuariosOnline/${uid}`), {
        nome: profile.nome || '',
        fotoURL: fotoPrincipal || null,
        photoURL: fotoPrincipal || null,
        avatar: fotoPrincipal || profile.avatarEmoji || '',
        avatarEmoji: profile.avatarEmoji || '',
        cidade: profile.cidade || '',
        isCorre: !!profile.isCorre,
        isProfissional: !!profile.isProfissional,
        plano: profile.plano || 'Free',
        atualizadoEm: serverTimestamp()
      })

      setSalvo(true)
      setTimeout(() => setSalvo(false), 2200)
    } finally {
      setSalvando(false)
    }
  }

  if (!open) return null
  if (!uid) return null

  return (
    <div className="fixed inset-0 z-[9999]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <aside
        className="
          absolute right-0 top-0 h-full w-[min(94vw,520px)]
          bg-[#07111f] text-white
          border-l border-white/10
          shadow-[-30px_0_90px_rgba(0,0,0,0.45)]
          overflow-y-auto
        "
      >
        <div className="sticky top-0 z-10 bg-[#07111f]/92 backdrop-blur-xl border-b border-white/10">
          <div className="px-5 py-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-extrabold text-white">Meu perfil</div>
              <div className="text-xs text-slate-400">
                Configure como você aparece no Corre Aqui.
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-11 h-11 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-bold active:scale-[0.98] transition"
              title="Fechar"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-5">
          {/* FOTO + HEADER */}
          <div className="rounded-[28px] bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-white/10 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
            <div className="flex flex-col items-center text-center">
              <label className="cursor-pointer relative group">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return

                    const reader = new FileReader()
                    reader.onload = () => {
                      const fotoBase64 = reader.result || ''
                      setProfile(p => ({
                        ...p,
                        fotoURL: fotoBase64,
                        photoURL: fotoBase64,
                        avatar: fotoBase64,
                      }))
                    }
                    reader.readAsDataURL(file)
                  }}
                />

                {profile.fotoURL ? (
                  <img
                    src={profile.fotoURL}
                    className="w-28 h-28 rounded-full object-cover border-4 border-blue-500/80 shadow-2xl shadow-blue-500/20"
                    alt="Foto do perfil"
                  />
                ) : (
                  <div className="w-28 h-28 rounded-full bg-white/10 flex items-center justify-center text-4xl border border-white/20 shadow-2xl">
                    {profile.avatarEmoji || '📷'}
                  </div>
                )}

                <div className="absolute inset-0 rounded-full bg-black/45 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-xs font-bold">
                  Trocar foto
                </div>
              </label>

              <div className="mt-4 text-2xl font-extrabold text-white">
                {profile.nome || 'Seu nome'}
              </div>

              <div className="mt-1 text-sm text-slate-400">
                {profile.cidade || 'Cidade não informada'}
              </div>

              <PlanoResumo plano={profile.plano} onOpenPlanos={() => setTab('monetizacao')} />

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                  profile.visivel
                    ? 'bg-emerald-500/15 border-emerald-400/20 text-emerald-300'
                    : 'bg-slate-500/15 border-slate-400/20 text-slate-300'
                }`}>
                  {profile.visivel ? '🟢 Visível' : '⚫ Oculto'}
                </span>

                {profile.isProfissional && (
                  <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-blue-500/15 border border-blue-400/20 text-blue-300">
                    🧑‍🔧 Profissional
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* TABS */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-2">
            {['perfil', 'corre', 'profissional', 'config', 'monetizacao'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                type="button"
                className={[
                  'px-3 py-3 rounded-2xl text-sm font-extrabold border transition active:scale-[0.98]',
                  tab === t
                    ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20'
                    : 'bg-white/10 hover:bg-white/15 text-slate-200 border-white/10',
                ].join(' ')}
              >
                <span className="mr-1">{tabIcon[t]}</span>
                {tabLabel[t]}
              </button>
            ))}
          </div>

          {/* PERFIL */}
          {tab === 'perfil' && (
            <div className="mt-5 rounded-[28px] bg-white/[0.06] border border-white/10 p-4 space-y-4">
              <Field label="Nome">
                <input
                  value={profile.nome}
                  onChange={(e) => setProfile(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Seu nome"
                  className={inputClass()}
                />
              </Field>

              <Field label="Cidade">
                <input
                  value={profile.cidade}
                  onChange={(e) => setProfile(p => ({ ...p, cidade: e.target.value }))}
                  placeholder="Sua cidade"
                  className={inputClass()}
                />
              </Field>

              <Field label="Emoji do avatar" hint="Use quando ainda não tiver foto. Ex: 🙂, 🧑‍🔧, 🚗">
                <input
                  value={profile.avatarEmoji}
                  onChange={(e) => setProfile(p => ({ ...p, avatarEmoji: e.target.value }))}
                  placeholder="🙂"
                  className={inputClass()}
                />
              </Field>

              <Field label="Bio">
                <textarea
                  value={profile.bio}
                  onChange={(e) => setProfile(p => ({ ...p, bio: e.target.value }))}
                  placeholder="Fale um pouco sobre você"
                  className={inputClass('min-h-28 resize-y')}
                />
              </Field>
            </div>
          )}

          {/* CONFIG */}
          {tab === 'config' && (
            <div className="mt-5 rounded-[28px] bg-white/[0.06] border border-white/10 p-4 space-y-3">
              <label className="flex items-center justify-between gap-4 rounded-2xl bg-slate-900/70 border border-white/10 px-4 py-3">
                <div>
                  <div className="text-sm font-extrabold text-white">Visível no mapa</div>
                  <div className="text-xs text-slate-400">Permite que outros usuários encontrem você.</div>
                </div>
                <input
                  type="checkbox"
                  checked={profile.visivel}
                  onChange={(e) => setProfile(p => ({ ...p, visivel: e.target.checked }))}
                  className="w-5 h-5 accent-blue-600"
                />
              </label>

              <label className="flex items-center justify-between gap-4 rounded-2xl bg-slate-900/70 border border-white/10 px-4 py-3">
                <div>
                  <div className="text-sm font-extrabold text-white">Notificações</div>
                  <div className="text-xs text-slate-400">Receba avisos de pedidos, chat e aceite.</div>
                </div>
                <input
                  type="checkbox"
                  checked={profile.notificacoes}
                  onChange={(e) => setProfile(p => ({ ...p, notificacoes: e.target.checked }))}
                  className="w-5 h-5 accent-blue-600"
                />
              </label>
            </div>
          )}

          {/* CORRE */}
          {tab === 'corre' && (
            <div className="mt-5 rounded-[28px] bg-white/[0.06] border border-white/10 p-4 space-y-4">
              <label className="flex items-center justify-between gap-4 rounded-2xl bg-slate-900/70 border border-white/10 px-4 py-3">
                <div>
                  <div className="text-sm font-extrabold text-white">Ativar currículo de Corre</div>
                  <div className="text-xs text-slate-400">Apareça para bicos rápidos e pedidos do bairro.</div>
                </div>
                <input
                  type="checkbox"
                  checked={profile.isCorre}
                  onChange={(e) => setProfile(p => ({ ...p, isCorre: e.target.checked }))}
                  className="w-5 h-5 accent-blue-600"
                />
              </label>

              {profile.isCorre && (
                <div className="space-y-4">
                  <Field label="Título do Corre">
                    <input
                      value={profile.correTitulo}
                      onChange={(e) => setProfile(p => ({ ...p, correTitulo: e.target.value }))}
                      placeholder="Ex: Faço entregas rápidas, compras e pequenos corres"
                      className={inputClass()}
                    />
                  </Field>

                  <Field label="Resumo / currículo do Corre">
                    <textarea
                      value={profile.correBio}
                      onChange={(e) => setProfile(p => ({ ...p, correBio: e.target.value }))}
                      placeholder="Conte que tipo de corre você faz, como trabalha e sua experiência."
                      className={inputClass('min-h-28 resize-y')}
                    />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Transporte">
                      <select
                        value={profile.correTransporte}
                        onChange={(e) => setProfile(p => ({ ...p, correTransporte: e.target.value }))}
                        className={inputClass()}
                      >
                        <option value="" className="text-black">Selecione</option>
                        <option value="A pé" className="text-black">🚶 A pé</option>
                        <option value="Bike" className="text-black">🚲 Bike</option>
                        <option value="Moto" className="text-black">🏍️ Moto</option>
                        <option value="Carro" className="text-black">🚗 Carro</option>
                        <option value="Van" className="text-black">🚐 Van</option>
                      </select>
                    </Field>

                    <Field label="Região que atende">
                      <input
                        value={profile.correRegiao}
                        onChange={(e) => setProfile(p => ({ ...p, correRegiao: e.target.value }))}
                        placeholder="Ex: Nova Iguaçu, Centro, bairros próximos"
                        className={inputClass()}
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Disponibilidade">
                      <input
                        value={profile.correDisponibilidade}
                        onChange={(e) => setProfile(p => ({ ...p, correDisponibilidade: e.target.value }))}
                        placeholder="Ex: Noites, fins de semana, qualquer hora"
                        className={inputClass()}
                      />
                    </Field>

                    <Field label="Experiência">
                      <input
                        value={profile.correExperiencia}
                        onChange={(e) => setProfile(p => ({ ...p, correExperiencia: e.target.value }))}
                        placeholder="Ex: 2 anos fazendo entregas e compras"
                        className={inputClass()}
                      />
                    </Field>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PROFISSIONAL */}
          {tab === 'profissional' && (
            <div className="mt-5 rounded-[28px] bg-white/[0.06] border border-white/10 p-4 space-y-4">
              <label className="flex items-center justify-between gap-4 rounded-2xl bg-slate-900/70 border border-white/10 px-4 py-3">
                <div>
                  <div className="text-sm font-extrabold text-white">Modo profissional</div>
                  <div className="text-xs text-slate-400">Apareça na lista de profissionais para clientes.</div>
                </div>
                <input
                  type="checkbox"
                  checked={profile.isProfissional}
                  onChange={(e) => setProfile(p => ({ ...p, isProfissional: e.target.checked }))}
                  className="w-5 h-5 accent-blue-600"
                />
              </label>

              {profile.isProfissional && (
                <div className="space-y-4">
                  <Field label="Título profissional">
                    <input
                      value={profile.titulo}
                      onChange={(e) => setProfile(p => ({ ...p, titulo: e.target.value }))}
                      placeholder="Ex: Eletricista, entregador, diarista..."
                      className={inputClass()}
                    />
                  </Field>

                  <Field label="Descrição do serviço">
                    <textarea
                      value={profile.descricao}
                      onChange={(e) => setProfile(p => ({ ...p, descricao: e.target.value }))}
                      placeholder="Conte o que você faz, região que atende e diferenciais."
                      className={inputClass('min-h-28 resize-y')}
                    />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Preço base">
                      <input
                        value={profile.preco}
                        onChange={(e) => setProfile(p => ({ ...p, preco: e.target.value }))}
                        placeholder="Ex: 50"
                        inputMode="decimal"
                        className={inputClass()}
                      />
                    </Field>

                    <Field label="WhatsApp">
                      <input
                        value={profile.whatsapp}
                        onChange={(e) => setProfile(p => ({ ...p, whatsapp: e.target.value }))}
                        placeholder="21999999999"
                        inputMode="tel"
                        className={inputClass()}
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Região profissional">
                      <input
                        value={profile.profRegiao}
                        onChange={(e) => setProfile(p => ({ ...p, profRegiao: e.target.value }))}
                        placeholder="Ex: Baixada, Centro, Zona Norte"
                        className={inputClass()}
                      />
                    </Field>

                    <Field label="Experiência profissional">
                      <input
                        value={profile.profExperiencia}
                        onChange={(e) => setProfile(p => ({ ...p, profExperiencia: e.target.value }))}
                        placeholder="Ex: 5 anos como eletricista"
                        className={inputClass()}
                      />
                    </Field>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MONETIZAÇÃO */}
          {tab === 'monetizacao' && (
            <div className="mt-5 space-y-4">
              <div className="rounded-[28px] bg-gradient-to-br from-emerald-500/10 via-slate-900/80 to-blue-500/10 border border-white/10 p-4">
                <div className="text-lg font-black text-white">💚 Corre Aqui sem taxa</div>
                <div className="mt-1 text-sm leading-relaxed text-slate-300">
                  O trabalhador fica com 100% do valor do serviço. A monetização fica organizada por planos, anúncios leves e boost de destaque.
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {['Free', 'Pro', 'Ultra'].map((plano) => {
                    const item = planoInfo[plano]
                    const ativo = (profile.plano || 'Free') === plano

                    return (
                      <button
                        key={plano}
                        type="button"
                        onClick={() => setProfile(p => ({ ...p, plano }))}
                        className={[
                          'rounded-2xl border px-3 py-3 text-left active:scale-[0.98] transition',
                          ativo
                            ? 'bg-blue-600/20 border-blue-400/50 shadow-lg shadow-blue-500/10'
                            : 'bg-slate-900/70 border-white/10 hover:bg-white/10'
                        ].join(' ')}
                      >
                        <div className="text-sm font-black text-white">{item.icon} {item.nome}</div>
                        <div className="mt-1 text-[11px] leading-relaxed text-slate-400">{item.descricao}</div>
                        {ativo ? <div className="mt-2 text-[11px] font-black text-emerald-300">Plano atual ✅</div> : null}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-[28px] bg-white/[0.06] border border-white/10 p-4">
                <PlanosCorreAqui planoAtual={profile.plano || 'Free'} onSelecionarPlano={(plano) => setProfile(p => ({ ...p, plano }))} />
              </div>
            </div>
          )}

          <button
            onClick={salvar}
            disabled={salvando}
            className="
              w-full mt-5 py-4 rounded-3xl
              bg-gradient-to-r from-blue-600 to-indigo-600
              hover:from-blue-500 hover:to-indigo-500
              text-white font-extrabold
              shadow-[0_18px_60px_rgba(37,99,235,0.28)]
              disabled:opacity-60 disabled:cursor-not-allowed
              active:scale-[0.98] transition
            "
            type="button"
          >
            {salvando ? 'Salvando…' : salvo ? 'Salvo ✅' : 'Salvar'}
          </button>

          <div className="h-8" />
        </div>
      </aside>
    </div>
  )
}
