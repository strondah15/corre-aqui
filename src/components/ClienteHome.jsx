'use client'

import { useMemo, useState } from 'react'
import { CATEGORIES } from '@/constants/categories'

const glass =
  'bg-white/10 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/40'

const safeStr = (v) => String(v || '').trim()

const getLabelCategoria = (id) => {
  const c = CATEGORIES.find((x) => x.id === id)
  return c ? `${c.emoji} ${c.label}` : '—'
}

const normalizeProvider = (u) => {
  const uid = u?.uid || u?.id || null
  if (!uid) return null

  const nome = u?.nome || u?.profile?.nome || 'Usuário'
  const fotoURL = safeStr(u?.fotoURL || u?.profile?.fotoURL || '')
  const avatarEmoji = safeStr(u?.avatarEmoji || u?.profile?.avatarEmoji || '')

  const isCorre = !!(u?.isCorre || u?.profissional?.isCorre)
  const isProfissional = !!(u?.isProfissional || u?.profissional?.isProfissional)

  const profCategorias = Array.isArray(u?.profCategorias)
    ? u.profCategorias
    : Array.isArray(u?.profissional?.profCategorias)
      ? u.profissional.profCategorias
      : []

  const profResumo = safeStr(u?.profResumo || u?.profissional?.profResumo || '')
  const profCidadeAtende = safeStr(
    u?.profCidadeAtende || u?.profissional?.profCidadeAtende || u?.profile?.cidade || ''
  )
  const profPrecoBase = safeStr(u?.profPrecoBase || u?.profissional?.profPrecoBase || '')
  const profWhats = safeStr(u?.profWhats || u?.profissional?.profWhats || '')

  const local = u?.local || null
  const lat = Number(local?.lat)
  const lng = Number(local?.lng)
  const okLoc = Number.isFinite(lat) && Number.isFinite(lng)

  return {
    uid,
    nome,
    fotoURL,
    avatarEmoji,
    isCorre,
    isProfissional,
    profCategorias,
    profResumo,
    profCidadeAtende,
    profPrecoBase,
    profWhats,
    local: okLoc ? { lat, lng } : null,
  }
}

export default function ClienteHome({
  meuNome = 'Anônimo',
  onCriarPedido,
  onIrAoVivo,
  onlineUsers = [],
}) {
  const [modo, setModo] = useState('corre') // corre | profissional
  const [busca, setBusca] = useState('')
  const [catId, setCatId] = useState('servicos_gerais')

  const providers = useMemo(() => {
    const list = Array.isArray(onlineUsers) ? onlineUsers : []
    return list.map(normalizeProvider).filter(Boolean)
  }, [onlineUsers])

  const list = useMemo(() => {
    const t = busca.trim().toLowerCase()

    const base = providers.filter((p) =>
      modo === 'corre' ? p.isCorre : p.isProfissional
    )

    const byCat =
      modo === 'profissional' && catId
        ? base.filter((p) => (p.profCategorias || []).includes(catId))
        : base

    const bySearch = !t
      ? byCat
      : byCat.filter((p) => {
          const nome = safeStr(p.nome).toLowerCase()
          const cidade = safeStr(p.profCidadeAtende).toLowerCase()
          const resumo = safeStr(p.profResumo).toLowerCase()
          return nome.includes(t) || cidade.includes(t) || resumo.includes(t)
        })

    return bySearch.slice(0, 60)
  }, [providers, modo, busca, catId])

  return (
    <div className="mt-4 space-y-3">
      <div className={`rounded-3xl p-4 ${glass}`}>
        <div className="text-sm font-semibold text-white">
          👋 Olá, {meuNome || 'Anônimo'}
        </div>
        <div className="mt-1 text-xs text-white/70">
          Crie um pedido e encontre quem está disponível.
        </div>

        <div className="mt-3 flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onCriarPedido?.()}
            className="px-4 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold active:scale-[0.98] transition"
          >
            🎯 Criar pedido
          </button>

          <button
            type="button"
            onClick={() => onIrAoVivo?.()}
            className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-sm font-semibold active:scale-[0.98] transition"
          >
            🗺️ Ver mapa ao vivo
          </button>
        </div>
      </div>

      <div className={`rounded-3xl p-4 ${glass}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-white">🔎 Buscar</div>
          <div className="text-xs text-white/70">
            Encontrados: <b className="text-white">{list.length}</b>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setModo('corre')}
            className={[
              'flex-1 h-11 rounded-2xl text-sm font-semibold border transition',
              modo === 'corre'
                ? 'bg-yellow-300 text-black border-yellow-300'
                : 'bg-white/10 text-white border-white/10 hover:bg-white/15',
            ].join(' ')}
          >
            ⚡ Corre
          </button>
          <button
            type="button"
            onClick={() => setModo('profissional')}
            className={[
              'flex-1 h-11 rounded-2xl text-sm font-semibold border transition',
              modo === 'profissional'
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white/10 text-white border-white/10 hover:bg-white/15',
            ].join(' ')}
          >
            🧑‍🔧 Profissionais
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, cidade ou descrição..."
            className="w-full px-3 py-3 rounded-2xl bg-white/10 border border-white/10 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />

          {modo === 'profissional' && (
            <select
              value={catId}
              onChange={(e) => setCatId(e.target.value)}
              className="w-full px-3 py-3 rounded-2xl bg-white/10 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id} className="text-black">
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="mt-3 space-y-2">
          {list.length === 0 ? (
            <div className="rounded-2xl p-4 bg-white/5 border border-white/10 text-white/80">
              Ninguém disponível agora.
            </div>
          ) : (
            list.map((p) => (
              <div
                key={p.uid}
                className="rounded-2xl p-3 bg-white/5 border border-white/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                      {p.fotoURL ? (
                        <img
                          src={p.fotoURL}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      ) : (
                        <span className="text-xl">{p.avatarEmoji || '🙂'}</span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-white truncate">{p.nome}</div>
                        {p.isCorre && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-300/20 text-yellow-100 border border-yellow-300/25">
                            corre
                          </span>
                        )}
                        {p.isProfissional && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-100 border border-blue-500/25">
                            prof
                          </span>
                        )}
                      </div>

                      {modo === 'profissional' && (
                        <div className="text-[11px] text-white/70 mt-0.5">
                          {getLabelCategoria(catId)}
                          {p.profCidadeAtende ? ` · ${p.profCidadeAtende}` : ''}
                          {p.profPrecoBase ? ` · base: R$ ${p.profPrecoBase}` : ''}
                        </div>
                      )}

                      {p.profResumo ? (
                        <div className="mt-2 text-xs text-white/80">{p.profResumo}</div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    {p.profWhats ? (
                      <a
                        className="px-3 py-2 rounded-2xl bg-emerald-500/20 border border-emerald-400/25 text-emerald-100 text-xs font-semibold hover:bg-emerald-500/25"
                        href={`https://wa.me/${p.profWhats}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp
                      </a>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => onIrAoVivo?.()}
                      className="px-3 py-2 rounded-2xl bg-white/10 border border-white/10 text-white text-xs font-semibold hover:bg-white/15"
                    >
                      Ver no mapa
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 text-[11px] text-white/50">
          Dica: “Corre” é bico rápido. “Profissionais” é por categoria.
        </div>
      </div>
    </div>
  )
}
