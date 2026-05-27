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
      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 sm:mb-1.5 sm:text-xs sm:tracking-[0.14em]">
        {label}
      </div>
      {children}
      {hint ? <div className="mt-1 text-[11px] font-semibold text-slate-500">{hint}</div> : null}
    </label>
  )
}

const inputClass =
  'h-10 w-full rounded-xl border border-blue-100 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-300/70 focus:ring-4 focus:ring-blue-400/15 sm:h-12 sm:rounded-2xl sm:px-4'

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
    <main className="min-h-[100dvh] overflow-y-auto bg-[linear-gradient(135deg,#0b73ff_0%,#19b7c8_44%,#ffe36b_120%)] px-2.5 py-2.5 text-white sm:px-4 sm:py-6">
      <div className="pointer-events-none fixed inset-0 hidden bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,217,26,0.28),transparent_32%)] sm:block" />

      <div className="relative mx-auto flex min-h-[calc(100dvh-1rem)] w-full max-w-5xl items-start justify-center sm:min-h-[calc(100vh-3rem)] sm:items-center">
        <motion.form
          onSubmit={salvar}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="grid w-full overflow-hidden rounded-[24px] border border-white/35 bg-white/92 text-slate-950 shadow-[0_24px_80px_rgba(37,99,235,0.22)] backdrop-blur-2xl sm:rounded-[34px] lg:grid-cols-[0.9fr_1.1fr]"
        >
          <section className="border-b border-blue-100 bg-blue-50 p-3 sm:p-8 lg:border-b-0 lg:border-r">
            <div className="inline-flex rounded-full border border-blue-100 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 sm:text-[11px] sm:tracking-[0.18em]">
              Cadastro do app
            </div>
            <h1 className="mt-3 text-xl font-black leading-tight tracking-tight sm:mt-5 sm:text-4xl">
              Complete seu perfil para entrar.
            </h1>
            <p className="mt-2 text-xs leading-snug text-slate-600 sm:mt-3 sm:text-sm sm:leading-relaxed">
              O Corre Aqui usa esse cadastro para mostrar seu nome, sua cidade, suas conversas,
              pedidos, patentes e notificações no mesmo perfil.
            </p>

            <div className="mt-6 hidden gap-3 text-sm text-slate-700 sm:grid">
              <div className="rounded-2xl border border-blue-100 bg-white p-4">
                <b className="text-blue-950">Conta unica</b>
                <div className="mt-1 text-xs leading-relaxed text-slate-600">
                  Login, perfil, pedidos e chat ficam ligados ao mesmo usuario do Firebase.
                </div>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-white p-4">
                <b className="text-blue-950">Perfil reativavel</b>
                <div className="mt-1 text-xs leading-relaxed text-slate-600">
                  Depois você ajusta foto, patentes, serviços e configurações pelo perfil.
                </div>
              </div>
            </div>
          </section>

          <section className="p-3 sm:p-8">
            <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-4">
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

            <div className="mt-4 sm:mt-5">
              <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 sm:mb-2 sm:text-xs sm:tracking-[0.14em]">
                Como você quer começar?
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {Object.values(TIPOS_CONTA).map((tipo) => {
                  const active = form.tipoConta === tipo.id
                  return (
                    <button
                      key={tipo.id}
                      type="button"
                      onClick={() => setCampo('tipoConta', tipo.id)}
                      className={[
                        'min-h-[72px] rounded-xl border p-2 text-left transition active:scale-[0.98] sm:min-h-[112px] sm:rounded-[22px] sm:p-4',
                        active
                          ? 'border-blue-300 bg-blue-50 shadow-[0_18px_48px_rgba(37,99,235,0.12)]'
                          : 'border-blue-100 bg-white hover:bg-blue-50',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="line-clamp-2 text-[11px] font-black leading-tight text-blue-950 sm:text-sm">{tipo.titulo}</span>
                        <span
                          className={[
                            'grid h-5 w-5 place-items-center rounded-full border text-[10px] font-black',
                            active ? 'border-blue-200 bg-[#ffd91a] text-blue-950' : 'border-blue-100 text-transparent',
                          ].join(' ')}
                        >
                          OK
                        </span>
                      </div>
                      <p className="mt-1 hidden text-xs leading-relaxed text-slate-600 sm:block">{tipo.subtitulo}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <Field label="Resumo curto" hint="Opcional. Aparece na ficha quando você trabalha pelo app.">
              <textarea
                value={form.bio}
                onChange={(e) => setCampo('bio', e.target.value)}
                className={`${inputClass} mt-4 h-16 resize-none py-2.5 leading-snug sm:mt-5 sm:h-24 sm:py-3 sm:leading-relaxed`}
                placeholder="Ex: Faco entregas rapidas, montagem, limpeza ou manutencao."
                maxLength={180}
              />
            </Field>

            {erro ? (
              <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/12 px-4 py-3 text-sm font-bold text-rose-100">
                {erro}
              </div>
            ) : null}

            <div className="mt-4 flex flex-col gap-2 sm:mt-6 sm:flex-row sm:gap-3">
              <button
                type="submit"
                disabled={!podeSalvar}
                className="h-11 flex-1 rounded-[16px] bg-[#ffd91a] text-sm font-black text-blue-950 shadow-[0_14px_34px_rgba(245,158,11,0.24)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 sm:h-14 sm:rounded-[22px]"
              >
                {salvando ? 'Salvando perfil...' : 'Entrar no Corre Aqui'}
              </button>

              {onSair ? (
                <button
                  type="button"
                  onClick={onSair}
                  className="h-11 rounded-[16px] border border-blue-100 bg-blue-50 px-5 text-sm font-black text-blue-700 transition hover:bg-blue-100 sm:h-14 sm:rounded-[22px]"
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
