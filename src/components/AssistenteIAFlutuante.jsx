'use client'

import { useEffect, useRef, useState } from 'react'
import { database } from '@/lib/firebase'
import { ref, push, set, serverTimestamp } from 'firebase/database'
import { criarPedido } from '../lib/mapapedidos'

const TIPOS = ['entrega', 'compra', 'ajuda', 'carona', 'outro']
const URGENCIAS = ['baixa', 'normal', 'alta']
const FORMAS = ['pix', 'dinheiro', 'cartão']

function classificarTipo(texto) {
  const t = (texto || '').toLowerCase()
  if (/entreg(ar|a)|levar|coletar|retirar/.test(t)) return 'entrega'
  if (/compr(ar|a)|mercado|farm(a|á)cia|loja/.test(t)) return 'compra'
  if (/ajuda|aux(í|i)lio|arrumar|consertar|manuten(c|ç)ao|manuten(c|ç)ão/.test(t)) return 'ajuda'
  if (/carona|levar.*(pessoa|algu(é|e)m)/.test(t)) return 'carona'
  return 'outro'
}

export default function AssistenteIAFlutuante({
  open = false,
  onFechar,
  usuarios = [],
  meuNome,
  meuId,
  setVisivel,
  mapRef,
}) {
  const [modo, setModo] = useState('chat') // 'chat' | 'pedido'
  const [mensagens, setMensagens] = useState([
    { de: 'ia', texto: `Olá ${meuNome || 'por aqui'}! Posso criar um pedido pra você. Diga: "criar pedido" ou escolha uma opção abaixo.` },
  ])
  const [entrada, setEntrada] = useState('')
  const [passo, setPasso] = useState(0)
  const [sugestoes, setSugestoes] = useState([]) // chips clicáveis
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const [draft, setDraft] = useState({
    titulo: '',
    tipo: '',
    descricao: '',
    destino: '',
    valor: '',
    forma: '',
    urgencia: 'normal',
  })

  const listaRef = useRef(null)
  useEffect(() => {
    if (listaRef.current) listaRef.current.scrollTop = listaRef.current.scrollHeight
  }, [mensagens, sugestoes])

  // ==== helpers de UI =====
  const addMsg = (de, texto) => setMensagens((m) => [...m, { de, texto }])
  const setChips = (itens) => setSugestoes(itens || [])
  const limparChips = () => setSugestoes([])

  // clique em chip = simula enviar texto
  const selecionarOpcao = (texto) => {
    setMensagens((msgs) => [...msgs, { de: 'eu', texto }])
    if (modo === 'pedido') tratarEntradaPedido(texto)
    else executarAcaoChat(texto)
  }

  // AÇÕES RÁPIDAS INICIAIS
  useEffect(() => {
    // chips de atalho assim que abrir
    setChips([
      { label: '📝 Criar pedido', value: 'criar pedido' },
      { label: '👥 Listar online', value: 'listar online' },
      { label: '👁️ Ficar visível', value: 'ficar visível' },
      { label: '🔒 Ficar invisível', value: 'ficar invisível' },
    ])
  }, [])

  // ===== CHAT: listar/buscar/visível/entrada no fluxo de pedido
  const executarAcaoChat = (texto) => {
    const msg = (texto || '').trim()
    const lower = msg.toLowerCase()

    // entrar no modo pedido
    if (lower.includes('criar pedido') || /(preciso|quero|gostaria|necessito)/.test(lower)) {
      const tipoSug = classificarTipo(lower)
      setDraft((d) => ({ ...d, tipo: tipoSug, titulo: d.titulo || (lower.includes('criar pedido') ? '' : msg) }))
      setModo('pedido'); setPasso(0)
      addMsg('ia', `Beleza! Parece um pedido do tipo **${tipoSug}**. Vamos completar os detalhes.`)
      addMsg('ia', `1) Qual **título** curto para o pedido?`)
      limparChips()
      setChips([
        { label: 'Entrega de pacote', value: 'Entrega de pacote' },
        { label: 'Comprar no mercado', value: 'Comprar no mercado' },
        { label: 'Ajuda em casa', value: 'Ajuda em casa' },
      ])
      return
    }

    // listar online
    if (lower.includes('listar') && lower.includes('online')) {
      limparChips()
      if (!usuarios?.length) { addMsg('ia', 'Ninguém online no momento.'); return }
      const lista = usuarios.map(u => `${u.nome} (${u.idUnico})`).join(' • ')
      addMsg('ia', `Online agora: ${lista}`)
      setChips([
        { label: '🔍 Buscar João', value: 'buscar João' },
        { label: '🔍 Buscar ABC123', value: 'buscar ABC123' },
        { label: '📝 Criar pedido', value: 'criar pedido' },
      ])
      return
    }

    // visível/invisível
    if (lower.includes('invis')) { setVisivel?.(false); addMsg('ia','Ok, deixei você invisível. 🔒'); return }
    if (lower.includes('visív') || lower.includes('visiv')) { setVisivel?.(true); addMsg('ia','Você está visível. 👁️'); return }

    // buscar usuário
    if (lower.startsWith('buscar ') || lower.startsWith('procurar ')) {
      const termo = msg.split(' ').slice(1).join(' ').trim()
      if (!termo) { addMsg('ia','Diga: "buscar <nome ou id>"'); return }
      const alvo = usuarios.find(u =>
        (u.nome || '').toLowerCase() === termo.toLowerCase() || (u.idUnico || '') === termo
      )
      if (!alvo?.local?.lat || !alvo?.local?.lng) { addMsg('ia','Não encontrei (ou está invisível).'); return }
      const map = mapRef?.current
      if (map?.flyTo) { map.flyTo([alvo.local.lat, alvo.local.lng], 16); addMsg('ia', `Centralizei em ${alvo.nome}. 🗺️`) }
      else addMsg('ia','Não consigo acessar o mapa (ref ausente).')
      return
    }

    // fallback do chat
    addMsg('ia', 'Posso criar pedidos! Clique em "📝 Criar pedido" ou descreva o que precisa.')
  }

  // ===== WIZARD DE PEDIDO =====
  const perguntas = [
    { campo: 'titulo', texto: '1) Dê um **título curto** para o pedido.' },
    { campo: 'tipo', texto: `2) Escolha o **tipo**:`, chips: TIPOS.map(v => ({ label: v, value: v })) },
    { campo: 'descricao', texto: '3) Faça uma **descrição** rápida.' },
    { campo: 'destino', texto: '4) Qual o **destino** (endereço/bairro ou referência)?' },
    { campo: 'valor', texto: '5) Algum **valor** pro serviço? (opcional)', chips: [{label:'R$ 20', value:'20'}, {label:'R$ 30', value:'30'}] },
    { campo: 'forma', texto: '6) **Forma de pagamento**?', chips: FORMAS.map(v => ({ label: v, value: v })) },
    { campo: 'urgencia', texto: '7) **Urgência**?', chips: URGENCIAS.map(v => ({ label: v, value: v })) },
  ]

  useEffect(() => {
    if (modo !== 'pedido') return
    limparChips()
    const p = perguntas[passo]
    if (!p) return
    addMsg('ia', p.texto)
    if (p.chips?.length) setChips(p.chips)
    if (p.campo === 'titulo' && !p.chips) {
      setChips([
        { label: 'Entrega de documento', value: 'Entrega de documento' },
        { label: 'Comprar na farmácia', value: 'Comprar na farmácia' },
        { label: 'Carona até o centro', value: 'Carona até o centro' },
      ])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, passo])

  const tratarEntradaPedido = (texto) => {
    const t = (texto || '').trim()
    const p = perguntas[passo]
    if (!p) return

    setDraft((d) => ({ ...d, [p.campo]: t || d[p.campo] }))

    const prox = passo + 1
    setPasso(prox)

    if (prox >= perguntas.length) {
      const d = { ...draft, [p.campo]: (t || draft[p.campo]) }
      addMsg('ia', `Resumo:
- Título: ${d.titulo || '(sem)'}
- Tipo: ${d.tipo || 'outro'}
- Descrição: ${d.descricao || '(sem)'}
- Destino: ${d.destino || '(sem)'}
- Valor: ${d.valor || '—'}
- Forma: ${d.forma || '—'}
- Urgência: ${d.urgencia || 'normal'}
Confirma?`)
      setChips([
        { label: '✅ Confirmar', value: 'confirmar' },
        { label: '✏️ Editar título', value: 'editar titulo' },
        { label: '✏️ Editar tipo', value: 'editar tipo' },
        { label: '✏️ Editar destino', value: 'editar destino' },
      ])
    }
  }

  const interpretarComandoPedido = async (texto) => {
  const raw = (texto || '').trim()
  const lower = raw.toLowerCase()

  // editar <campo> <novo valor...>
  if (lower.startsWith('editar ')) {
    const [, campo, ...resto] = lower.split(' ')
    const idx = perguntas.findIndex(p => p.campo === campo)
    if (idx === -1) {
      addMsg('ia', `Campo inválido. Pode ser: ${perguntas.map(p=>p.campo).join(', ')}`)
      return
    }
    if (resto.length) {
      // aplica novo valor imediatamente
      setDraft(d => ({ ...d, [campo]: resto.join(' ') }))
    }
    setPasso(idx)
    return
  }

  // confirmar/salvar/finalizar/enviar/criar (com ou sem "pedido")
  const confirmaRegex = /^(confirmar|ok|pronto|salvar|finalizar|enviar|criar)(\s+pedido)?$/i
  if (confirmaRegex.test(raw) || /confirm(ar|o)\s+pedido|salvar\s+pedido|finalizar\s+pedido|publicar/i.test(lower)) {
    await salvar()
    return
  }

  // atalho: depois de terminar o wizard, "sim" também confirma
  if (passo >= perguntas.length && /^(sim|yes|y)$/i.test(raw)) {
    await salvar()
    return
  }

  // segue o fluxo normal do wizard
  tratarEntradaPedido(raw)
}


  const salvar = async () => {
  try {
    setErro('')
    setLoading(true)

    // 👉 chama o serviço: ele pega as coordenadas (centro do mapa → geolocalização),
    // monta no formato correto (local:{lat,lng}) e grava em /pedidos.
    await criarPedido({ draft, mapRef, meuId, meuNome })

    // feedback + fecha a Assistente
    addMsg?.('ia', 'Pedido criado com sucesso! 🎉')
    onFechar?.()

    // limpa estados locais (ok mesmo fechando)
    setModo?.('chat'); setPasso?.(0)
    setDraft?.({ titulo:'', tipo:'', descricao:'', destino:'', valor:'', forma:'', urgencia:'normal' })
    setChips?.([
      { label: '📝 Criar outro pedido', value: 'criar pedido' },
      { label: '👥 Listar online', value: 'listar online' },
    ])
  } catch (e) {
    console.error('Erro ao salvar pedido:', e)
    setErro('Falha ao salvar. Veja o console.')
    addMsg('ia', '⚠️ Ocorreu um erro ao criar o pedido. Tente novamente.')
  } finally {
    setLoading(false)
  }
}



  const enviar = async (e) => {
  e?.preventDefault?.()
  const texto = entrada.trim()
  if (!texto) return

  setMensagens((msgs) => [...msgs, { de: 'eu', texto }])
  setEntrada('')

  if (modo === 'pedido') {
    if (passo >= perguntas.length && /^(confirmar|salvar|finalizar|enviar|criar)(\s+pedido)?$/i.test(texto)) {
      await salvar()
      return
    }
    await interpretarComandoPedido(texto)
    return
  }

  executarAcaoChat(texto)
}


  return open ? (
    <div className="fixed inset-0 z-[2000] bg-black/10 flex items-center justify-center">
      <div className="bg-white w-[92%] max-w-[640px] rounded-2xl shadow-2xl overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="font-semibold text-gray-800">
            {modo === 'pedido' ? 'Criar pedido' : 'Assistente'}
          </div>
          <button onClick={onFechar} className="text-gray-500 hover:text-gray-700 text-xl" title="Fechar">×</button>
        </div>

        {/* Mensagens */}
        <div ref={listaRef} className="px-5 py-4 max-h-[54vh] overflow-y-auto space-y-2">
          {mensagens.map((m, i) => (
            <div key={i} className={`flex ${m.de === 'eu' ? 'justify-end' : 'justify-start'}`}>
              <div className={`px-3 py-2 rounded-xl text-sm max-w-[80%] ${
                  m.de === 'eu'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                }`}>
                {m.texto}
              </div>
            </div>
          ))}
          {loading && <div className="text-sm text-gray-500">Salvando pedido...</div>}
          {erro && <div className="text-sm text-red-600">⚠ {erro}</div>}
        </div>

        {/* SUGESTÕES / CHIPS */}
        {sugestoes.length > 0 && (
          <div className="px-5 pt-2 pb-3 flex flex-wrap gap-2">
            {sugestoes.map((s, idx) => (
              <button
                key={idx}
                onClick={() => selecionarOpcao(s.value)}
                className="px-3 py-1.5 text-sm rounded-full border bg-white hover:bg-gray-50"
                title={s.value}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

{/* Botão de confirmação quando o wizard terminou */}
{modo === 'pedido' && passo >= perguntas.length && (
  <div className="px-5 pb-2">
    <button
      type="button"
      onClick={salvar}
      className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm hover:bg-green-700"
      title="Criar pedido agora"
    >
      ✅ Criar pedido
    </button>
  </div>
)}


        {/* Input */}
        <form onSubmit={enviar} className="px-5 pb-5 pt-2 flex gap-2">
          <input
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            placeholder={modo === 'pedido'
              ? 'Responda ou clique nas opções acima (ex.: "entrega", "pix", "alta", "confirmar").'
              : 'Diga "criar pedido" ou use as opções acima.'}
            className="flex-1 border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="submit" className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-blue-700">
            Enviar
          </button>
        </form>
      </div>
    </div>
  ) : null
}
