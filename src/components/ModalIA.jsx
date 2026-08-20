'use client'

import { useEffect, useMemo, useState } from 'react'
import { ref, push, update, serverTimestamp } from '@/lib/firebaseDebug'
import { database } from '@/lib/firebase'
import { CATEGORIES, getCategoryById } from '@/constants/categories'
import { showCorreAquiTipOnce } from '@/components/tutorial/TutorialProvider'
import { synchronizePublicRequest } from '@/lib/pedidoProjectionClient'
import { CONTEXTUAL_TIP_IDS } from '@/lib/tutorial/contextualTipsConfig'

const DRAFT_KEY = 'correAqui:novoPedido:draft:v1'

const quickSuggestions = [
  { label: 'Instalar TV', icon: 'tv', text: 'Preciso instalar uma TV hoje. Valor a combinar.', categoriaId: 'tecnologia', valor: '80,00' },
  { label: 'Consertar algo', icon: 'wrench', text: 'Preciso consertar algo em casa. Procuro alguém disponível perto de mim.', categoriaId: 'reparos', valor: '' },
  { label: 'Limpeza', icon: 'broom', text: 'Preciso de ajuda com limpeza. Pode ser hoje ou amanhã.', categoriaId: 'limpeza', valor: '100,00' },
  { label: 'Montagem', icon: 'briefcase', text: 'Preciso montar um móvel. Trago detalhes pelo chat.', categoriaId: 'casa', valor: '' },
  { label: 'Pintura', icon: 'roller', text: 'Preciso de pintura ou retoque em parede.', categoriaId: 'casa', valor: '' },
  { label: 'Encanamento', icon: 'faucet', text: 'Preciso resolver um problema de encanamento.', categoriaId: 'reparos', valor: '' },
  { label: 'Instalações', icon: 'bulb', text: 'Preciso de uma instalação simples em casa.', categoriaId: 'reparos', valor: '' },
  { label: 'Outros', icon: 'dots', text: 'Preciso de ajuda com um serviço perto de mim.', categoriaId: 'servicos_gerais', valor: '' },
]

function parseValor(texto) {
  if (!texto) return null
  const match = String(texto).match(/(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*reais)?/i)
  if (!match) return null
  const num = Number(match[1].replace(',', '.'))
  return Number.isFinite(num) ? num : null
}

