'use client'

import { useEffect, useRef, useState } from 'react'
import { database } from '@/lib/firebase'
import { ref, push, set, serverTimestamp } from 'firebase/database'
import { criarPedido } from '../lib/mapapedidos'

const TIPOS = ['serviço', 'compra', 'ajuda', 'carona', 'outro']
const URGENCIAS = ['baixa', 'normal', 'alta']
const FORMAS = ['pix', 'dinheiro', 'cartão']

function classificarTipo(texto) {
  const t = (texto || '').toLowerCase()
  if (/entreg(ar|a)|levar|coletar|retirar/.test(t)) return 'serviço'
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
  const selecionarOpcao = async (texto) => {
    setMensagens((msgs) => [...msgs, { de: 'eu', texto }])
    if (modo === 'pedido') await interpretarComandoPedido(texto)
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
        { label: 'Serviço de documento', value: 'Serviço de documento' },
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
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-950/68 px-2 pb-2 pt-10 backdrop-blur-md sm:items-center sm:p-4">
      <div className="relative flex max-h-[92dvh] w-full max-w-[680px] flex-col overflow-hidden rounded-[28px] border border-white/12 bg-[#07111f]/96 text-white shadow-[0_30px_120px_rgba(0,0,0,0.62)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(34,211,238,0.17),transparent_34%),radial-gradient(circle_at_95%_10%,rgba(255,217,26,0.16),transparent_30%)]" />

        <div className="relative flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <div className="inline-flex rounded-full border border-yellow-300/30 bg-yellow-300/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-yellow-100">
              Corre Aqui IA
            </div>
            <h2 className="mt-2 text-lg font-black tracking-tight sm:text-2xl">
              {modo === 'pedido' ? 'Criar pedido guiado' : 'Assistente rápido'}
            </h2>
            <p className="mt-0.5 line-clamp-1 text-xs font-semibold text-slate-400 sm:text-sm">
              Descreva o que precisa e eu organizo em pedido.
            </p>
          </div>

          <button
            type="button"
            onClick={onFechar}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-xl font-black text-white transition hover:bg-white/[0.12]"
            title="Fechar"
          >
            ×
          </button>
        </div>

        <div ref={listaRef} className="relative min-h-[280px] flex-1 space-y-2 overflow-y-auto px-4 py-4 sm:max-h-[54vh] sm:px-5">
          {mensagens.map((m, i) => (
            <div key={`${m.de}-${i}`} className={`flex ${m.de === 'eu' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={[
                  'max-w-[84%] whitespace-pre-line rounded-[18px] px-3 py-2 text-sm leading-relaxed shadow-[0_10px_24px_rgba(0,0,0,0.14)]',
                  m.de === 'eu'
                    ? 'rounded-br-md bg-blue-600 text-white'
                    : 'rounded-bl-md border border-white/10 bg-white/[0.065] text-slate-100',
                ].join(' ')}
              >
                {m.texto}
              </div>
            </div>
          ))}
          {loading ? (
            <div className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-black text-emerald-100">
              Salvando pedido...
            </div>
          ) : null}
          {erro ? (
            <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-100">
              ⚠ {erro}
            </div>
          ) : null}
        </div>

        {sugestoes.length > 0 ? (
          <div className="relative border-t border-white/10 px-4 py-3 sm:px-5">
            <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden">
              {sugestoes.map((s, idx) => (
                <button
                  key={`${s.value}-${idx}`}
                  type="button"
                  onClick={() => selecionarOpcao(s.value)}
                  className="shrink-0 rounded-full border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-black text-slate-100 transition hover:bg-white/[0.11] active:scale-[0.98]"
                  title={s.value}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {modo === 'pedido' && passo >= perguntas.length ? (
          <div className="relative px-4 pb-2 sm:px-5">
            <button
              type="button"
              onClick={salvar}
              disabled={loading}
              className="h-11 w-full rounded-2xl bg-[#ffd91a] px-4 text-sm font-black text-blue-950 shadow-[0_14px_36px_rgba(250,204,21,0.22)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              title="Criar pedido agora"
            >
              ✅ Criar pedido
            </button>
          </div>
        ) : null}

        <form onSubmit={enviar} className="relative flex gap-2 border-t border-white/10 bg-slate-950/45 px-4 py-3 sm:px-5 sm:py-4">
          <input
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            placeholder={modo === 'pedido'
              ? 'Responda aqui ou toque em uma sugestão...'
              : 'Diga "criar pedido" ou descreva o serviço...'}
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-blue-400/35"
          />
          <button
            type="submit"
            disabled={loading || !entrada.trim()}
            className="h-12 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-[0_14px_34px_rgba(37,99,235,0.28)] transition hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Enviar
          </button>
        </form>
      </div>
    </div>
  ) : null
}
