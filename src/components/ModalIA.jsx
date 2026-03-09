'use client'

import { useEffect, useMemo, useState } from 'react'
import { ref, push, serverTimestamp } from 'firebase/database'
import { database } from '@/lib/firebase'

// ✅ categorias fixas
import { CATEGORIES, getCategoryLabel } from '@/constants/categories'

function parseValor(texto) {
  if (!texto) return null
  const m = String(texto).match(
    /(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*reais)?/i
  )
  if (!m) return null
  const num = Number(m[1].replace(',', '.'))
  return Number.isFinite(num) ? num : null
}

function guessTipo(texto) {
  const t = String(texto).toLowerCase()
  if (t.includes('vendo') || t.includes('ofereço') || t.includes('oferta'))
    return 'oferta'
  return 'pedido'
}

function guessTitulo(texto) {
  const s = String(texto || '').trim()
  if (!s) return ''
  const primeira = s.split('\n')[0]
  return primeira.length > 40 ? primeira.slice(0, 40) + '…' : primeira
}

/**
 * ModalIA (cliente)
 * - Cliente só cria PEDIDO/OFERTA (sem escolher "corre/profissional" aqui)
 * - Quem aceita (corre ou profissional) é que filtra e pega a missão
 */
export default function ModalIA({
  open,
  onClose,
  abrirCriacaoManual,

  // ✅ opcional (se não vier, usa localStorage)
  meuNome: meuNomeProp,
  meuId: meuIdProp,
}) {
  const [mensagem, setMensagem] = useState('')
  const [valorDigitado, setValorDigitado] = useState('')
  const [resposta, setResposta] = useState('')
  const [loading, setLoading] = useState(false)

  // ✅ categoria padrão
  const [categoriaId, setCategoriaId] = useState('servicos_gerais')

  // ✅ pega por props primeiro; fallback para localStorage
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

  // ✅ reset sempre que ABRIR
  useEffect(() => {
    if (!open) return
    setMensagem('')
    setValorDigitado('')
    setResposta('')
    setCategoriaId('servicos_gerais')
  }, [open])

  if (!open) return null

  async function criarNoFirebase({ tipo, titulo, descricao, valor, local, categoriaId }) {
    const pedidosRef = ref(database, 'pedidos')

    const novoItem = {
      tipo,
      titulo: titulo || '',
      descricao: descricao || '',
      valor: valor != null ? Number(valor) : null,

      // ✅ categoria (quem aceita usa isso pra filtrar)
      categoriaId: String(categoriaId || 'servicos_gerais'),

      status: 'aberto',
      local: local || null,
      criador: { nome: meuNome || 'Anônimo', id: meuId || null },
      criadoEm: serverTimestamp?.() || Date.now(),
      atualizadoEm: serverTimestamp?.() || Date.now(),
    }

    await push(pedidosRef, novoItem)
  }

  const getLoc = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
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
      await criarNoFirebase({
        tipo,
        titulo,
        descricao: msg,
        valor: valorFinal,
        local,
        categoriaId,
      })

      setResposta(
        local
          ? `✅ Criado: "${titulo || msg}" · ${getCategoryLabel(categoriaId)}${
              valorFinal != null ? ` · R$ ${valorFinal.toFixed(2)}` : ''
            }`
          : `✅ Criado sem localização · ${getCategoryLabel(
              categoriaId
            )}. Depois você pode marcar no mapa.`
      )

      setMensagem('')
      setValorDigitado('')
      setCategoriaId('servicos_gerais')
    } catch (e) {
      console.error(e)
      setResposta('❌ Falha ao criar. Veja o console.')
    } finally {
      setLoading(false)
    }
  }

  const glass =
    'bg-white/10 backdrop-blur-md border border-white/10 shadow-2xl shadow-black/40'

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-3"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className={`w-full max-w-md rounded-3xl p-5 ${glass}`}>
        {/* topo */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-gray-100">Criar pedido 🤖</div>
            <div className="text-xs text-gray-400 mt-1">
              Você descreve o que precisa. Corre e profissionais disponíveis vão
              aceitar.
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-2xl bg-white/10 border border-white/10 text-gray-200 hover:bg-white/15 active:scale-[0.98] transition"
            type="button"
            title="Fechar"
          >
            ✕
          </button>
        </div>

        {/* categoria */}
        <div className="mt-4">
          <div className="text-[11px] text-gray-400 mb-1 px-1">
            Categoria do pedido
          </div>

          <select
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className="w-full px-3 py-3 rounded-2xl bg-white/10 border border-white/10 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id} className="text-black">
                {c.emoji} {c.label}
              </option>
            ))}
          </select>

          <div className="text-[11px] text-gray-500 mt-2 px-1">
            Dica: categorias ajudam a achar profissionais certos.
          </div>
        </div>

        {/* mensagem */}
        <div className="mt-4">
          <div className="text-[11px] text-gray-400 mb-1 px-1">Sua mensagem</div>
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder='Ex: "Preciso de alguém pra trocar chuveiro hoje"'
            className="w-full h-28 p-3 rounded-2xl bg-white/10 border border-white/10 text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
          />
        </div>

        {/* valor */}
        <div className="mt-3">
          <div className="text-[11px] text-gray-400 mb-1 px-1">
            Valor (opcional)
          </div>
          <input
            value={valorDigitado}
            onChange={(e) => setValorDigitado(e.target.value)}
            placeholder="ex: 25,00"
            className="w-full px-3 py-2 rounded-2xl bg-white/10 border border-white/10 text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            inputMode="decimal"
          />
        </div>

        {/* ações */}
        <div className="mt-4 flex gap-2 flex-wrap">
          <button
            onClick={() => interpretarMensagem({ comLocal: true })}
            disabled={loading || !mensagem.trim()}
            className="flex-1 min-w-[140px] h-[44px] rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition shadow-lg shadow-blue-500/20"
            type="button"
          >
            {loading ? 'Criando…' : 'Criar com localização'}
          </button>

          <button
            onClick={() => interpretarMensagem({ comLocal: false })}
            disabled={loading || !mensagem.trim()}
            className="h-[44px] px-4 rounded-2xl bg-white/10 border border-white/10 text-gray-100 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/15 active:scale-[0.98] transition"
            type="button"
          >
            Sem localização
          </button>
        </div>

        {/* resposta */}
        {resposta && (
          <div className="mt-4 rounded-2xl p-3 bg-white/10 border border-white/10">
            <div className="text-sm text-gray-100">{resposta}</div>
          </div>
        )}

        {/* link manual */}
        <button
          type="button"
          onClick={() => abrirCriacaoManual?.()}
          className="mt-4 w-full text-left text-sm text-blue-300 hover:text-blue-200 underline underline-offset-4"
        >
          Prefere criar manualmente? Clique aqui
        </button>
      </div>
    </div>
  )
}
