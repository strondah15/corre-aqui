'use client'

import { useEffect, useMemo, useState } from 'react'
import { ref, push, set, serverTimestamp } from 'firebase/database'
import { database } from '@/lib/firebase'
import { CATEGORIES } from '@/constants/categories'

const MODOS = [
  { id: 'geral', label: 'Geral', help: 'Aceita corre ou profissional' },
  { id: 'corre', label: 'Corre rapido', help: 'Bicos, entregas e urgencias simples' },
  { id: 'profissional', label: 'Profissional', help: 'Servico tecnico com agenda' },
]

const ALCANCES = [
  { id: 'normal', label: 'Normal', help: 'Entra na lista da regiao' },
  { id: 'destaque', label: 'Destaque (em breve)', help: 'Recurso futuro', disabled: true },
  { id: 'emergencia', label: 'Urgente (em breve)', help: 'Recurso futuro', disabled: true },
]

const ALCANCE_PAGO_LIBERADO = false

function parseValor(texto) {
  if (!texto) return null
  const m = String(texto).match(/(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*reais)?/i)
  if (!m) return null
  const num = Number(m[1].replace(',', '.'))
  return Number.isFinite(num) ? num : null
}

function parseValorDigitado(v) {
  const s = String(v || '').trim()
  if (!s) return null
  const n = Number(s.replace(/[^\d,.]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function guessTipo(texto) {
  const t = String(texto).toLowerCase()
  if (t.includes('vendo') || t.includes('ofereco') || t.includes('oferta')) return 'oferta'
  return 'pedido'
}

function guessTitulo(texto) {
  const s = String(texto || '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  return s.length > 48 ? `${s.slice(0, 48)}...` : s
}

function formatMoney(v) {
  if (v == null) return 'A combinar'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function getLoc() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  })
}

function buildBoost({ alcance, agora, meuId, meuNome }) {
  if (!ALCANCE_PAGO_LIBERADO) return null

  if (alcance === 'destaque') {
    return {
      level: 1,
      tipo: 'destaque',
      label: 'Destaque',
      until: agora + 30 * 60 * 1000,
      createdAt: agora,
      origem: 'criacao',
      by: { id: meuId || null, nome: meuNome || 'Anonimo' },
    }
  }

  if (alcance === 'emergencia') {
    return {
      level: 2,
      tipo: 'emergencia',
      label: 'Urgente',
      until: agora + 20 * 60 * 1000,
      createdAt: agora,
      origem: 'criacao',
      by: { id: meuId || null, nome: meuNome || 'Anonimo' },
    }
  }

  return null
}

export default function ModalIA({ open, onClose, abrirCriacaoManual, meuNome: meuNomeProp, meuId: meuIdProp }) {
  const [tituloManual, setTituloManual] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [valorDigitado, setValorDigitado] = useState('')
  const [resposta, setResposta] = useState('')
  const [loading, setLoading] = useState(false)
  const [categoriaId, setCategoriaId] = useState('servicos_gerais')
  const [modoPedido, setModoPedido] = useState('geral')
  const [alcance, setAlcance] = useState('normal')
  const [usarLocal, setUsarLocal] = useState(true)

  const meuNome = useMemo(() => {
    if (meuNomeProp) return meuNomeProp
    try {
      return localStorage.getItem('meuNome') || 'Anonimo'
    } catch {
      return 'Anonimo'
    }
  }, [meuNomeProp])

  const meuId = useMemo(() => {
    if (meuIdProp) return meuIdProp
    try {
      return localStorage.getItem('meuId') || ''
    } catch {
      return ''
    }
  }, [meuIdProp])

  useEffect(() => {
    if (!open) return
    setTituloManual('')
    setMensagem('')
    setValorDigitado('')
    setResposta('')
    setCategoriaId('servicos_gerais')
    setModoPedido('geral')
    setAlcance('normal')
    setUsarLocal(true)
  }, [open])

  const categoria = useMemo(() => CATEGORIES.find((c) => c.id === categoriaId) || CATEGORIES[0], [categoriaId])
  const valorAuto = useMemo(() => parseValor(mensagem), [mensagem])
  const valorManual = useMemo(() => parseValorDigitado(valorDigitado), [valorDigitado])
  const valorFinal = valorManual != null ? valorManual : valorAuto
  const tituloPreview = guessTitulo(mensagem) || 'Descreva o servico que voce precisa'
  const tituloFinal = (tituloManual.trim() || tituloPreview).slice(0, 80)
  const tipoPreview = guessTipo(mensagem)

  const sugestoes = useMemo(() => {
    const nomeCategoria = String(categoria?.label || 'servico').toLowerCase()
    if (modoPedido === 'corre') {
      return [
        `Preciso de um corre rapido para ${nomeCategoria} hoje.`,
        'Busco alguem disponivel agora na minha regiao.',
        'Tenho um bico rapido e pago valor combinado.',
      ]
    }
    if (modoPedido === 'profissional') {
      return [
        `Preciso de profissional para ${nomeCategoria}.`,
        'Quero agendar um servico com horario combinado.',
        'Procuro alguem para resolver isso com seguranca.',
      ]
    }
    return [
      `Preciso de ajuda com ${nomeCategoria}.`,
      'Estou procurando alguem disponivel perto de mim.',
      'Servico simples, valor a combinar.',
    ]
  }, [categoria?.label, modoPedido])

  if (!open) return null

  async function criarNoFirebase({ local }) {
    const agora = Date.now()
    const novo = push(ref(database, 'pedidos'))
    const alcancePublicavel = ALCANCE_PAGO_LIBERADO ? alcance : 'normal'
    const boost = buildBoost({ alcance: alcancePublicavel, agora, meuId, meuNome })

    const payload = {
      id: novo.key,
      tipo: tipoPreview,
      modoPedido,
      titulo: tituloFinal,
      descricao: mensagem.trim(),
      valor: valorFinal != null ? Number(valorFinal) : null,
      categoriaId: String(categoriaId || 'servicos_gerais'),
      status: 'aberto',
      local: local || null,
      criador: { nome: meuNome || 'Anonimo', id: meuId || null },
      urgencia: 'normal',
      emergencia: false,
      destaque: false,
      prioridade: 'normal',
      boost,
      criadoEm: agora,
      atualizadoEm: agora,
      criadoEmServer: serverTimestamp(),
      atualizadoEmServer: serverTimestamp(),
    }

    try {
      window?.dispatchEvent?.(new CustomEvent('correaqui:pedido-criado', {
        detail: { pedido: payload, otimista: true },
      }))
    } catch {}

    await set(novo, payload)

    try {
      window?.dispatchEvent?.(new CustomEvent('correaqui:pedido-confirmado', {
        detail: { id: payload.id },
      }))
    } catch {}

    return payload
  }

  async function publicarPedido() {
    const msg = mensagem.trim()
    if (!msg || loading) return
    setLoading(true)
    setResposta('')

    try {
      const local = usarLocal ? await getLoc() : null
      const payload = await criarNoFirebase({ local })
      const labelCategoria = CATEGORIES.find((c) => c.id === payload.categoriaId)?.label || 'Servico'
      setResposta(`Pedido publicado: ${labelCategoria}${payload.valor != null ? ` - ${formatMoney(payload.valor)}` : ''}`)
      setTituloManual('')
      setMensagem('')
      setValorDigitado('')
      setCategoriaId('servicos_gerais')
      setModoPedido('geral')
      setAlcance('normal')
      setUsarLocal(true)
    } catch (e) {
      console.error(e)
      setResposta('Nao consegui publicar agora. Confira sua conexao e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const modeLabel = MODOS.find((m) => m.id === modoPedido)?.label || 'Geral'
  const alcanceLabel = ALCANCES.find((a) => a.id === alcance)?.label || 'Normal'

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-950/62 px-2 py-2 backdrop-blur-md md:items-center md:px-4 md:py-5"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div className="relative w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/70 bg-white text-slate-950 shadow-[0_30px_120px_rgba(15,23,42,0.45)] md:rounded-[36px]">
        <div className="relative overflow-hidden bg-[linear-gradient(135deg,#0b73ff_0%,#17b9cd_50%,#ffe01b_118%)] p-4 text-white md:p-6">
          <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-white/16" />
          <div className="pointer-events-none absolute -right-10 top-0 h-56 w-40 rotate-12 rounded-[48px] bg-yellow-100/35" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex rounded-full bg-[#ffd91a] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-950">
                Corre Aqui
              </div>
              <div className="mt-3 text-3xl font-black tracking-tight text-white drop-shadow-sm md:text-5xl">
                Novo pedido
              </div>
              <div className="mt-1 max-w-xl text-sm font-bold leading-relaxed text-white/90 md:text-base">
                Publique em poucos passos e acompanhe tudo pelo chat.
              </div>
            </div>
            <button
              onClick={onClose}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/55 bg-white/90 text-base font-black text-blue-950 shadow-[0_12px_26px_rgba(15,23,42,0.18)] transition hover:bg-white active:scale-[0.97] md:h-12 md:w-12 md:rounded-[20px]"
              type="button"
              title="Fechar"
            >
              X
            </button>
          </div>
        </div>

        <div className="grid max-h-[86dvh] gap-0 overflow-y-auto bg-white md:max-h-[82vh] md:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-3 p-3 md:space-y-4 md:p-5">
            <div>
              <div className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700 md:mb-2 md:text-xs md:tracking-[0.16em]">Tipo de atendimento</div>
              <div className="grid grid-cols-3 gap-1.5 md:gap-2">
                {MODOS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModoPedido(m.id)}
                    className={modoPedido === m.id ? 'rounded-2xl border border-yellow-300 bg-[#ffd91a] p-2 text-left text-blue-950 shadow-[0_12px_28px_rgba(245,158,11,0.22)] ring-2 ring-yellow-200 md:p-3' : 'rounded-2xl border border-slate-200 bg-slate-50 p-2 text-left text-slate-800 transition hover:bg-blue-50 md:p-3'}
                  >
                    <div className="line-clamp-1 text-[11px] font-black md:text-sm">{m.label}</div>
                    <div className="mt-1 hidden text-xs leading-snug text-slate-500 md:block">{m.help}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2.5 md:grid-cols-[1fr_0.8fr] md:gap-3">
              <label>
                <div className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700 md:mb-2 md:text-xs md:tracking-[0.16em]">Categoria</div>
                <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/35 md:h-12 md:px-4">
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>

              <label>
                <div className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700 md:mb-2 md:text-xs md:tracking-[0.16em]">Valor opcional</div>
                <div className="flex h-11 items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 focus-within:ring-2 focus-within:ring-emerald-500/30 md:h-12 md:px-4">
                  <span className="mr-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-700 md:mr-3 md:py-1 md:text-xs">R$</span>
                  <input value={valorDigitado} onChange={(e) => setValorDigitado(e.target.value)} placeholder="Ex: 80,00" className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none md:text-base" inputMode="decimal" />
                </div>
              </label>
            </div>

            <label>
              <div className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700 md:mb-2 md:text-xs md:tracking-[0.16em]">Titulo curto</div>
              <input
                value={tituloManual}
                onChange={(e) => setTituloManual(e.target.value.slice(0, 80))}
                placeholder="Ex: trocar torneira hoje"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/35 md:h-12 md:px-4 md:text-base"
              />
            </label>

            <div>
              <div className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700 md:mb-2 md:text-xs md:tracking-[0.16em]">Descricao do pedido</div>
              <div className="relative">
                <textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value.slice(0, 260))}
                  placeholder="Ex: preciso trocar uma torneira hoje, bairro Centro, valor a combinar."
                  className="h-28 w-full resize-none rounded-[22px] border border-slate-200 bg-slate-50 p-3 pr-14 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/35 md:h-36 md:rounded-[28px] md:p-4 md:pr-16 md:text-base"
                />
                <div className="absolute bottom-2 right-3 text-[10px] font-black text-slate-400 md:bottom-3 md:right-4 md:text-xs">{mensagem.length}/260</div>
              </div>
            </div>

            <div>
              <div className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700 md:mb-2 md:text-xs md:tracking-[0.16em]">Sugestoes rapidas</div>
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-wrap md:gap-2 [&::-webkit-scrollbar]:hidden">
                {sugestoes.map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setMensagem(s)}
                    className="shrink-0 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[11px] font-black text-blue-950 transition hover:bg-blue-100 active:scale-[0.98] md:py-2 md:text-xs"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700 md:mb-2 md:text-xs md:tracking-[0.16em]">Alcance</div>
              <div className="grid grid-cols-3 gap-1.5 md:gap-2">
                {ALCANCES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      if (!a.disabled) setAlcance(a.id)
                    }}
                    disabled={a.disabled}
                    className={
                      a.disabled
                        ? 'cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-50 p-2 text-left opacity-55 md:p-3'
                        : alcance === a.id
                          ? 'rounded-2xl border border-emerald-200 bg-emerald-50 p-2 text-left text-emerald-900 ring-2 ring-emerald-100 md:p-3'
                          : 'rounded-2xl border border-slate-200 bg-slate-50 p-2 text-left text-slate-800 hover:bg-blue-50 md:p-3'
                    }
                  >
                    <div className="line-clamp-1 text-[11px] font-black md:text-sm">{a.label}</div>
                    <div className="mt-1 hidden text-xs leading-snug text-slate-500 md:block">{a.help}</div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <aside className="border-t border-slate-100 bg-[#f4f8ff] p-3 md:border-l md:border-t-0 md:p-5">
            <div className="sticky top-5 space-y-3 md:space-y-4">
              <section className="relative overflow-hidden rounded-[24px] bg-[#ffdf2e] p-4 text-blue-950 shadow-[0_18px_44px_rgba(245,158,11,0.24)] md:rounded-[30px] md:p-5">
                <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-[42px] bg-white/28 rotate-12" />
                <div className="relative">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-950/70 md:text-[11px]">Previa</div>
                  <h3 className="mt-2 line-clamp-2 text-xl font-black leading-tight md:mt-3 md:text-3xl">{tituloFinal}</h3>
                  <p className="mt-2 line-clamp-3 text-xs font-bold leading-relaxed text-blue-950/70 md:text-sm">{mensagem.trim() || 'Seu pedido aparece aqui antes de publicar.'}</p>

                  <div className="mt-4 grid gap-2">
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/78 px-3 py-2 text-xs font-black md:text-sm">
                      <span className="text-blue-950/58">Tipo</span>
                      <b>{modeLabel}</b>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/78 px-3 py-2 text-xs font-black md:text-sm">
                      <span className="text-blue-950/58">Categoria</span>
                      <b className="truncate">{categoria?.label}</b>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/78 px-3 py-2 text-xs font-black md:text-sm">
                      <span className="text-blue-950/58">Valor</span>
                      <b>{formatMoney(valorFinal)}</b>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/78 px-3 py-2 text-xs font-black md:text-sm">
                      <span className="text-blue-950/58">Alcance</span>
                      <b>{alcanceLabel}</b>
                    </div>
                  </div>
                </div>
              </section>

              <label className="flex items-center justify-between gap-3 rounded-[22px] border border-blue-100 bg-white px-3 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)] md:px-4">
                <span>
                  <span className="block text-sm font-black text-blue-950">Usar localizacao</span>
                  <span className="block text-xs font-semibold text-slate-500">Ajuda pessoas proximas a encontrar seu pedido.</span>
                </span>
                <input type="checkbox" checked={usarLocal} onChange={(e) => setUsarLocal(e.target.checked)} className="h-5 w-5 accent-blue-600" />
              </label>

              <button onClick={publicarPedido} disabled={loading || !mensagem.trim()} className="h-12 w-full rounded-[22px] bg-blue-700 px-4 text-sm font-black text-white shadow-[0_18px_45px_rgba(37,99,235,0.32)] transition hover:bg-blue-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 md:h-14" type="button">
                {loading ? 'Publicando...' : 'Publicar pedido'}
              </button>

              {resposta ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-black text-emerald-800">{resposta}</div>
              ) : null}

              {abrirCriacaoManual ? (
                <button type="button" onClick={() => abrirCriacaoManual?.()} className="text-sm font-black text-blue-700 underline underline-offset-4 hover:text-blue-900">
                  Criar manualmente
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
