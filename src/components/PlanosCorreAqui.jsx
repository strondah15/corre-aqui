"use client";

const card = "rounded-2xl p-4 bg-white/5 border border-white/10";

export default function PlanosCorreAqui({
  user = null,
  planoAtual = "Free",
  onSelecionarPlano,
}) {
  const uid = user?.uid || "";

  const LINK_PRO = `https://mpago.la/2cmNjPj?uid=${uid}&plano=pro`;
  const LINK_ULTRA = `https://mpago.la/1WWhpFw?uid=${uid}&plano=ultra`;

  const planos = [
    {
      id: "Free",
      titulo: "🆓 Plano Free",
      preco: "R$ 0",
      precoClass: "text-emerald-300",
      descricao: "Uso normal do app para pedir, conversar e fechar serviços.",
      beneficios: [
        "Criar pedidos",
        "Aceitar corre",
        "Conversar no chat",
        "Aparecer normalmente no mapa",
        "Anúncios leves no app",
      ],
      linkPagamento: "",
    },
    {
      id: "Pro",
      titulo: "🧑‍🔧 Plano Pro",
      preco: "R$ 19/mês",
      precoClass: "text-sky-300",
      descricao: "Para quem quer trabalhar e aparecer melhor no app.",
      beneficios: [
        "Selo profissional",
        "Menos anúncios",
        "Destaque maior no mapa",
        "Mais categorias",
        "Perfil com currículo completo",
      ],
      linkPagamento: LINK_PRO,
    },
    {
      id: "Ultra",
      titulo: "👑 Plano Ultra",
      preco: "R$ 39/mês",
      precoClass: "text-amber-300",
      descricao: "Máxima visibilidade para profissionais e negócios.",
      beneficios: [
        "Tudo do Pro",
        "Impulsionar mensal grátis",
        "Prioridade máxima no mapa",
        "Sem anúncios no app",
        "Área futura de estatísticas",
      ],
      linkPagamento: LINK_ULTRA,
    },
  ];

  const abrirPagamento = (plano) => {
    if (plano.id === "Free") {
      onSelecionarPlano?.("Free");
      return;
    }

    if (!plano.linkPagamento) {
      alert(`Link de pagamento do Plano ${plano.id} ainda não configurado.`);
      return;
    }

    window.open(plano.linkPagamento, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
        <div className="text-sm font-semibold text-gray-100">
          💸 Monetização do Corre Aqui
        </div>
        <div className="text-xs text-gray-400 mt-1">
          Sem taxa por serviço fechado entre pessoas. O app cresce com planos,
          anúncios e boosts.
        </div>
      </div>

      <div className="rounded-2xl p-4 bg-emerald-500/10 border border-emerald-400/20">
        <div className="text-sm font-semibold text-emerald-100">
          💚 Diferencial forte
        </div>
        <div className="text-xs text-emerald-50/90 mt-1">
          100% do valor combinado fica com quem faz o serviço. O Corre Aqui
          ganha com plano, anúncio e destaque.
        </div>
      </div>

      <div className="grid gap-3">
        {planos.map((plano) => {
          const ativo = planoAtual === plano.id;
          const pago = plano.id !== "Free";
          const configurado = Boolean(plano.linkPagamento);

          return (
            <div
              key={plano.id}
              className={[
                card,
                "text-left transition",
                ativo
                  ? "ring-2 ring-blue-400/50 bg-blue-500/10"
                  : "hover:bg-white/10",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-100">
                    {plano.titulo}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {plano.descricao}
                  </div>
                </div>
                <div className={`text-sm font-bold ${plano.precoClass}`}>
                  {plano.preco}
                </div>
              </div>

              <ul className="mt-3 text-xs text-gray-300 space-y-1">
                {plano.beneficios.map((beneficio) => (
                  <li key={beneficio}>• {beneficio}</li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => abrirPagamento(plano)}
                className={[
                  "mt-3 w-full rounded-xl border px-3 py-2 text-[11px] font-black text-center transition active:scale-[0.98]",
                  ativo
                    ? "bg-emerald-500/20 border-emerald-400/30 text-emerald-100"
                    : pago
                      ? "bg-blue-500/20 border-blue-400/30 text-blue-100 hover:bg-blue-500/30"
                      : "bg-black/20 border-white/10 text-white hover:bg-white/10",
                ].join(" ")}
              >
                {ativo
                  ? "Plano atual ✅"
                  : pago
                    ? configurado
                      ? `Assinar ${plano.id} com Mercado Pago`
                      : `Configurar pagamento ${plano.id}`
                    : "Usar Plano Free"}
              </button>

              {pago && configurado && (
                <div className="mt-2 text-[10px] text-sky-100/80 leading-relaxed">
                  O Mercado Pago abrirá em uma nova aba. Para ativação 100%
                  automática, depois ligamos o webhook/backend.
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className={card}>
          <div className="text-sm font-semibold text-gray-100">
            📢 Anúncios locais
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Comércios e profissionais podem comprar destaque no app.
          </div>
          <ul className="mt-3 text-xs text-gray-300 space-y-1">
            <li>• Loja patrocinada</li>
            <li>• Oferta em destaque</li>
            <li>• Banner local</li>
          </ul>
        </div>

        <div className={card}>
          <div className="text-sm font-semibold text-gray-100">✨ Impulsionars</div>
          <div className="text-xs text-gray-400 mt-1">
            Mais visibilidade sem cobrar comissão por serviço.
          </div>
          <ul className="mt-3 text-xs text-gray-300 space-y-1">
            <li>• Impulsionar · 20 min</li>
            <li>•  · 1h</li>
            <li>•  · 3h</li>
          </ul>
        </div>
      </div>

      <div className="rounded-2xl p-4 bg-emerald-500/10 border border-emerald-400/20">
        <div className="text-sm font-semibold text-emerald-100">
          ✅ Estratégia definida
        </div>
        <div className="text-xs text-emerald-50/90 mt-1">
          O Corre Aqui não cobra taxa em serviços feitos pelas pessoas. O
          crescimento vem de planos, anúncios e boosts.
        </div>
      </div>
    </div>
  );
}
