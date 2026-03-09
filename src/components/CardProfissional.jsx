'use client'

import { useMemo } from 'react'

function safeUrl(u) {
  const s = String(u || '').trim()
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) return ''
  return s
}

export default function CardProfissional({ item, onAbrir, onWhatsapp }) {
  const nome = item?.nome || 'Profissional'
  const fotoURL = safeUrl(item?.fotoURL || item?.profile?.fotoURL || '')
  const emoji = String(item?.avatarEmoji || item?.profile?.avatarEmoji || '🙂')
  const isProf = !!item?.isProfissional
  const isCorre = !!item?.isCorre

  const tags = useMemo(() => {
    const out = []
    if (isProf) out.push({ t: 'Profissional', cls: 'bg-blue-500/15 border-blue-400/20 text-blue-100' })
    if (isCorre) out.push({ t: 'Corre', cls: 'bg-yellow-400/15 border-yellow-300/25 text-yellow-100' })
    return out
  }, [isProf, isCorre])

  const resumo = String(item?.profResumo || '').trim()
  const preco = String(item?.profPrecoBase || '').trim()
  const cidade = String(item?.profCidadeAtende || item?.cidade || '').trim()

  const whats = String(item?.profWhats || '').trim()

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 hover:bg-white/7 transition p-3">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
          {fotoURL ? (
            <img
              src={fotoURL}
              alt={nome}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <span className="text-2xl">{emoji}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold text-gray-100 truncate">{nome}</div>
            {tags.map((x) => (
              <span key={x.t} className={`text-[11px] px-2 py-0.5 rounded-full border ${x.cls}`}>
                {x.t}
              </span>
            ))}
          </div>

          <div className="mt-1 text-[11px] text-gray-400">
            {cidade ? <span>{cidade}</span> : <span>—</span>}
            {preco ? <span> · a partir de <b className="text-gray-200">R$ {preco}</b></span> : null}
          </div>

          {resumo ? (
            <div className="mt-2 text-xs text-gray-200 line-clamp-2">{resumo}</div>
          ) : (
            <div className="mt-2 text-xs text-gray-500">Sem resumo ainda.</div>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => onAbrir?.(item)}
          className="flex-1 min-w-[120px] h-[40px] rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-gray-100 text-sm font-semibold active:scale-[0.98] transition"
        >
          Ver perfil
        </button>

        <button
          type="button"
          onClick={() => {
            if (!whats) return
            onWhatsapp?.(item)
          }}
          disabled={!whats}
          className="h-[40px] px-4 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/20 border border-emerald-400/20 text-emerald-100 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition"
          title={whats ? 'Abrir WhatsApp' : 'Sem WhatsApp cadastrado'}
        >
          WhatsApp
        </button>
      </div>
    </div>
  )
}
