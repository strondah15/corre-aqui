'use client'

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

function formatDataHora(v) {
  const ms = getMs(v)
  if (!ms) return 'Sem horário'

  const d = new Date(ms)
  const hoje = new Date()
  const ontem = new Date()
  ontem.setDate(hoje.getDate() - 1)

  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  if (d.toDateString() === hoje.toDateString()) return `Hoje às ${hora}`
  if (d.toDateString() === ontem.toDateString()) return `Ontem às ${hora}`

  return (
    d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }) + ` às ${hora}`
  )
}

export default function MeusPedidosCliente({
  meuId,
  corres = [],
  onAbrirChat,
  onVerMapa,
  onConfirmarServicoFeito,
}) {
  const meusPedidos = (corres || [])
    .filter((p) => p?.criador?.id === meuId)
    .sort((a, b) => {
      const ta = getMs(a?.criadoEm || a?.createdAt || a?.atualizadoEm || 0)
      const tb = getMs(b?.criadoEm || b?.createdAt || b?.atualizadoEm || 0)
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

                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-400">
                    <span>🕒 Criado: <b className="text-gray-200">{formatDataHora(p?.criadoEm || p?.createdAt || p?.atualizadoEm)}</b></span>
                    {p?.aceite?.aceitoEm || p?.aceitoEm ? (
                      <span>✅ Aceito: <b className="text-amber-200">{formatDataHora(p?.aceite?.aceitoEm || p?.aceitoEm)}</b></span>
                    ) : null}
                    {p?.entregueEm ? (
                      <span>📦 Entregue: <b className="text-sky-200">{formatDataHora(p?.entregueEm)}</b></span>
                    ) : null}
                  </div>
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
                    {p?.aceite?.aceitoEm || p?.aceitoEm ? (
                      <> · <b className="text-amber-200">{formatDataHora(p?.aceite?.aceitoEm || p?.aceitoEm)}</b></>
                    ) : null}
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

                {String(p?.status || '').toLowerCase() === 'aceito' && p?.criador?.id === meuId ? (
                  <button
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md shadow-blue-500/20 transition active:scale-[0.98]"
                    onClick={() => {
                      if (typeof onConfirmarServicoFeito === 'function') {
                        onConfirmarServicoFeito(p)
                      } else {
                        console.warn('Confirmação ainda não conectada no componente pai.')
                      }
                    }}
                    type="button"
                  >
                    Confirmar serviço feito
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
