'use client'

const card = 'rounded-2xl p-4 bg-white/5 border border-white/10'

export default function PlanosCorreAqui() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
        <div className="text-sm font-semibold text-gray-100">💸 Monetização do Corre Aqui</div>
        <div className="text-xs text-gray-400 mt-1">
          Sem taxa por serviço fechado entre pessoas. O app cresce com planos, anúncios e boosts.
        </div>
      </div>

      <div className="grid gap-3">
        <div className={card}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-100">🆓 Plano Free</div>
              <div className="text-xs text-gray-400 mt-1">Uso normal do app para pedir, conversar e fechar serviços.</div>
            </div>
            <div className="text-sm font-bold text-emerald-300">R$ 0</div>
          </div>
          <ul className="mt-3 text-xs text-gray-300 space-y-1">
            <li>• Criar pedidos</li>
            <li>• Aceitar corre</li>
            <li>• Conversar no chat</li>
            <li>• Aparecer normalmente no mapa</li>
          </ul>
        </div>

        <div className={card}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-100">🧑‍🔧 Plano Profissional</div>
              <div className="text-xs text-gray-400 mt-1">Para quem quer trabalhar e aparecer melhor no app.</div>
            </div>
            <div className="text-sm font-bold text-sky-300">R$ 19/mês</div>
          </div>
          <ul className="mt-3 text-xs text-gray-300 space-y-1">
            <li>• Selo profissional</li>
            <li>• Destaque maior no mapa</li>
            <li>• Mais categorias</li>
            <li>• Perfil com portfólio</li>
          </ul>
        </div>

        <div className={card}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-100">👑 Plano Premium</div>
              <div className="text-xs text-gray-400 mt-1">Máxima visibilidade para profissionais e negócios.</div>
            </div>
            <div className="text-sm font-bold text-amber-300">R$ 39/mês</div>
          </div>
          <ul className="mt-3 text-xs text-gray-300 space-y-1">
            <li>• Tudo do profissional</li>
            <li>• Boost mensal grátis</li>
            <li>• Prioridade máxima no mapa</li>
            <li>• Área de estatísticas</li>
          </ul>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className={card}>
          <div className="text-sm font-semibold text-gray-100">📢 Anúncios locais</div>
          <div className="text-xs text-gray-400 mt-1">Comércios e profissionais podem comprar destaque no app.</div>
          <ul className="mt-3 text-xs text-gray-300 space-y-1">
            <li>• Loja patrocinada</li>
            <li>• Oferta em destaque</li>
            <li>• Banner local</li>
          </ul>
        </div>

        <div className={card}>
          <div className="text-sm font-semibold text-gray-100">🚀 Boosts</div>
          <div className="text-xs text-gray-400 mt-1">Mais visibilidade sem cobrar comissão por serviço.</div>
          <ul className="mt-3 text-xs text-gray-300 space-y-1">
            <li>• Boost · 20 min</li>
            <li>• Turbo · 1h</li>
            <li>• Insano · 3h</li>
          </ul>
        </div>
      </div>

      <div className="rounded-2xl p-4 bg-emerald-500/10 border border-emerald-400/20">
        <div className="text-sm font-semibold text-emerald-100">✅ Estratégia definida</div>
        <div className="text-xs text-emerald-50/90 mt-1">
          O Corre Aqui não cobra taxa em serviços feitos pelas pessoas. O crescimento vem de planos, anúncios e boosts.
        </div>
      </div>
    </div>
  )
}
