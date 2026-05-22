'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { database } from '@/lib/firebase'
import { limitToLast, onValue, query, ref } from 'firebase/database'

function getMs(v) {
  if (!v) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const parsed = Date.parse(v)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000
  return 0
}

function formatData(v) {
  const ms = getMs(v)
  if (!ms) return 'sem data'
  return new Date(ms).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const TIPOS = {
  servico_nao_resolvido: 'Serviço não resolvido',
  valor_combinado: 'Valor ou combinado',
  atraso_cancelamento: 'Atraso ou cancelamento',
  conduta_inadequada: 'Conduta inadequada',
  seguranca_golpe: 'Segurança ou golpe',
  outro: 'Outro',
}

function normalizeProblema(item, origem) {
  if (!item) return null
  return {
    ...item,
    origem,
    id: item.id || `${origem}_${item.pedidoId || ''}_${item.criadoEm || ''}`,
    tipoLabel: TIPOS[item.tipo] || item.tipo || 'Problema',
  }
}

function pedidoDoProblema(problema, pedidos) {
  return (pedidos || []).find((p) => String(p?.id || '') === String(problema?.pedidoId || '')) || null
}

export default function PainelProblemasDenuncias({
  meuId,
  corres = [],
  onAbrirChat,
  onAbrirPedido,
}) {
  const [problemasRaw, setProblemasRaw] = useState([])
  const [denunciasRaw, setDenunciasRaw] = useState([])
  const [filtro, setFiltro] = useState('todos')

  useEffect(() => {
    const pRef = query(ref(database, 'problemasServico'), limitToLast(120))
    const off = onValue(pRef, (snap) => {
      const raw = snap.val() || {}
      setProblemasRaw(Object.entries(raw).map(([id, p]) => ({ id, ...(p || {}) })))
    })
    return () => off()
  }, [])

  useEffect(() => {
    const dRef = query(ref(database, 'denuncias'), limitToLast(120))
    const off = onValue(dRef, (snap) => {
      const raw = snap.val() || {}
      setDenunciasRaw(Object.entries(raw).map(([id, p]) => ({ id, ...(p || {}) })))
    })
    return () => off()
  }, [])

  const meusPedidosComProblema = useMemo(() => {
    return (corres || [])
      .filter((p) => {
        if (!p?.problemaServico) return false
        return p?.criador?.id === meuId || p?.aceite?.id === meuId
      })
      .map((p) =>
        normalizeProblema(
          {
            ...p.problemaServico,
            id: `pedido_${p.id}`,
            pedidoId: p.id,
            clienteId: p?.criador?.id || null,
            aceitadorId: p?.aceite?.id || null,
            pedidoTitulo: p?.titulo || 'Corre aqui',
          },
          'pedido'
        )
      )
  }, [corres, meuId])

  const registros = useMemo(() => {
    const userMatch = (p) => {
      if (!meuId) return false
      return (
        p?.autor?.id === meuId ||
        p?.clienteId === meuId ||
        p?.aceitadorId === meuId
      )
    }

    const all = [
      ...problemasRaw.filter(userMatch).map((p) => normalizeProblema(p, 'problema')),
      ...denunciasRaw.filter(userMatch).map((p) => normalizeProblema(p, 'denuncia')),
      ...meusPedidosComProblema,
    ].filter(Boolean)

    const byId = new Map()
    all.forEach((p) => {
      const key = `${p.origem}:${p.id}`
      if (!byId.has(key)) byId.set(key, p)
    })

    return Array.from(byId.values()).sort((a, b) => getMs(b.criadoEm) - getMs(a.criadoEm))
  }, [problemasRaw, denunciasRaw, meusPedidosComProblema, meuId])

  const filtrados = useMemo(() => {
    if (filtro === 'denuncias') return registros.filter((p) => p.denuncia || p.origem === 'denuncia')
    if (filtro === 'abertos') return registros.filter((p) => String(p.status || 'aberto').toLowerCase() === 'aberto')
    return registros
  }, [registros, filtro])

  const totalDenuncias = registros.filter((p) => p.denuncia || p.origem === 'denuncia').length
  const totalAbertos = registros.filter((p) => String(p.status || 'aberto').toLowerCase() === 'aberto').length

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#07111f] text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="border-b border-white/10 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-red-300">Segurança</div>
            <div className="mt-1 text-xl font-black">Problemas e denúncias</div>
            <div className="mt-1 text-xs text-slate-400">
              Acompanhe registros ligados aos seus pedidos e conversas.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2">
              <div className="text-lg font-black text-white">{totalAbertos}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">abertos</div>
            </div>
            <div className="rounded-2xl border border-red-300/20 bg-red-500/10 px-3 py-2">
              <div className="text-lg font-black text-red-100">{totalDenuncias}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-red-300">denúncias</div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ['todos', `Todos ${registros.length}`],
            ['abertos', `Abertos ${totalAbertos}`],
            ['denuncias', `Denúncias ${totalDenuncias}`],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              className={[
                'h-10 rounded-2xl border text-xs font-black transition active:scale-[0.98]',
                filtro === id
                  ? 'border-red-300/35 bg-red-500/16 text-red-100'
                  : 'border-white/10 bg-white/[0.045] text-slate-300 hover:bg-white/[0.08]',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[calc(100dvh-15rem)] overflow-y-auto p-3">
        {filtrados.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/12 bg-white/[0.035] p-5 text-center">
            <div className="text-lg font-black">Nenhum problema registrado</div>
            <div className="mt-1 text-sm leading-relaxed text-slate-400">
              Quando você registrar um problema ou denúncia, ele aparece aqui.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtrados.map((p, index) => {
              const pedido = pedidoDoProblema(p, corres)
              const denuncia = p.denuncia || p.origem === 'denuncia'
              return (
                <motion.article
                  key={`${p.origem}-${p.id}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: Math.min(index * 0.025, 0.18) }}
                  className={[
                    'rounded-[24px] border p-4',
                    denuncia
                      ? 'border-red-300/25 bg-red-500/10'
                      : 'border-amber-300/20 bg-amber-500/10',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-200">
                          {denuncia ? 'Denúncia' : 'Problema'}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                          {p.status || 'aberto'}
                        </span>
                      </div>
                      <div className="mt-2 text-base font-black text-white">{p.tipoLabel}</div>
                      <div className="mt-1 truncate text-sm font-semibold text-slate-300">
                        {p.pedidoTitulo || pedido?.titulo || 'Corre aqui'}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[11px] font-bold text-slate-500">
                      {formatData(p.criadoEm)}
                    </div>
                  </div>

                  {p.descricao ? (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/10 px-3 py-2 text-sm leading-relaxed text-slate-200">
                      {p.descricao}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {pedido ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onAbrirChat?.(pedido)}
                          className="rounded-2xl bg-blue-600 px-3 py-2 text-xs font-black text-white transition hover:bg-blue-500 active:scale-[0.98]"
                        >
                          Abrir conversa
                        </button>
                        <button
                          type="button"
                          onClick={() => onAbrirPedido?.(pedido)}
                          className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-200 transition hover:bg-white/[0.1]"
                        >
                          Ver pedido
                        </button>
                      </>
                    ) : (
                      <span className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-400">
                        Pedido ainda não carregado
                      </span>
                    )}
                  </div>
                </motion.article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
