'use client'

import { useEffect, useMemo, useState } from 'react'
import { ref, push, set, serverTimestamp } from 'firebase/database'
import { database } from '@/lib/firebase'
import { CATEGORIES, getCategoryLabel } from '@/constants/categories'

const MODOS = [
  { id: 'geral', label: 'Geral', help: 'Aceita corre ou profissional' },
  { id: 'corre', label: 'Corre rápido', help: 'Bicos, entregas e urgências simples' },
  { id: 'profissional', label: 'Profissional', help: 'Serviço técnico com agenda' },
]

const ALCANCES = [
  { id: 'normal', label: 'Normal', help: 'Entra na lista da região' },
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
  if (t.includes('vendo') || t.includes('ofereço') || t.includes('ofereco') || t.includes('oferta')) return 'oferta'
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
  // Alcance pago ainda não está liberado no produto. Mantemos a estrutura
  // pronta, mas a criação de pedido grava sempre como alcance normal.
  if (!ALCANCE_PAGO_LIBERADO) return null

  if (alcance === 'destaque') {
    return {
      level: 1,
      tipo: 'destaque',
      label: 'Destaque',
      until: agora + 30 * 60 * 1000,
      createdAt: agora,
      origem: 'criacao',
      by: { id: meuId || null, nome: meuNome || 'Anônimo' },
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
      by: { id: meuId || null, nome: meuNome || 'Anônimo' },
    }
  }

  return null
}

