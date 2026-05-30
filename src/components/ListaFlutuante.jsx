'use client'
import React from 'react'

export default function ListaFlutuante({
  open = false,
  usuarios = [],
  onFechar = () => {},
  buscarUsuario = () => {},
  busca = '',
  setBusca = () => {},
}) {
  const lista = Array.isArray(usuarios) ? usuarios : []

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1500] flex items-end justify-center bg-slate-950/55 px-2 pb-2 pt-10 backdrop-blur-md sm:items-center sm:p-4">
      <div className="relative flex max-h-[88dvh] w-full max-w-[540px] flex-col overflow-hidden rounded-[28px] border border-white/12 bg-[#07111f]/96 text-white shadow-[0_30px_120px_rgba(0,0,0,0.58)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_92%_8%,rgba(255,217,26,0.13),transparent_30%)]" />

        <div className="relative flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">Mapa ao vivo</div>
            <h3 className="mt-1 text-lg font-black">Pessoas online</h3>
            <p className="mt-0.5 text-xs font-semibold text-slate-400">
              {lista.length ? `${lista.length} perfil(is) disponíveis agora.` : 'Nenhum perfil disponível no momento.'}
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

        <div className="relative flex gap-2 border-b border-white/10 px-4 py-3">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome ou ID"
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-400/35"
          />
          <button
            type="button"
            onClick={buscarUsuario}
            className="h-12 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-[0_12px_28px_rgba(37,99,235,0.24)] transition hover:bg-blue-500 active:scale-[0.98]"
          >
            Buscar
          </button>
        </div>

        <div className="relative flex-1 overflow-y-auto px-4 py-4">
          {lista.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-white/12 bg-white/[0.04] px-4 py-6 text-center">
              <div className="text-2xl">🧭</div>
              <p className="mt-2 text-sm font-bold text-slate-300">Ninguém online agora.</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                O mapa continua funcionando e os perfis aparecem quando ficarem disponíveis.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {lista.map((u) => (
                <li
                  key={u.id || u.idUnico}
                  className="rounded-[20px] border border-white/10 bg-white/[0.055] p-3 shadow-[0_12px_28px_rgba(0,0,0,0.16)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,#0b73ff,#19b7c8_58%,#ffe36b)] text-sm font-black text-blue-950 shadow-[0_12px_26px_rgba(37,99,235,0.18)]">
                      {(u.nome || 'CA').slice(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-white">
                        {u.nome || 'Sem nome'}
                      </div>
                      <div className="mt-0.5 text-xs font-semibold text-slate-400">
                        ID: {u.idUnico || '—'}
                      </div>
                      {u.local?.lat && u.local?.lng ? (
                        <div className="mt-2 inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-black text-cyan-100">
                          Localização ativa
                        </div>
                      ) : (
                        <div className="mt-2 inline-flex rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] font-black text-slate-400">
                          Sem localização
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
