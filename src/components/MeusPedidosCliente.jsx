'use client'

export default function MeusPedidosCliente({
  meuId,
  corres = [],
  onAbrirChat,
  onVerMapa,
}) {
  const meusPedidos = (corres || [])
    .filter((p) => p?.criador?.id === meuId)
    .sort((a, b) => {
      const ta = Number(a?.criadoEm || a?.atualizadoEm || 0)
      const tb = Number(b?.criadoEm || b?.atualizadoEm || 0)
      return tb - ta
    })

  const badgeStatus = (status) => {
    const s = String(status || 'aberto').toLowerCase()

    if (s === 'aberto') {
      return (
        <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-400/15 border border-emerald-400/20 text-emerald-200 font-semibold">
          ABERTO
        </span>
      )
    }

    if (s === 'aceito') {
      return (
        <span className="text-[11px] px-2 py-1 rounded-full bg-amber-400/15 border border-amber-400/20 text-amber-200 font-semibold">
          ACEITO
        </span>
      )
    }

    if (s === 'entregue') {
      return (
        <span className="text-[11px] px-2 py-1 rounded-full bg-sky-400/15 border border-sky-400/20 text-sky-200 font-semibold">
          ENTREGUE
        </span>
      )
    }

    return (
      <span className="text-[11px] px-2 py-1 rounded-full bg-white/10 border border-white/10 text-gray-200 font-semibold">
        {s.toUpperCase()}
      </span>
    )
  }

  return (
    <div className="mt-4 rounded-2xl p-3 bg-white/10 backdrop-blur-md border border-white/10 shadow-xl shadow-black/30">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-gray-100">
          📦 Meus pedidos
        </div>
        <div className="text-xs text-gray-400">
          {meusPedidos.length} pedido{meusPedidos.length === 1 ? '' : 's'}
        </div>
      </div>

      {meusPedidos.length === 0 ? (
        <div className="text-sm text-gray-400">
          Você ainda não criou pedidos.
        </div>
      ) : (
        <div className="space-y-3">
          {meusPedidos.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl p-3 bg-white/5 border border-white/10"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-100 truncate">
                    {p?.titulo || 'Pedido sem título'}
                  </div>

                  {p?.descricao ? (
                    <div className="text-xs text-gray-400 mt-1 line-clamp-2">
                      {p.descricao}
                    </div>
                  ) : null}
                </div>

                {badgeStatus(p?.status)}
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-400">
                {p?.valor != null && Number.isFinite(Number(p.valor)) ? (
                  <span>
                    💰 <b className="text-gray-200">R$ {Number(p.valor).toFixed(2)}</b>
                  </span>
                ) : null}

                {p?.aceite?.nome ? (
                  <span>
                    🙋 Aceito por <b className="text-gray-200">{p.aceite.nome}</b>
                  </span>
                ) : (
                  <span>⏳ Aguardando alguém aceitar</span>
                )}
              </div>

              <div className="mt-3 flex gap-2 flex-wrap">
                {p?.aceite?.id ? (
                  <button
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition active:scale-[0.98]"
                    onClick={() => onAbrirChat?.(p)}
                    type="button"
                  >
                    Abrir conversa
                  </button>
                ) : null}

                {p?.local?.lat != null && p?.local?.lng != null ? (
                  <button
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-sm transition active:scale-[0.98]"
                    onClick={() => onVerMapa?.(p)}
                    type="button"
                  >
                    Ver no mapa
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
