'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { database } from '@/lib/firebase'
import { limitToLast, onValue, query, ref } from '@/lib/firebaseDebug'

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
    <div className="overflow-hidden rounded-[24px] border border-blue-100 bg-white text-slate-950 shadow-[0_18px_55px_rgba(37,99,235,0.12)] md:rounded-[32px]">
      <div className="border-b border-blue-100 bg-[linear-gradient(135deg,#eef8ff_0%,#ffffff_58%,#fff6bf_100%)] px-3 py-3 md:px-4 md:py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 md:text-[11px] md:tracking-[0.18em]">Segurança</div>
            <div className="mt-0.5 text-lg font-black text-blue-950 md:mt-1 md:text-xl">Problemas e denúncias</div>
            <div className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-slate-600 md:mt-1 md:text-xs">
              Acompanhe registros ligados aos seus pedidos e conversas.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-center md:gap-2">
            <div className="rounded-xl border border-blue-100 bg-white px-2 py-1.5 shadow-sm md:rounded-2xl md:px-3 md:py-2">
              <div className="text-base font-black text-blue-950 md:text-lg">{totalAbertos}</div>
              <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500 md:text-[10px] md:tracking-[0.12em]">abertos</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-2 py-1.5 shadow-sm md:rounded-2xl md:px-3 md:py-2">
              <div className="text-base font-black text-rose-700 md:text-lg">{totalDenuncias}</div>
              <div className="text-[9px] font-black uppercase tracking-[0.1em] text-rose-500 md:text-[10px] md:tracking-[0.12em]">denúncias</div>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5 md:mt-4 md:gap-2">
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
                'h-9 rounded-xl border text-[11px] font-black transition active:scale-[0.98] md:h-10 md:rounded-2xl md:text-xs',
                filtro === id
                  ? 'border-blue-600 bg-blue-700 text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)]'
                  : 'border-blue-100 bg-white text-slate-700 hover:bg-blue-50',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto bg-slate-50 p-2 md:max-h-[calc(100dvh-15rem)] md:p-3">
        {filtrados.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-blue-200 bg-white p-5 text-center">
            <div className="text-lg font-black text-blue-950">Nenhum problema registrado</div>
            <div className="mt-1 text-sm leading-relaxed text-slate-600">
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
                    'rounded-[18px] border p-2.5 md:rounded-[24px] md:p-4',
                    denuncia
                      ? 'border-rose-200 bg-rose-50'
                      : 'border-yellow-200 bg-yellow-50',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-blue-100 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-800">
                          {denuncia ? 'Denúncia' : 'Problema'}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
                          {p.status || 'aberto'}
                        </span>
                      </div>
                      <div className="mt-1.5 text-sm font-black text-blue-950 md:mt-2 md:text-base">{p.tipoLabel}</div>
                      <div className="mt-1 truncate text-xs font-semibold text-slate-700 md:text-sm">
                        {p.pedidoTitulo || pedido?.titulo || 'Corre aqui'}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[11px] font-bold text-slate-500">
                      {formatData(p.criadoEm)}
                    </div>
                  </div>

                  {p.descricao ? (
                    <div className="mt-2.5 rounded-xl border border-white bg-white/78 px-3 py-2 text-xs font-semibold leading-snug text-slate-700 shadow-sm md:mt-3 md:rounded-2xl md:text-sm md:leading-relaxed">
                      {p.descricao}
                    </div>
                  ) : null}

                  <div className="mt-2.5 flex flex-wrap gap-1.5 md:mt-3 md:gap-2">
                    {pedido ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onAbrirChat?.(pedido)}
                          className="rounded-xl bg-blue-700 px-3 py-1.5 text-xs font-black text-white shadow-[0_10px_22px_rgba(37,99,235,0.18)] transition hover:bg-blue-800 active:scale-[0.98] md:rounded-2xl md:py-2"
                        >
                          Abrir conversa
                        </button>
                        <button
                          type="button"
                          onClick={() => onAbrirPedido?.(pedido)}
                          className="rounded-xl border border-blue-100 bg-white px-3 py-1.5 text-xs font-black text-blue-800 transition hover:bg-blue-50 md:rounded-2xl md:py-2"
                        >
                          Ver pedido
                        </button>
                      </>
                    ) : (
                      <span className="rounded-xl border border-blue-100 bg-white px-3 py-1.5 text-xs font-bold text-slate-500 md:rounded-2xl md:py-2">
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
