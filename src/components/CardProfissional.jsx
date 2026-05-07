'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'

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
    <>
      <style>{`
        .corre-card-clean,
        .corre-card-clean * {
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .corre-card-clean ::selection {
          background: transparent;
          color: inherit;
        }
        .corre-card-clean:active,
        .corre-card-clean:focus,
        .corre-card-clean:focus-within {
          background-color: #ffffff;
          filter: none;
          transform: none;
        }
      `}</style>
      <motion.div
        initial={{ opacity: 0, y: 22, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        whileHover={{ y: -3, scale: 1.01 }}
        whileTap={{ scale: 0.985 }}
        className="corre-card-clean relative overflow-hidden h-full rounded-[24px] md:rounded-[26px] border border-slate-200 bg-white transition-shadow duration-200 hover:shadow-[0_22px_54px_rgba(15,23,42,0.16)] p-3 md:p-3.5 shadow-[0_14px_42px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/5 select-none cursor-default"
      >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(59,130,246,0.12),transparent_32%),radial-gradient(circle_at_88%_12%,rgba(16,185,129,0.12),transparent_28%)]" />
      <div className="relative z-10 flex items-start gap-2.5">
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-slate-100 border border-white overflow-hidden flex items-center justify-center shrink-0 shadow-[0_12px_30px_rgba(15,23,42,0.18)] ring-4 ring-slate-100">
          {fotoURL ? (
            <img
              src={fotoURL}
              alt={nome}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="text-xl md:text-2xl">{emoji}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-600">Disponível</div>
              <div className="mt-0.5 font-black text-slate-950 text-sm md:text-base leading-tight truncate">
                {nome}
              </div>

              <div className="mt-1 text-[11px] text-slate-600">
                {cidade ? <>📍 <b className="text-slate-800">{cidade}</b></> : 'Cidade não informada'}
              </div>
            </div>

            <div className="flex gap-1 flex-wrap justify-end">
              {tags.map((x) => (
                <span
                  key={x.t}
                  className={`text-[10px] px-2.5 py-1 rounded-full border font-black shadow-sm ${x.cls}`}
                >
                  {x.t}
                </span>
              ))}
            </div>
          </div>

          {isCorre && (
            <div className="mt-2 rounded-2xl bg-amber-50/95 border border-amber-200 p-2 md:p-2.5 shadow-sm">
              <div className="text-xs font-black text-amber-800">
                ⚡ {tituloCorre}
              </div>

              {resumoCorre ? (
                <div className="mt-1 text-xs text-slate-700 font-medium line-clamp-1">
                  {resumoCorre}
                </div>
              ) : null}

              <div className="mt-1.5 flex flex-wrap gap-1">
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
            <div className="mt-2 rounded-2xl bg-blue-50/95 border border-blue-200 p-2 md:p-2.5 shadow-sm">
              <div className="text-xs font-black text-blue-800">
                🧑‍🔧 {tituloProf || 'Profissional'}
              </div>

              {resumoProf ? (
                <div className="mt-1 text-xs text-slate-700 font-medium line-clamp-1">
                  {resumoProf}
                </div>
              ) : null}

              <div className="mt-1.5 flex flex-wrap gap-1">
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
            <div className="mt-2 text-xs text-slate-700 font-medium line-clamp-1">
              {resumo}
            </div>
          ) : null}

          <div className="mt-2 md:mt-2.5 flex gap-1.5 md:gap-2 flex-wrap">
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => onAbrir?.(item)}
              className="flex-1 min-w-[96px] h-[34px] md:h-[38px] rounded-xl bg-slate-950 hover:bg-black border border-slate-900 text-white text-xs font-black transition-all duration-200 active:scale-[0.98] shadow-lg shadow-slate-900/20"
            >
              Ver currículo
            </motion.button>

            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => onWhatsapp?.(item)}
              disabled={!whats}
              className="h-[34px] md:h-[38px] px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-black disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] shadow-sm"
              title={whats ? 'Chamar no WhatsApp' : 'WhatsApp não informado'}
            >
              WhatsApp
            </motion.button>
          </div>
        </div>
      </div>
      </motion.div>
    </>
  )
}