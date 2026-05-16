'use client'

import { useEffect, useMemo, useState } from 'react'
import { ref, push, serverTimestamp } from 'firebase/database'
import { database } from '@/lib/firebase'
import { CATEGORIES, getCategoryLabel } from '@/constants/categories'

function parseValor(texto) {
  if (!texto) return null
  const m = String(texto).match(/(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*reais)?/i)
  if (!m) return null
  const num = Number(m[1].replace(',', '.'))
  return Number.isFinite(num) ? num : null
}

function guessTipo(texto) {
  const t = String(texto).toLowerCase()
  if (t.includes('vendo') || t.includes('ofereço') || t.includes('oferta')) return 'oferta'
  return 'pedido'
}

function guessTitulo(texto) {
  const s = String(texto || '').trim()
  if (!s) return ''
  const primeira = s.split('\n')[0]
  return primeira.length > 42 ? primeira.slice(0, 42) + '…' : primeira
}

export default function ModalIA({ open, onClose, abrirCriacaoManual, meuNome: meuNomeProp, meuId: meuIdProp }) {
  const [mensagem, setMensagem] = useState('')
  const [valorDigitado, setValorDigitado] = useState('')
  const [resposta, setResposta] = useState('')
  const [loading, setLoading] = useState(false)
  const [categoriaId, setCategoriaId] = useState('servicos_gerais')
  const [destaqueInicial, setDestaqueInicial] = useState(false)
  const [emergencia, setEmergencia] = useState(false)

  const meuNome = useMemo(() => {
    if (meuNomeProp) return meuNomeProp
    try { return localStorage.getItem('meuNome') || 'Anônimo' } catch { return 'Anônimo' }
  }, [meuNomeProp])

  const meuId = useMemo(() => {
    if (meuIdProp) return meuIdProp
    try { return localStorage.getItem('meuId') || '' } catch { return '' }
  }, [meuIdProp])

  useEffect(() => {
    if (!open) return
    setMensagem('')
    setValorDigitado('')
    setResposta('')
    setCategoriaId('servicos_gerais')
    setDestaqueInicial(false)
    setEmergencia(false)
  }, [open])

  if (!open) return null

  async function criarNoFirebase({ tipo, titulo, descricao, valor, local, categoriaId, destaqueInicial, emergencia }) {
    const pedidosRef = ref(database, 'pedidos')
    const agora = Date.now()
    const boostUntil = 0

    const novoItem = {
      tipo,
      titulo: titulo || '',
      descricao: descricao || '',
      valor: valor != null ? Number(valor) : null,
      categoriaId: String(categoriaId || 'servicos_gerais'),
      status: 'aberto',
      local: local || null,
      criador: { nome: meuNome || 'Anônimo', id: meuId || null },
      urgencia: 'normal',
      emergencia: false,
      prioridade: 'normal',
      boost: false && destaqueInicial
        ? { level: 1, label: emergencia ? 'Emergência (em breve)' : 'Destaque (em breve)', until: boostUntil, createdAt: agora, by: { id: meuId || null, nome: meuNome || 'Anônimo' } }
        : null,
      criadoEm: agora,
      atualizadoEm: agora,
      criadoEmServer: serverTimestamp?.() || agora,
      atualizadoEmServer: serverTimestamp?.() || agora,
    }

    await push(pedidosRef, novoItem)
  }

  const getLoc = () => new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  })

  function parseValorDigitado(v) {
    const s = String(v || '').trim()
    if (!s) return null
    const n = Number(s.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }

  async function interpretarMensagem({ comLocal = true } = {}) {
    const msg = mensagem.trim()
    if (!msg) return
    setLoading(true)
    setResposta('')

    const tipo = guessTipo(msg)
    const titulo = guessTitulo(msg)
    const valorAuto = parseValor(msg)
    const valorManual = parseValorDigitado(valorDigitado)
    const valorFinal = valorManual != null ? valorManual : valorAuto
    const local = comLocal ? await getLoc() : null

    try {
      await criarNoFirebase({ tipo, titulo, descricao: msg, valor: valorFinal, local, categoriaId, destaqueInicial, emergencia })
      setResposta(`✅ Pedido criado · ${getCategoryLabel(categoriaId)}${valorFinal != null ? ` · R$ ${valorFinal.toFixed(2)}` : ''}`)
      setMensagem('')
      setValorDigitado('')
      setCategoriaId('servicos_gerais')
      setDestaqueInicial(false)
      setEmergencia(false)
    } catch (e) {
      console.error(e)
      setResposta('❌ Falha ao criar. Veja o console.')
    } finally {
      setLoading(false)
    }
  }

  const optionBase = 'flex-1 min-w-[150px] rounded-2xl border px-3 py-3 text-left transition active:scale-[0.98]'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-md px-3" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="relative w-full max-w-xl overflow-hidden rounded-[34px] border border-white/12 bg-[#07111f]/95 p-5 text-white shadow-[0_30px_120px_rgba(0,0,0,0.65)]">
        <div className="pointer-events-none absolute -top-20 left-10 h-44 w-44 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-20 h-44 w-44 rounded-full bg-fuchsia-500/20 blur-3xl" />

        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 via-fuchsia-500 to-amber-400 text-2xl shadow-[0_0_40px_rgba(59,130,246,0.45)]">🧰</div>
            <div>
              <div className="text-2xl font-black tracking-tight">Criar pedido 🤖</div>
              <div className="mt-1 max-w-sm text-sm leading-relaxed text-slate-300">Conte o que precisa. Corres e profissionais disponíveis vão receber seu pedido.</div>
            </div>
          </div>
          <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/8 text-xl text-white hover:bg-white/15" type="button" title="Fechar">✕</button>
        </div>

        <div className="relative mt-5 space-y-4">
          <div>
            <div className="mb-1 px-1 text-xs font-bold text-slate-300">Categoria do pedido</div>
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="w-full rounded-2xl border border-blue-400/35 bg-[#0b1728] px-4 py-3 text-white outline-none shadow-[0_0_30px_rgba(37,99,235,0.18)] focus:ring-2 focus:ring-blue-500/50">
              {CATEGORIES.map((c) => <option key={c.id} value={c.id} className="text-black">{c.emoji} {c.label}</option>)}
            </select>
            <div className="mt-2 px-1 text-xs text-slate-400">Categorias ajudam a encontrar profissionais certos.</div>
          </div>

          <div>
            <div className="mb-1 px-1 text-xs font-bold text-slate-300">Sua mensagem</div>
            <div className="relative">
              <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value.slice(0, 220))} placeholder='Ex: “Preciso de alguém pra trocar chuveiro hoje”' className="h-32 w-full resize-none rounded-2xl border border-white/12 bg-[#0b1728] p-4 pr-16 text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-blue-500/45" />
              <div className="absolute bottom-3 right-4 text-xs text-slate-500">{mensagem.length}/220</div>
            </div>
          </div>

          <div>
            <div className="mb-1 px-1 text-xs font-bold text-slate-300">Valor combinado <span className="font-normal text-slate-500">(opcional)</span></div>
            <div className="flex items-center rounded-2xl border border-white/12 bg-[#0b1728] px-4 focus-within:ring-2 focus-within:ring-emerald-500/35">
              <span className="mr-3 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-sm font-black text-emerald-300">R$</span>
              <input value={valorDigitado} onChange={(e) => setValorDigitado(e.target.value)} placeholder="Ex: 25,00" className="h-14 min-w-0 flex-1 bg-transparent text-white placeholder:text-slate-500 outline-none" inputMode="decimal" />
            </div>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-3">
            <div className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-400">Alcance do pedido</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => {}} className={`${optionBase} cursor-not-allowed opacity-60 border-white/10 bg-white/[0.03] text-slate-300`}>
                <div className="font-black">🚀 Destacar pedido (em breve)</div>
                <div className="mt-1 text-xs text-slate-400">Aparece com mais força para quem está disponível.</div>
              </button>
              <button type="button" onClick={() => {}} className={`${optionBase} cursor-not-allowed opacity-60 border-white/10 bg-white/[0.03] text-slate-300`}>
                <div className="font-black">🚨 Emergência (em breve)</div>
                <div className="mt-1 text-xs text-slate-400">Use quando precisa de resposta mais rápida.</div>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={() => interpretarMensagem({ comLocal: true })} disabled={loading || !mensagem.trim()} className="h-14 flex-1 min-w-[190px] rounded-2xl bg-gradient-to-r from-fuchsia-500 to-blue-600 px-4 font-black text-white shadow-[0_15px_45px_rgba(37,99,235,0.35)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50" type="button">{loading ? 'Criando…' : '📍 Criar com localização'}</button>
            <button onClick={() => interpretarMensagem({ comLocal: false })} disabled={loading || !mensagem.trim()} className="h-14 rounded-2xl border border-white/12 bg-white/[0.04] px-5 font-bold text-slate-200 transition hover:bg-white/[0.08] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50" type="button">Sem localização</button>
          </div>

          {resposta && <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-100">{resposta}</div>}

          <button type="button" onClick={() => abrirCriacaoManual?.()} className="text-sm font-semibold text-blue-300 underline underline-offset-4 hover:text-blue-200">Prefere criar manualmente? Clique aqui</button>
        </div>
      </div>
    </div>
  )
}
