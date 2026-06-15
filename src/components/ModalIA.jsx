'use client'

import { useEffect, useMemo, useState } from 'react'
import { ref, push, set, serverTimestamp } from 'firebase/database'
import { database } from '@/lib/firebase'
import { CATEGORIES } from '@/constants/categories'

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
  return s.length > 54 ? `${s.slice(0, 54)}...` : s
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
      { enableHighAccuracy: true, timeout: 10000 },
    )
  })
}

export default function ModalIA({ open, onClose, abrirCriacaoManual, meuNome: meuNomeProp, meuId: meuIdProp }) {
  const [tituloManual, setTituloManual] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [valorDigitado, setValorDigitado] = useState('')
  const [resposta, setResposta] = useState('')
  const [loading, setLoading] = useState(false)
  const [categoriaId, setCategoriaId] = useState('servicos_gerais')
  const [usarLocal, setUsarLocal] = useState(true)
  const [detalhesAbertos, setDetalhesAbertos] = useState(false)

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
    setUsarLocal(true)
    setDetalhesAbertos(false)
  }, [open])

  const categoria = useMemo(() => CATEGORIES.find((c) => c.id === categoriaId) || CATEGORIES[0], [categoriaId])
  const valorAuto = useMemo(() => parseValor(mensagem), [mensagem])
  const valorManual = useMemo(() => parseValorDigitado(valorDigitado), [valorDigitado])
  const valorFinal = valorManual != null ? valorManual : valorAuto
  const tituloFinal = (tituloManual.trim() || guessTitulo(mensagem) || 'Pedido rapido').slice(0, 80)
  const tipoPreview = guessTipo(mensagem)

  const sugestoes = useMemo(() => {
    const nomeCategoria = String(categoria?.label || 'servico').toLowerCase()
    return [
      `Preciso de ajuda com ${nomeCategoria}.`,
      'Procuro alguem disponivel perto de mim.',
      'Servico rapido, valor a combinar.',
    ]
  }, [categoria?.label])

  if (!open) return null

  async function criarNoFirebase({ local }) {
    const agora = Date.now()
    const novo = push(ref(database, 'pedidos'))
    const payload = {
      id: novo.key,
      tipo: tipoPreview,
      modoPedido: 'geral',
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
      boost: null,
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
      setUsarLocal(true)
      setDetalhesAbertos(false)
    } catch (e) {
      console.error(e)
      setResposta('Nao consegui publicar agora. Confira sua conexao e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100200] bg-[#07111f] text-white"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#07111f] text-white">
        <div className="relative shrink-0 overflow-hidden bg-[linear-gradient(135deg,#0b73ff_0%,#18b8c9_52%,#ffe01b_126%)] px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] md:px-6 md:pb-5 md:pt-6">
          <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-white/14" />
          <div className="pointer-events-none absolute -right-8 top-1 h-36 w-28 rotate-12 rounded-[38px] bg-yellow-100/28" />

          <div className="relative mx-auto flex w-full max-w-3xl items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex rounded-full bg-[#ffd91a] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-950">
                Novo pedido
              </div>
              <h2 className="mt-3 text-2xl font-black leading-none text-white md:text-4xl">
                O que voce precisa?
              </h2>
              <p className="mt-2 max-w-md text-xs font-bold leading-relaxed text-white/86 md:text-sm">
                Descreva o servico, escolha a categoria e publique para pessoas perto de voce.
              </p>
            </div>

            <button
              onClick={onClose}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/45 bg-white/90 text-sm font-black text-blue-950 shadow-[0_12px_26px_rgba(15,23,42,0.18)] transition hover:bg-white active:scale-[0.97]"
              type="button"
              title="Fechar"
            >
              X
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-6">
          <div className="mx-auto w-full max-w-3xl space-y-3">
            <label className="block">
              <span className="mb-2 block px-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#ffd91a] md:text-xs">
                Descricao
              </span>
              <div className="relative">
                <textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value.slice(0, 260))}
                  placeholder="Ex: preciso instalar uma TV hoje, bairro Centro, valor a combinar."
                  className="h-36 w-full resize-none rounded-[24px] border border-white/10 bg-white/[0.065] p-4 pr-16 text-base font-bold text-white outline-none placeholder:text-slate-500 focus:border-blue-300/40 focus:ring-2 focus:ring-blue-500/20 md:h-40"
                />
                <div className="absolute bottom-3 right-4 text-[10px] font-black text-slate-500">{mensagem.length}/260</div>
              </div>
            </label>

            <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {sugestoes.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setMensagem(s)}
                  className="shrink-0 rounded-full border border-white/10 bg-white/[0.07] px-3 py-2 text-[11px] font-black text-slate-100 transition hover:bg-white/[0.12] active:scale-[0.98]"
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="grid gap-2 md:grid-cols-[1fr_0.72fr]">
              <label>
                <span className="mb-2 block px-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">
                  Categoria
                </span>
                <select
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.07] px-3 text-sm font-black text-white outline-none focus:border-blue-300/40 focus:ring-2 focus:ring-blue-500/20"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#07111f] text-white">
                      {c.emoji} {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block px-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">
                  Valor opcional
                </span>
                <div className="flex h-12 items-center rounded-2xl border border-white/10 bg-white/[0.07] px-3 focus-within:border-emerald-300/40 focus-within:ring-2 focus-within:ring-emerald-500/20">
                  <span className="mr-2 rounded-full bg-[#ffd91a] px-2 py-1 text-[11px] font-black text-blue-950">R$</span>
                  <input
                    value={valorDigitado}
                    onChange={(e) => setValorDigitado(e.target.value)}
                    placeholder="80,00"
                    className="min-w-0 flex-1 bg-transparent text-sm font-black text-white outline-none placeholder:text-slate-500"
                    inputMode="decimal"
                  />
                </div>
              </label>
            </div>

            <button
              type="button"
              onClick={() => setDetalhesAbertos((v) => !v)}
              className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-3 text-left text-sm font-black text-slate-100 transition hover:bg-white/[0.075]"
            >
              <span>Detalhes opcionais</span>
              <span className="text-[#ffd91a]">{detalhesAbertos ? '-' : '+'}</span>
            </button>

            {detalhesAbertos ? (
              <label className="block">
                <span className="mb-2 block px-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">
                  Titulo curto
                </span>
                <input
                  value={tituloManual}
                  onChange={(e) => setTituloManual(e.target.value.slice(0, 80))}
                  placeholder="Ex: instalar TV hoje"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.07] px-3 text-sm font-black text-white outline-none placeholder:text-slate-500 focus:border-blue-300/40 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
            ) : null}

            <div className="rounded-[22px] border border-white/10 bg-white/[0.055] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ffd91a]">Previa</div>
                  <div className="mt-1 line-clamp-2 text-lg font-black leading-tight text-white">{tituloFinal}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-slate-300">
                    <span className="rounded-full bg-white/[0.07] px-2 py-1">{categoria?.label}</span>
                    <span className="rounded-full bg-white/[0.07] px-2 py-1">{formatMoney(valorFinal)}</span>
                    <span className="rounded-full bg-white/[0.07] px-2 py-1">{usarLocal ? 'Com localizacao' : 'Sem localizacao'}</span>
                  </div>
                </div>
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-[22px] border border-white/10 bg-white/[0.055] px-3 py-3">
              <span>
                <span className="block text-sm font-black text-white">Usar localizacao</span>
                <span className="block text-xs font-semibold text-slate-400">Ajuda corres e profissionais perto de voce.</span>
              </span>
              <input
                type="checkbox"
                checked={usarLocal}
                onChange={(e) => setUsarLocal(e.target.checked)}
                className="h-5 w-5 accent-[#ffd91a]"
              />
            </label>

            <button
              onClick={publicarPedido}
              disabled={loading || !mensagem.trim()}
              className="min-h-12 w-full rounded-[22px] bg-[#ffd91a] px-4 py-4 text-sm font-black text-blue-950 shadow-[0_18px_45px_rgba(250,204,21,0.22)] transition hover:bg-yellow-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
            >
              {loading ? 'Publicando...' : 'Publicar pedido'}
            </button>

            {resposta ? (
              <div
                className={[
                  'rounded-2xl border p-3 text-sm font-black',
                  resposta.startsWith('Nao')
                    ? 'border-red-300/25 bg-red-500/12 text-red-100'
                    : 'border-emerald-300/25 bg-emerald-500/12 text-emerald-100',
                ].join(' ')}
              >
                {resposta}
              </div>
            ) : null}

            {abrirCriacaoManual ? (
              <button
                type="button"
                onClick={() => abrirCriacaoManual?.()}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 text-sm font-black text-slate-300 transition hover:bg-white/[0.065]"
              >
                Manter neste fluxo simples
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
