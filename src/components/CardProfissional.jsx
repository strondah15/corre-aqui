'use client'

import { useMemo } from 'react'

function safeUrl(u) {
  const s = String(u || '').trim()
  if (!s) return ''

  // Aceita fotos do Firebase Storage/Google, links normais, blob local e base64.
  // Antes só aceitava http(s), então alguns uploads viravam emoji no card do cliente.
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(s)) return s

  return ''
}

function getFotoURL(item) {
  return safeUrl(
    item?.fotoURL ||
      item?.photoURL ||
      item?.avatarUrl ||
      item?.avatarURL ||
      item?.imagem ||
      item?.imageUrl ||
      item?.profile?.fotoURL ||
      item?.profile?.photoURL ||
      item?.profile?.avatarUrl ||
      item?.profile?.avatarURL ||
      item?.profile?.imagem ||
      item?.profile?.imageUrl ||
      item?.perfil?.fotoURL ||
      item?.perfil?.photoURL ||
      item?.profissional?.fotoURL ||
      item?.profissional?.photoURL ||
      item?.corre?.fotoURL ||
      item?.corre?.photoURL ||
      ''
  )
}

export default function CardProfissional({ item, onAbrir, onWhatsapp }) {
  const nome = item?.nome || item?.profile?.nome || 'Profissional'
  const fotoURL = getFotoURL(item)
  const emoji = String(item?.avatarEmoji || item?.profile?.avatarEmoji || item?.perfil?.avatarEmoji || '🙂')
  const isProf = !!(item?.isProfissional || item?.profile?.isProfissional || item?.profissional)
  const isCorre = !!(item?.isCorre || item?.profile?.isCorre)

  const tags = useMemo(() => {
    const out = []
    if (isProf) out.push({ t: 'Profissional', cls: 'bg-blue-50 border-blue-200 text-blue-700' })
    if (isCorre) out.push({ t: 'Bico / Corre', cls: 'bg-amber-50 border-amber-200 text-amber-700' })
    return out
  }, [isProf, isCorre])

  const prof = item?.profissional || item?.profile?.profissional || {}
  const corre = item?.corre || item?.profile?.corre || {}

  const tituloProf = String(prof?.titulo || item?.profile?.titulo || item?.titulo || '').trim()
  const resumoProf = String(item?.profResumo || prof?.descricao || item?.profile?.descricao || '').trim()
  const preco = String(item?.profPrecoBase || prof?.preco || item?.profile?.preco || '').trim()
  const cidade = String(item?.profCidadeAtende || prof?.regiao || item?.cidade || item?.profile?.cidade || '').trim()
  const profExperiencia = String(item?.profExperiencia || prof?.experiencia || '').trim()

  const tituloCorre = String(item?.correTitulo || corre?.titulo || 'Corre rápido').trim()
  const resumoCorre = String(item?.correResumo || corre?.bio || item?.profile?.bio || '').trim()
  const transporte = String(item?.correTransporte || corre?.transporte || '').trim()
  const regiaoCorre = String(item?.correRegiao || corre?.regiao || cidade || '').trim()
  const dispCorre = String(item?.correDisponibilidade || corre?.disponibilidade || '').trim()
  const expCorre = String(item?.correExperiencia || corre?.experiencia || '').trim()

  const resumo = isProf ? resumoProf : resumoCorre
  const whats = String(item?.profWhats || prof?.whatsapp || item?.profile?.whatsapp || '').trim()

  return (
    <div className="rounded-3xl border border-slate-200 bg-white hover:bg-slate-50 transition p-4 shadow-[0_14px_45px_rgba(15,23,42,0.08)]">
      <div className="flex items-start gap-3">
        <div className="w-16 h-16 rounded-3xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 shadow-sm">
          {fotoURL ? (
            <img
              src={fotoURL}
              alt={nome}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="text-3xl">{emoji}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-extrabold text-slate-950 truncate">
                {nome}
              </div>

              <div className="mt-1 text-[11px] text-slate-500">
                {cidade ? <>📍 <b className="text-slate-800">{cidade}</b></> : 'Cidade não informada'}
              </div>
            </div>

            <div className="flex gap-1 flex-wrap justify-end">
              {tags.map((x) => (
                <span
                  key={x.t}
                  className={`text-[10px] px-2 py-1 rounded-full border font-extrabold ${x.cls}`}
                >
                  {x.t}
                </span>
              ))}
            </div>
          </div>

          {isCorre && (
            <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-200 p-3">
              <div className="text-xs font-extrabold text-amber-800">
                ⚡ {tituloCorre}
              </div>

              {resumoCorre ? (
                <div className="mt-1 text-xs text-slate-700 line-clamp-2">
                  {resumoCorre}
                </div>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-1.5">
                {transporte ? (
                  <span className="text-[10px] px-2 py-1 rounded-full bg-white border border-amber-200 text-amber-800 font-bold">
                    🚚 {transporte}
                  </span>
                ) : null}
                {regiaoCorre ? (
                  <span className="text-[10px] px-2 py-1 rounded-full bg-white border border-amber-200 text-amber-800 font-bold">
                    📍 {regiaoCorre}
                  </span>
                ) : null}
                {dispCorre ? (
                  <span className="text-[10px] px-2 py-1 rounded-full bg-white border border-amber-200 text-amber-800 font-bold">
                    🕒 {dispCorre}
                  </span>
                ) : null}
                {expCorre ? (
                  <span className="text-[10px] px-2 py-1 rounded-full bg-white border border-amber-200 text-amber-800 font-bold">
                    ⭐ {expCorre}
                  </span>
                ) : null}
              </div>
            </div>
          )}

          {isProf && (
            <div className="mt-3 rounded-2xl bg-blue-50 border border-blue-200 p-3">
              <div className="text-xs font-extrabold text-blue-800">
                🧑‍🔧 {tituloProf || 'Profissional'}
              </div>

              {resumoProf ? (
                <div className="mt-1 text-xs text-slate-700 line-clamp-2">
                  {resumoProf}
                </div>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-1.5">
                {preco ? (
                  <span className="text-[10px] px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800 font-bold">
                    💰 R$ {preco}
                  </span>
                ) : null}
                {profExperiencia ? (
                  <span className="text-[10px] px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-800 font-bold">
                    ⭐ {profExperiencia}
                  </span>
                ) : null}
              </div>
            </div>
          )}

          {!isCorre && !isProf && resumo ? (
            <div className="mt-2 text-xs text-slate-700 line-clamp-2">
              {resumo}
            </div>
          ) : null}

          <div className="mt-3 flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onAbrir?.(item)}
              className="flex-1 min-w-[120px] h-[40px] rounded-2xl bg-slate-900 hover:bg-black border border-slate-900 text-white text-sm font-bold active:scale-[0.98] transition shadow-lg shadow-slate-900/10"
            >
              Ver currículo
            </button>

            <button
              type="button"
              onClick={() => onWhatsapp?.(item)}
              disabled={!whats}
              className="h-[40px] px-4 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition"
              title={whats ? 'Chamar no WhatsApp' : 'WhatsApp não informado'}
            >
              WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
