'use client'

export default function PerfilPublico({ user, onClose }) {
  if (!user) return null

  const profile = user.profile || {}
  const prof = user.profissional || profile.profissional || {}
  const corre = user.corre || profile.corre || {}

  const nome = user.nome || profile.nome || 'Usuário'
  const cidade = user.cidade || profile.cidade || 'Local não informado'
  const fotoURL = user.fotoURL || profile.fotoURL || ''
  const avatarEmoji = user.avatarEmoji || profile.avatarEmoji || '🙂'
  const bio = user.bio || profile.bio || ''

  const isCorre = !!(user.isCorre || profile.isCorre || corre?.ativo)
  const isProfissional = !!(user.isProfissional || profile.isProfissional || prof?.ativo || user.profissional)

  const whatsapp = prof?.whatsapp || user.profWhats || profile.whatsapp || ''
  const whatsappLimpo = String(whatsapp || '').replace(/\D/g, '')

  return (
    <div className="fixed inset-0 z-[99999]">
      {/* FUNDO */}
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* CARD */}
      <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-2xl max-h-[92vh] overflow-y-auto bg-[#07111f] text-white rounded-t-[32px] border border-white/10 shadow-[0_-28px_90px_rgba(0,0,0,0.45)] p-5 animate-slideUp">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-4 min-w-0">
            {fotoURL ? (
              <img
                src={fotoURL}
                className="w-20 h-20 rounded-3xl object-cover border-2 border-blue-500/80 shadow-2xl shadow-blue-500/20"
                alt=""
              />
            ) : (
              <div className="w-20 h-20 rounded-3xl bg-white/10 border border-white/10 flex items-center justify-center text-3xl">
                {avatarEmoji}
              </div>
            )}

            <div className="min-w-0">
              <div className="text-xl font-extrabold truncate">
                {nome}
              </div>

              <div className="text-sm text-slate-400 mt-1 truncate">
                {cidade}
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {isCorre && (
                  <span className="inline-flex px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-400/20 text-amber-300 text-xs font-bold">
                    ⚡ Corre
                  </span>
                )}

                {isProfissional && (
                  <span className="inline-flex px-3 py-1.5 rounded-full bg-blue-500/15 border border-blue-400/20 text-blue-300 text-xs font-bold">
                    🧑‍🔧 Profissional
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-bold"
          >
            ✕
          </button>
        </div>

        {bio ? (
          <div className="bg-white/[0.06] p-4 rounded-[28px] border border-white/10 mb-4">
            <div className="text-sm text-slate-400 font-bold uppercase tracking-wide mb-2">
              Sobre
            </div>
            <div className="text-sm text-slate-300 leading-relaxed">{bio}</div>
          </div>
        ) : null}

        {/* CURRÍCULO CORRE */}
        {isCorre && (
          <div className="bg-amber-500/10 p-4 rounded-[28px] border border-amber-400/20 mb-4">
            <div className="text-sm text-amber-300 font-bold uppercase tracking-wide mb-2">
              Currículo de Corre
            </div>

            <div className="text-lg font-extrabold text-white">
              {corre?.titulo || profile.correTitulo || 'Corre rápido'}
            </div>

            {(corre?.bio || profile.correBio) && (
              <div className="mt-2 text-sm text-slate-300 leading-relaxed">
                {corre?.bio || profile.correBio}
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(corre?.transporte || profile.correTransporte) && (
                <div className="rounded-2xl bg-white/10 border border-white/10 px-3 py-2">
                  <div className="text-[11px] text-slate-400">Transporte</div>
                  <div className="text-sm font-bold text-white">🚚 {corre?.transporte || profile.correTransporte}</div>
                </div>
              )}

              {(corre?.regiao || profile.correRegiao) && (
                <div className="rounded-2xl bg-white/10 border border-white/10 px-3 py-2">
                  <div className="text-[11px] text-slate-400">Região</div>
                  <div className="text-sm font-bold text-white">📍 {corre?.regiao || profile.correRegiao}</div>
                </div>
              )}

              {(corre?.disponibilidade || profile.correDisponibilidade) && (
                <div className="rounded-2xl bg-white/10 border border-white/10 px-3 py-2">
                  <div className="text-[11px] text-slate-400">Disponibilidade</div>
                  <div className="text-sm font-bold text-white">🕒 {corre?.disponibilidade || profile.correDisponibilidade}</div>
                </div>
              )}

              {(corre?.experiencia || profile.correExperiencia) && (
                <div className="rounded-2xl bg-white/10 border border-white/10 px-3 py-2">
                  <div className="text-[11px] text-slate-400">Experiência</div>
                  <div className="text-sm font-bold text-white">⭐ {corre?.experiencia || profile.correExperiencia}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CURRÍCULO PROFISSIONAL */}
        {isProfissional && (
          <div className="bg-blue-500/10 p-4 rounded-[28px] border border-blue-400/20 mb-4">
            <div className="text-sm text-blue-300 font-bold uppercase tracking-wide mb-2">
              Currículo Profissional
            </div>

            <div className="text-lg font-extrabold text-white">
              {prof?.titulo || profile.titulo || 'Profissional'}
            </div>

            {(prof?.descricao || profile.descricao) && (
              <div className="mt-2 text-sm text-slate-300 leading-relaxed">
                {prof?.descricao || profile.descricao}
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(prof?.preco || profile.preco) && (
                <div className="rounded-2xl bg-white/10 border border-white/10 px-3 py-2">
                  <div className="text-[11px] text-slate-400">Preço base</div>
                  <div className="text-sm font-bold text-white">💰 R$ {prof?.preco || profile.preco}</div>
                </div>
              )}

              {(prof?.regiao || profile.profRegiao || cidade) && (
                <div className="rounded-2xl bg-white/10 border border-white/10 px-3 py-2">
                  <div className="text-[11px] text-slate-400">Região</div>
                  <div className="text-sm font-bold text-white">📍 {prof?.regiao || profile.profRegiao || cidade}</div>
                </div>
              )}

              {(prof?.experiencia || profile.profExperiencia) && (
                <div className="rounded-2xl bg-white/10 border border-white/10 px-3 py-2 sm:col-span-2">
                  <div className="text-[11px] text-slate-400">Experiência</div>
                  <div className="text-sm font-bold text-white">⭐ {prof?.experiencia || profile.profExperiencia}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* WHATSAPP */}
        {whatsappLimpo && (
          <a
            href={`https://wa.me/55${whatsappLimpo}`}
            target="_blank"
            rel="noreferrer"
            className="block text-center bg-emerald-600 hover:bg-emerald-700 py-4 rounded-3xl font-extrabold shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition"
          >
            Falar no WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}