function parseValorDigitado(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const number = Number(raw.replace(/[^\d,.]/g, '').replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

function guessTipo(texto) {
  const lower = String(texto || '').toLowerCase()
  if (lower.includes('vendo') || lower.includes('ofereco') || lower.includes('oferta')) return 'oferta'
  return 'pedido'
}

function guessTitulo(texto) {
  const clean = String(texto || '')
    .replace(/\s+/g, ' ')
    .replace(/^(preciso|quero|procuro|gostaria|necessito)\s+(de\s+)?/i, '')
    .trim()

  if (!clean) return ''
  const title = clean.charAt(0).toUpperCase() + clean.slice(1)
  return title.length > 62 ? `${title.slice(0, 62).trim()}...` : title
}

function formatMoney(value) {
  if (value == null) return 'A combinar'
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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

function loadDraft() {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveDraft(data) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY)
  } catch {}
}

function IconPaper() {
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" fill="none" aria-hidden="true">
      <rect x="10" y="8" width="38" height="44" rx="8" fill="#0b73ff" />
      <path d="M20 20h20M20 30h20M20 40h14" stroke="white" strokeLinecap="round" strokeWidth="4" />
      <path d="m39 45 12-12 5 5-12 12-7 2 2-7Z" fill="#1fb7ff" stroke="white" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

function QuickSuggestionIcon({ type }) {
  const common = {
    className: 'h-6 w-6 text-blue-600 md:h-9 md:w-9',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 2,
    viewBox: '0 0 48 48',
    'aria-hidden': 'true',
  }

  if (type === 'tv') {
    return (
      <svg {...common}>
        <rect x="8" y="10" width="32" height="22" rx="2.5" />
        <path d="M24 32v6M16 38h16" />
      </svg>
    )
  }

  if (type === 'wrench') {
    return (
      <svg {...common}>
        <path d="M31.8 8.8a10 10 0 0 0-12.4 12.4L8.5 32.1a4.2 4.2 0 1 0 5.9 5.9l10.9-10.9A10 10 0 0 0 37.7 14.7l-6.2 6.2-4.4-4.4 6.2-6.2c-.5-.6-1-1.1-1.5-1.5Z" />
      </svg>
    )
  }

  if (type === 'broom') {
    return (
      <svg {...common}>
        <path d="M31 7 17.5 25.5" />
        <path d="M14.5 25.5 26 34" />
        <path d="m12 29 10 7" />
        <path d="m9 33 9 6" />
        <path d="M17.5 25.5 12 37.5 26 34l2.5-5.5-8.5-6Z" />
      </svg>
    )
  }

  if (type === 'briefcase') {
    return (
      <svg {...common}>
        <path d="M17 14v-3a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" />
        <rect x="8" y="14" width="32" height="25" rx="3" />
        <path d="M8 24h32M21 24v3h6v-3" />
      </svg>
    )
  }

  if (type === 'roller') {
    return (
      <svg {...common}>
        <rect x="9" y="10" width="22" height="10" rx="3" />
        <path d="M31 15h4a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4H24a4 4 0 0 0-4 4v2" />
        <rect x="16" y="32" width="8" height="10" rx="2" />
      </svg>
    )
  }

  if (type === 'faucet') {
    return (
      <svg {...common}>
        <path d="M12 24h20a6 6 0 0 1 6 6v2" />
        <path d="M17 24V14h12" />
        <path d="M24 14V8" />
        <path d="M19 8h10" />
        <path d="M37 34c2 2.2 3 4.1 3 5.7a3 3 0 0 1-6 0c0-1.6 1-3.5 3-5.7Z" />
        <path d="M9 30h8" />
      </svg>
    )
  }

  if (type === 'bulb') {
    return (
      <svg {...common}>
        <path d="M24 8a11 11 0 0 0-6.2 20.1c1.4.9 2.2 2.3 2.2 3.9h8c0-1.6.8-3 2.2-3.9A11 11 0 0 0 24 8Z" />
        <path d="M20 36h8M21 40h6" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <circle cx="14" cy="24" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="24" cy="24" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="34" cy="24" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

export default function ModalIA({ open, onClose, meuNome: meuNomeProp, meuId: meuIdProp }) {
  const [tituloManual, setTituloManual] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [valorDigitado, setValorDigitado] = useState('')
  const [resposta, setResposta] = useState('')
  const [loading, setLoading] = useState(false)
  const [categoriaId, setCategoriaId] = useState('servicos_gerais')
  const [usarLocal, setUsarLocal] = useState(true)
  const [detalhesAbertos, setDetalhesAbertos] = useState(false)
  const [prazo, setPrazo] = useState('')
  const [materiais, setMateriais] = useState('')
  const [rascunhoSalvo, setRascunhoSalvo] = useState(false)

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

    const draft = loadDraft()
    setTituloManual(draft?.tituloManual || '')
    setMensagem(draft?.mensagem || '')
    setValorDigitado(draft?.valorDigitado || '')
    setCategoriaId(draft?.categoriaId || 'servicos_gerais')
    setUsarLocal(draft?.usarLocal ?? true)
    setPrazo(draft?.prazo || '')
    setMateriais(draft?.materiais || '')
    setDetalhesAbertos(false)
    setResposta('')
    setRascunhoSalvo(false)
  }, [open])

  const categoria = useMemo(() => getCategoryById(categoriaId) || CATEGORIES[0], [categoriaId])
  const valorAuto = useMemo(() => parseValor(mensagem), [mensagem])
  const valorManual = useMemo(() => parseValorDigitado(valorDigitado), [valorDigitado])
  const valorFinal = valorManual != null ? valorManual : valorAuto
  const tituloFinal = (tituloManual.trim() || guessTitulo(mensagem) || 'Pedido rápido').slice(0, 80)
  const tipoPreview = guessTipo(mensagem)
  const mensagemLimpa = mensagem.trim()

  const sugestoesTexto = useMemo(() => {
    const label = String(categoria?.label || 'serviços gerais').toLowerCase()
    return [
      `Preciso de ajuda com ${label}`,
      'Procuro alguém disponível perto de mim',
    ]
  }, [categoria?.label])

  if (!open) return null

  function aplicarSugestao(sugestao) {
    setMensagem(sugestao.text.slice(0, 260))
    setCategoriaId(sugestao.categoriaId)
    setValorDigitado(sugestao.valor || '')
    setRascunhoSalvo(false)
  }

  function salvarRascunho() {
    const ok = saveDraft({
      tituloManual,
      mensagem,
      valorDigitado,
      categoriaId,
      usarLocal,
      prazo,
      materiais,
      updatedAt: Date.now(),
    })
    setRascunhoSalvo(ok)
    setResposta(ok ? 'Rascunho salvo neste aparelho.' : 'Não consegui salvar o rascunho agora.')
  }

  async function criarNoFirebase({ local }) {
    const agora = Date.now()
    const novo = push(ref(database, 'pedidos'))
    const detalhes = [
      prazo ? `Prazo: ${prazo}` : '',
      materiais ? `Materiais/detalhes: ${materiais}` : '',
    ].filter(Boolean)

    const payload = {
      id: novo.key,
      tipo: tipoPreview,
      modoPedido: 'geral',
      titulo: tituloFinal,
      descricao: [mensagemLimpa, ...detalhes].filter(Boolean).join('\n\n'),
      valor: valorFinal != null ? Number(valorFinal) : null,
      categoriaId: String(categoriaId || 'servicos_gerais'),
      categoriaLabel: categoria?.label || 'Serviços gerais',
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

    await update(ref(database, `pedidos/${payload.id}`), payload)
    await synchronizePublicRequest(payload.id)

    showCorreAquiTipOnce(CONTEXTUAL_TIP_IDS.pedidoCriado, {
      id: CONTEXTUAL_TIP_IDS.pedidoCriado,
    })

    try {
      window?.dispatchEvent?.(new CustomEvent('correaqui:pedido-confirmado', {
        detail: { id: payload.id },
      }))
    } catch {}

    return payload
  }

  async function publicarPedido() {
    if (!mensagemLimpa || loading) return
    setLoading(true)
    setResposta('')

    try {
      const local = usarLocal ? await getLoc() : null
      const payload = await criarNoFirebase({ local })
      setResposta(`Pedido publicado: ${payload.categoriaLabel}${payload.valor != null ? ` - ${formatMoney(payload.valor)}` : ''}`)
      clearDraft()
      setTituloManual('')
      setMensagem('')
      setValorDigitado('')
      setCategoriaId('servicos_gerais')
      setUsarLocal(true)
      setPrazo('')
      setMateriais('')
      setDetalhesAbertos(false)
      window.setTimeout(() => onClose?.(), 650)
    } catch (error) {
      console.error(error)
      setResposta('Não consegui publicar agora. Confira sua conexão e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100200] bg-white text-slate-950"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.()
      }}
    >
      <div className="mx-auto flex h-[100dvh] w-full max-w-[720px] flex-col overflow-hidden bg-white">
        <div className="shrink-0 px-4 pt-[max(0.55rem,env(safe-area-inset-top))] md:px-8 md:pt-8">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-full text-2xl font-light text-blue-950 transition hover:bg-slate-50 active:scale-95 md:h-11 md:w-11 md:text-3xl"
              aria-label="Fechar"
            >
              ×
            </button>
            <button
              type="button"
              onClick={salvarRascunho}
              className="rounded-full px-2.5 py-1.5 text-xs font-black text-blue-600 transition hover:bg-blue-50 active:scale-95 md:px-3 md:py-2 md:text-sm"
            >
              {rascunhoSalvo ? 'Rascunho salvo' : 'Salvar rascunho'}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(0.9rem+env(safe-area-inset-bottom))] md:px-8 md:pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <section className="mt-2 flex items-start justify-between gap-4 md:mt-4">
            <div className="min-w-0">
              <h2 className="text-[1.35rem] font-black leading-tight text-blue-950 md:text-4xl">O que você precisa?</h2>
              <p className="mt-1 max-w-[420px] text-[13px] font-semibold leading-snug text-slate-500 md:mt-2 md:text-lg md:leading-relaxed">
                Descreva o serviço e publique para pessoas perto de você.
              </p>
            </div>
            <div className="hidden h-24 w-24 shrink-0 place-items-center rounded-[24px] bg-blue-50 shadow-[0_14px_36px_rgba(37,99,235,0.08)] sm:grid">
              <IconPaper />
            </div>
          </section>

          <label className="mt-3 block md:mt-6">
            <div className="relative">
              <textarea
                value={mensagem}
                onChange={(event) => {
                  setMensagem(event.target.value.slice(0, 260))
                  setRascunhoSalvo(false)
                }}
                placeholder="Ex: preciso instalar uma TV hoje, bairro Centro, valor a combinar."
                className="h-[112px] w-full resize-none rounded-[16px] border border-slate-200 bg-white p-4 pr-14 text-[14px] font-semibold leading-snug text-blue-950 outline-none shadow-[0_8px_20px_rgba(15,23,42,0.04)] placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 md:h-[170px] md:rounded-[18px] md:p-5 md:pr-16 md:text-lg md:leading-relaxed"
              />
              <div className="absolute bottom-3 right-4 text-[11px] font-black text-slate-500 md:bottom-5 md:right-5 md:text-xs">{mensagem.length}/260</div>
            </div>
          </label>

          <div className="mt-2 grid gap-1.5 md:mt-3 md:gap-2">
            {sugestoesTexto.map((texto, index) => (
              <button
                key={texto}
                type="button"
                onClick={() => {
                  setMensagem(texto.slice(0, 260))
                  setRascunhoSalvo(false)
                }}
                className="flex h-8 w-full max-w-[360px] items-center gap-2 rounded-full border border-blue-100 bg-blue-50/40 px-3 text-left text-[11px] font-extrabold text-blue-950 transition hover:bg-blue-50 active:scale-[0.98] md:h-11 md:gap-3 md:px-4 md:text-sm md:font-black"
              >
                <span className="text-sm text-blue-600 md:text-xl">{index === 0 ? '⚡' : '●'}</span>
                <span className="truncate">{texto}</span>
              </button>
            ))}
          </div>

          <section className="mt-3 md:mt-5">
            <h3 className="text-[13px] font-black text-blue-950 md:text-base">Sugestões rápidas</h3>
            <div className="mt-2 grid grid-cols-4 gap-2 md:mt-3 md:gap-3">
              {quickSuggestions.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => aplicarSugestao(item)}
                  className="flex h-[70px] flex-col items-center justify-center rounded-[14px] border border-slate-100 bg-white px-1.5 py-1.5 text-center shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:border-blue-200 hover:bg-blue-50 active:scale-[0.98] md:h-[96px] md:rounded-[18px] md:px-3 md:py-4 md:shadow-[0_10px_26px_rgba(15,23,42,0.06)]"
                >
                  <span className="mx-auto grid h-7 w-7 place-items-center md:h-10 md:w-10">
                    <QuickSuggestionIcon type={item.icon} />
                  </span>
                  <span className="mt-1 block min-h-[22px] max-w-full text-[9.5px] font-extrabold leading-[1.05] text-blue-950 md:mt-2 md:min-h-[34px] md:text-sm md:font-black md:leading-tight">{item.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-3 md:mt-5">
            <h3 className="text-[13px] font-black text-blue-950 md:text-base">Categoria</h3>
            <label className="relative mt-2 flex h-11 items-center gap-2.5 rounded-[14px] border border-slate-100 bg-white px-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)] md:mt-3 md:h-14 md:gap-3 md:rounded-[16px] md:px-4 md:shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
              <span className="text-xl md:text-2xl">{categoria?.emoji || '⚡'}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-black text-blue-950 md:text-base">{categoria?.label || 'Serviços gerais'}</span>
              <span className="text-xl font-light text-blue-950 md:text-2xl">›</span>
              <select
                value={categoriaId}
                onChange={(event) => {
                  setCategoriaId(event.target.value)
                  setRascunhoSalvo(false)
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Categoria do pedido"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.emoji} {cat.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="mt-3 md:mt-5">
            <h3 className="text-[13px] font-black text-blue-950 md:text-base">Valor (opcional)</h3>
            <label className="mt-2 flex h-11 items-center gap-2.5 rounded-[14px] border border-slate-100 bg-white px-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)] focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100 md:mt-3 md:h-14 md:gap-3 md:rounded-[16px] md:px-4 md:shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
              <span className="rounded-[9px] bg-blue-600 px-2.5 py-1.5 text-xs font-black text-white md:rounded-[10px] md:px-3 md:py-2 md:text-sm">R$</span>
              <input
                value={valorDigitado}
                onChange={(event) => {
                  setValorDigitado(event.target.value)
                  setRascunhoSalvo(false)
                }}
                placeholder="80,00"
                inputMode="decimal"
                className="min-w-0 flex-1 bg-transparent text-base font-black text-slate-500 outline-none placeholder:text-slate-400 md:text-lg"
              />
              <span className="text-blue-950">✎</span>
            </label>
          </section>

          <button
            type="button"
            onClick={() => setDetalhesAbertos((value) => !value)}
            className="mt-3 flex min-h-12 w-full items-center justify-between rounded-[15px] border border-slate-100 bg-white px-3.5 text-left shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition hover:bg-blue-50 active:scale-[0.99] md:mt-5 md:min-h-14 md:rounded-[18px] md:px-4 md:shadow-[0_10px_26px_rgba(15,23,42,0.05)]"
          >
            <span>
              <span className="block text-sm font-black text-blue-950 md:text-base">Detalhes opcionais</span>
              <span className="block text-xs font-semibold text-slate-500 md:text-sm">Adicione prazo, materiais, etc.</span>
            </span>
            <span className="text-xl text-blue-950 md:text-2xl">{detalhesAbertos ? '⌃' : '⌄'}</span>
          </button>

          {detalhesAbertos ? (
            <div className="mt-2 grid gap-2 md:mt-3 md:gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-black text-blue-950 md:text-sm">Título curto</span>
                <input
                  value={tituloManual}
                  onChange={(event) => {
                    setTituloManual(event.target.value.slice(0, 80))
                    setRascunhoSalvo(false)
                  }}
                  placeholder="Ex: instalar TV hoje"
                  className="h-10 w-full rounded-[14px] border border-slate-100 bg-white px-3 text-sm font-bold text-blue-950 outline-none shadow-[0_8px_20px_rgba(15,23,42,0.04)] placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100 md:h-12 md:rounded-[16px] md:px-4 md:shadow-[0_10px_26px_rgba(15,23,42,0.04)]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-black text-blue-950 md:text-sm">Prazo</span>
                <input
                  value={prazo}
                  onChange={(event) => {
                    setPrazo(event.target.value.slice(0, 80))
                    setRascunhoSalvo(false)
                  }}
                  placeholder="Ex: hoje à tarde"
                  className="h-10 w-full rounded-[14px] border border-slate-100 bg-white px-3 text-sm font-bold text-blue-950 outline-none shadow-[0_8px_20px_rgba(15,23,42,0.04)] placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100 md:h-12 md:rounded-[16px] md:px-4 md:shadow-[0_10px_26px_rgba(15,23,42,0.04)]"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-black text-blue-950 md:text-sm">Materiais e observações</span>
                <input
                  value={materiais}
                  onChange={(event) => {
                    setMateriais(event.target.value.slice(0, 120))
                    setRascunhoSalvo(false)
                  }}
                  placeholder="Ex: suporte já comprado, precisa levar furadeira"
                  className="h-10 w-full rounded-[14px] border border-slate-100 bg-white px-3 text-sm font-bold text-blue-950 outline-none shadow-[0_8px_20px_rgba(15,23,42,0.04)] placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100 md:h-12 md:rounded-[16px] md:px-4 md:shadow-[0_10px_26px_rgba(15,23,42,0.04)]"
                />
              </label>
            </div>
          ) : null}

          <label className="mt-3 flex items-center justify-between gap-3 rounded-[15px] border border-slate-100 bg-white px-3.5 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)] md:mt-5 md:gap-4 md:rounded-[18px] md:px-4 md:py-4 md:shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
            <span className="flex min-w-0 items-center gap-2.5 md:gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-blue-50 text-xl text-blue-600 md:h-10 md:w-10 md:rounded-2xl md:text-2xl">⌖</span>
              <span className="min-w-0">
                <span className="block text-sm font-black text-blue-950 md:text-base">Usar minha localização</span>
                <span className="block text-xs font-semibold leading-snug text-slate-500 md:text-sm">
                  Seu pedido será visível para pessoas perto desta área.
                </span>
              </span>
            </span>
            <span
              className={[
                'relative h-7 w-12 shrink-0 rounded-full p-1 transition md:h-8 md:w-14',
                usarLocal ? 'bg-blue-600' : 'bg-slate-200',
              ].join(' ')}
            >
              <input
                type="checkbox"
                checked={usarLocal}
                onChange={(event) => {
                  setUsarLocal(event.target.checked)
                  setRascunhoSalvo(false)
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Usar localização"
              />
              <span className={`block h-5 w-5 rounded-full bg-white shadow transition md:h-6 md:w-6 ${usarLocal ? 'translate-x-5 md:translate-x-6' : 'translate-x-0'}`} />
            </span>
          </label>

          <section className="mt-3 rounded-[15px] border border-blue-100 bg-blue-50/65 p-3 md:mt-5 md:rounded-[18px] md:p-4">
            <h3 className="text-sm font-black text-blue-700 md:text-base">Prévia do seu pedido</h3>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-black text-blue-950 md:mt-3 md:gap-2 md:text-sm">
              <span className="rounded-[11px] bg-white/75 px-2.5 py-1.5 md:rounded-[13px] md:px-3 md:py-2">{categoria?.emoji || '⚡'} {categoria?.label || 'Serviços gerais'}</span>
              <span className="text-slate-400">•</span>
              <span className="rounded-[11px] bg-white/75 px-2.5 py-1.5 md:rounded-[13px] md:px-3 md:py-2">R$ {valorFinal != null ? Number(valorFinal).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'A combinar'}</span>
              <span className="text-slate-400">•</span>
              <span className="rounded-[11px] bg-white/75 px-2.5 py-1.5 md:rounded-[13px] md:px-3 md:py-2">{usarLocal ? '⌖ Com localização' : 'Sem localização'}</span>
            </div>
          </section>

          <button
            type="button"
            onClick={publicarPedido}
            disabled={loading || !mensagemLimpa}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-blue-600 px-4 text-base font-black text-white shadow-[0_14px_28px_rgba(37,99,235,0.26)] transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 md:mt-5 md:min-h-14 md:gap-3 md:rounded-[18px] md:text-lg md:shadow-[0_16px_34px_rgba(37,99,235,0.28)]"
          >
            <span>✈</span>
            {loading ? 'Publicando...' : 'Publicar pedido'}
          </button>

          {resposta ? (
            <div
              className={[
                'mt-2 rounded-[14px] border px-3 py-2.5 text-sm font-black md:mt-3 md:rounded-[16px] md:px-4 md:py-3',
                resposta.startsWith('Não')
                  ? 'border-red-100 bg-red-50 text-red-700'
                  : 'border-emerald-100 bg-emerald-50 text-emerald-700',
              ].join(' ')}
            >
              {resposta}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setDetalhesAbertos(false)}
            className="mt-2 w-full rounded-[14px] px-4 py-2.5 text-sm font-black text-blue-600 transition hover:bg-blue-50 md:mt-3 md:rounded-[16px] md:py-3"
          >
            Manter neste fluxo simples
          </button>
        </div>
      </div>
    </div>
  )
}