export default function ModalIA({ open, onClose, abrirCriacaoManual, meuNome: meuNomeProp, meuId: meuIdProp }) {
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
      return localStorage.getItem('meuNome') || 'Anônimo'
    } catch {
      return 'Anônimo'
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
  const tituloPreview = guessTitulo(mensagem) || 'Descreva o serviço que você precisa'
  const tipoPreview = guessTipo(mensagem)

  const sugestoes = useMemo(() => {
    const nomeCategoria = String(categoria?.label || 'serviço').toLowerCase()
    if (modoPedido === 'corre') {
      return [
        `Preciso de um corre rápido para ${nomeCategoria} hoje.`,
        `Busco alguém disponível agora na minha região.`,
        `Tenho um bico rápido e pago valor combinado.`,
      ]
    }
    if (modoPedido === 'profissional') {
      return [
        `Preciso de profissional para ${nomeCategoria}.`,
        `Quero agendar um serviço com horário combinado.`,
        `Procuro alguém verificado para resolver isso com segurança.`,
      ]
    }
    return [
      `Preciso de ajuda com ${nomeCategoria}.`,
      `Estou procurando alguém disponível perto de mim.`,
      `Serviço simples, valor a combinar.`,
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
      titulo: tituloPreview,
      descricao: mensagem.trim(),
      valor: valorFinal != null ? Number(valorFinal) : null,
      categoriaId: String(categoriaId || 'servicos_gerais'),
      status: 'aberto',
      local: local || null,
      criador: { nome: meuNome || 'Anônimo', id: meuId || null },
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
      setResposta(`Pedido publicado: ${getCategoryLabel(payload.categoriaId)}${payload.valor != null ? ` · ${formatMoney(payload.valor)}` : ''}`)
      setMensagem('')
      setValorDigitado('')
      setCategoriaId('servicos_gerais')
      setModoPedido('geral')
      setAlcance('normal')
      setUsarLocal(true)
    } catch (e) {
      console.error(e)
      setResposta('Não consegui publicar agora. Confira sua conexão e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const modeLabel = MODOS.find((m) => m.id === modoPedido)?.label || 'Geral'
  const alcanceLabel = ALCANCES.find((a) => a.id === alcance)?.label || 'Normal'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 px-3 py-4 backdrop-blur-md" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="relative w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/12 bg-[#07111f] text-white shadow-[0_30px_120px_rgba(0,0,0,0.65)]">
        <div className="border-b border-white/10 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-2xl font-black tracking-tight">Criar pedido</div>
              <div className="mt-1 max-w-xl text-sm leading-relaxed text-slate-400">Monte um pedido claro para aparecer melhor para quem está disponível na região.</div>
            </div>
            <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/8 text-xl font-black text-white hover:bg-white/15" type="button" title="Fechar">
              ×
            </button>
          </div>
        </div>

        <div className="grid max-h-[82vh] gap-0 overflow-y-auto md:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-4 p-5">
            <div>
              <div className="mb-2 px-1 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Tipo de atendimento</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {MODOS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModoPedido(m.id)}
                    className={modoPedido === m.id ? 'rounded-2xl border border-blue-400 bg-blue-500/18 p-3 text-left ring-2 ring-blue-500/25' : 'rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left hover:bg-white/[0.07]'}
                  >
                    <div className="text-sm font-black text-white">{m.label}</div>
                    <div className="mt-1 text-xs leading-snug text-slate-400">{m.help}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_0.8fr]">
              <label>
                <div className="mb-2 px-1 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Categoria</div>
                <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="h-12 w-full rounded-2xl border border-white/12 bg-slate-950 px-4 text-white outline-none focus:ring-2 focus:ring-blue-500/45">
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                </select>
              </label>

              <label>
                <div className="mb-2 px-1 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Valor opcional</div>
                <div className="flex h-12 items-center rounded-2xl border border-white/12 bg-slate-950 px-4 focus-within:ring-2 focus-within:ring-emerald-500/35">
                  <span className="mr-3 rounded-full bg-emerald-400/10 px-2 py-1 text-xs font-black text-emerald-200">R$</span>
                  <input value={valorDigitado} onChange={(e) => setValorDigitado(e.target.value)} placeholder="Ex: 80,00" className="min-w-0 flex-1 bg-transparent text-white placeholder:text-slate-600 outline-none" inputMode="decimal" />
                </div>
              </label>
            </div>

            <div>
              <div className="mb-2 px-1 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Descrição do pedido</div>
              <div className="relative">
                <textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value.slice(0, 260))}
                  placeholder="Ex: preciso trocar uma torneira hoje, bairro Centro, valor a combinar."
                  className="h-36 w-full resize-none rounded-3xl border border-white/12 bg-slate-950 p-4 pr-16 text-white placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/45"
                />
                <div className="absolute bottom-3 right-4 text-xs font-bold text-slate-600">{mensagem.length}/260</div>
              </div>
            </div>

            <div>
              <div className="mb-2 px-1 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Sugestões rápidas</div>
              <div className="flex flex-wrap gap-2">
                {sugestoes.map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setMensagem(s)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/[0.08] active:scale-[0.98]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 px-1 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Alcance</div>
              <div className="grid gap-2 sm:grid-cols-3">
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
                        ? 'cursor-not-allowed rounded-2xl border border-white/10 bg-white/[0.025] p-3 text-left opacity-55'
                        : alcance === a.id
                          ? 'rounded-2xl border border-emerald-300 bg-emerald-400/12 p-3 text-left ring-2 ring-emerald-400/20'
                          : 'rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left hover:bg-white/[0.07]'
                    }
                  >
                    <div className="text-sm font-black text-white">{a.label}</div>
                    <div className="mt-1 text-xs leading-snug text-slate-400">{a.help}</div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <aside className="border-t border-white/10 bg-white/[0.035] p-5 md:border-l md:border-t-0">
            <div className="sticky top-5 space-y-4">
              <section className="rounded-[26px] border border-white/10 bg-slate-950/80 p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Prévia</div>
                <h3 className="mt-3 text-xl font-black leading-tight text-white">{tituloPreview}</h3>
                <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-slate-400">{mensagem.trim() || 'Seu pedido aparece aqui antes de publicar.'}</p>

                <div className="mt-4 grid gap-2">
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2 text-sm">
                    <span className="text-slate-500">Tipo</span>
                    <b>{modeLabel}</b>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2 text-sm">
                    <span className="text-slate-500">Categoria</span>
                    <b className="truncate">{categoria?.emoji} {categoria?.label}</b>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2 text-sm">
                    <span className="text-slate-500">Valor</span>
                    <b>{formatMoney(valorFinal)}</b>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2 text-sm">
                    <span className="text-slate-500">Alcance</span>
                    <b>{alcanceLabel}</b>
                  </div>
                </div>
              </section>

              <label className="flex items-center justify-between gap-3 rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3">
                <span>
                  <span className="block text-sm font-black text-white">Usar localização</span>
                  <span className="block text-xs text-slate-500">Ajuda pessoas próximas a encontrar seu pedido.</span>
                </span>
                <input type="checkbox" checked={usarLocal} onChange={(e) => setUsarLocal(e.target.checked)} className="h-5 w-5 accent-blue-500" />
              </label>

              <button onClick={publicarPedido} disabled={loading || !mensagem.trim()} className="h-14 w-full rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)] transition hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50" type="button">
                {loading ? 'Publicando...' : 'Publicar pedido'}
              </button>

              {resposta ? (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-100">{resposta}</div>
              ) : null}

              {abrirCriacaoManual ? (
                <button type="button" onClick={() => abrirCriacaoManual?.()} className="text-sm font-semibold text-blue-300 underline underline-offset-4 hover:text-blue-200">
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
