'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  perfilInicialFromAuth,
  salvarCadastroPerfil,
  TIPOS_CONTA,
} from '@/lib/perfilCadastro'

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      {children}
      {hint ? <div className="mt-1 text-[11px] font-semibold text-slate-500">{hint}</div> : null}
    </label>
  )
}

const inputClass =
  'h-12 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-400/10'

export default function CadastroPerfilInicial({
  uid,
  authUser,
  userData,
  onSaved,
  onSair,
}) {
  const initial = useMemo(() => perfilInicialFromAuth(userData, authUser), [userData, authUser])
  const [form, setForm] = useState(initial)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    setForm(initial)
  }, [initial])

  const nomeOk = String(form.nome || '').trim().length >= 2
  const cidadeOk = String(form.cidade || '').trim().length >= 2
  const podeSalvar = nomeOk && cidadeOk && !salvando

  const setCampo = (campo, valor) => {
    setErro('')
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  const salvar = async (event) => {
    event.preventDefault()
    if (!podeSalvar) {
      setErro('Preencha nome e cidade para entrar no Corre Aqui.')
      return
    }

    try {
      setSalvando(true)
      const perfil = await salvarCadastroPerfil({ uid, authUser, form })
      onSaved?.(perfil)
    } catch (err) {
      console.error(err)
      setErro(err?.message || 'Não foi possível concluir o cadastro agora.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <main className="min-h-[100dvh] overflow-y-auto bg-[#050914] px-3 py-3 text-white sm:px-4 sm:py-6">
      <div className="pointer-events-none fixed inset-0 hidden bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.18),transparent_32%)] sm:block" />

      <div className="relative mx-auto flex min-h-[calc(100dvh-1.5rem)] w-full max-w-5xl items-start justify-center sm:min-h-[calc(100vh-3rem)] sm:items-center">
        <motion.form
          onSubmit={salvar}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="grid w-full overflow-hidden rounded-[24px] border border-white/10 bg-[#0b1422] shadow-[0_18px_55px_rgba(0,0,0,0.32)] sm:rounded-[34px] sm:bg-[#0b1422]/92 sm:shadow-[0_34px_120px_rgba(0,0,0,0.48)] sm:backdrop-blur-2xl lg:grid-cols-[0.9fr_1.1fr]"
        >
          <section className="border-b border-white/10 bg-white/[0.03] p-4 sm:p-8 lg:border-b-0 lg:border-r">
            <div className="inline-flex rounded-full border border-cyan-300/15 bg-cyan-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100">
              Cadastro do app
            </div>
            <h1 className="mt-4 text-2xl font-black leading-tight tracking-tight sm:mt-5 sm:text-4xl">
              Complete seu perfil para entrar.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              O Corre Aqui usa esse cadastro para mostrar seu nome, sua cidade, suas conversas,
              pedidos, patentes e notificações no mesmo perfil.
            </p>

            <div className="mt-6 hidden gap-3 text-sm text-slate-300 sm:grid">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <b className="text-white">Conta unica</b>
                <div className="mt-1 text-xs leading-relaxed text-slate-400">
                  Login, perfil, pedidos e chat ficam ligados ao mesmo usuario do Firebase.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <b className="text-white">Perfil reativavel</b>
                <div className="mt-1 text-xs leading-relaxed text-slate-400">
                  Depois você ajusta foto, patentes, serviços e configurações pelo perfil.
                </div>
              </div>
            </div>
          </section>

          <section className="p-4 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome no app">
                <input
                  value={form.nome}
                  onChange={(e) => setCampo('nome', e.target.value)}
                  className={inputClass}
                  placeholder="Ex: Robson Gomes"
                  autoComplete="name"
                />
              </Field>

              <Field label="Cidade / regiao">
                <input
                  value={form.cidade}
                  onChange={(e) => setCampo('cidade', e.target.value)}
                  className={inputClass}
                  placeholder="Ex: Nova Iguacu"
                  autoComplete="address-level2"
                />
              </Field>

              <Field label="WhatsApp" hint="Opcional, usado no perfil profissional.">
                <input
                  value={form.whatsapp}
                  onChange={(e) => setCampo('whatsapp', e.target.value)}
                  className={inputClass}
                  placeholder="DDD + numero"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </Field>

              <Field label="Avatar" hint="Opcional. Pode trocar depois.">
                <input
                  value={form.avatarEmoji}
                  onChange={(e) => setCampo('avatarEmoji', e.target.value)}
                  className={inputClass}
                  placeholder="🙂"
                  maxLength={4}
                />
              </Field>
            </div>

            <div className="mt-5">
              <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                Como você quer começar?
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {Object.values(TIPOS_CONTA).map((tipo) => {
                  const active = form.tipoConta === tipo.id
                  return (
                    <button
                      key={tipo.id}
                      type="button"
                      onClick={() => setCampo('tipoConta', tipo.id)}
                      className={[
                        'min-h-[84px] rounded-[18px] border p-3 text-left transition active:scale-[0.98] sm:min-h-[112px] sm:rounded-[22px] sm:p-4',
                        active
                          ? 'border-cyan-300/60 bg-cyan-400/14 shadow-[0_18px_48px_rgba(34,211,238,0.12)]'
                          : 'border-white/10 bg-white/[0.045] hover:bg-white/[0.07]',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black text-white">{tipo.titulo}</span>
                        <span
                          className={[
                            'grid h-5 w-5 place-items-center rounded-full border text-[10px] font-black',
                            active ? 'border-cyan-200 bg-cyan-300 text-slate-950' : 'border-white/15 text-transparent',
                          ].join(' ')}
                        >
                          OK
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-slate-400">{tipo.subtitulo}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <Field label="Resumo curto" hint="Opcional. Aparece na ficha quando você trabalha pelo app.">
              <textarea
                value={form.bio}
                onChange={(e) => setCampo('bio', e.target.value)}
                className={`${inputClass} mt-5 h-20 resize-none py-3 leading-relaxed sm:h-24`}
                placeholder="Ex: Faco entregas rapidas, montagem, limpeza ou manutencao."
                maxLength={180}
              />
            </Field>

            {erro ? (
              <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/12 px-4 py-3 text-sm font-bold text-rose-100">
                {erro}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={!podeSalvar}
                className="h-12 flex-1 rounded-[20px] bg-gradient-to-r from-blue-600 to-cyan-500 text-sm font-black text-white shadow-[0_14px_34px_rgba(37,99,235,0.28)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 sm:h-14 sm:rounded-[22px] sm:shadow-[0_18px_48px_rgba(37,99,235,0.35)]"
              >
                {salvando ? 'Salvando perfil...' : 'Entrar no Corre Aqui'}
              </button>

              {onSair ? (
                <button
                  type="button"
                  onClick={onSair}
                  className="h-12 rounded-[20px] border border-white/10 bg-white/[0.045] px-5 text-sm font-black text-white/70 transition hover:bg-white/[0.07] sm:h-14 sm:rounded-[22px]"
                >
                  Sair
                </button>
              ) : null}
            </div>
          </section>
        </motion.form>
      </div>
    </main>
  )
}
