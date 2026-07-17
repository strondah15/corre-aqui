export const CONTEXTUAL_TIP_IDS = {
  pedidoCriado: "pedido-criado",
  chatAberto: "chat-aberto",
  pedidoAceito: "pedido-aceito",
  atendimentoIniciado: "atendimento-iniciado",
  cheguei: "cheguei",
  solicitarConclusao: "solicitar-conclusao",
  conclusaoConfirmada: "conclusao-confirmada",
  portfolioAberto: "portfolio-aberto",
  patentesAbertas: "patentes-abertas",
}

const aliases = {
  pedido: CONTEXTUAL_TIP_IDS.pedidoCriado,
  "pedido-criado": CONTEXTUAL_TIP_IDS.pedidoCriado,
  chat: CONTEXTUAL_TIP_IDS.chatAberto,
  "chat-aberto": CONTEXTUAL_TIP_IDS.chatAberto,
  aceite: CONTEXTUAL_TIP_IDS.pedidoAceito,
  "pedido-aceito": CONTEXTUAL_TIP_IDS.pedidoAceito,
  atendimento: CONTEXTUAL_TIP_IDS.atendimentoIniciado,
  "atendimento-iniciado": CONTEXTUAL_TIP_IDS.atendimentoIniciado,
  progresso: CONTEXTUAL_TIP_IDS.atendimentoIniciado,
  cheguei: CONTEXTUAL_TIP_IDS.cheguei,
  conclusao: CONTEXTUAL_TIP_IDS.solicitarConclusao,
  "solicitar-conclusao": CONTEXTUAL_TIP_IDS.solicitarConclusao,
  "conclusao-confirmada": CONTEXTUAL_TIP_IDS.conclusaoConfirmada,
  portfolio: CONTEXTUAL_TIP_IDS.portfolioAberto,
  "portfolio-aberto": CONTEXTUAL_TIP_IDS.portfolioAberto,
  patentes: CONTEXTUAL_TIP_IDS.patentesAbertas,
  "patentes-abertas": CONTEXTUAL_TIP_IDS.patentesAbertas,
}

export const CONTEXTUAL_TIP_CONFIG = {
  [CONTEXTUAL_TIP_IDS.pedidoCriado]: {
    id: CONTEXTUAL_TIP_IDS.pedidoCriado,
    localKey: "correAquiDicaPedidoVista",
    remoteKey: "dicaPedidoVista",
    title: "Pedido criado!",
    text: "Agora profissionais próximos poderão visualizar e aceitar sua solicitação.",
    icon: "✓",
    tone: "emerald",
    priority: 1,
  },
  [CONTEXTUAL_TIP_IDS.chatAberto]: {
    id: CONTEXTUAL_TIP_IDS.chatAberto,
    localKey: "correAquiDicaChatVista",
    remoteKey: "dicaChatVista",
    title: "Chat aberto",
    text: ({ mode } = {}) => (
      String(mode || "").toLowerCase() === "corre"
        ? "Combine todos os detalhes com o cliente antes de iniciar o atendimento."
        : "Use o chat para combinar valor, horário, localização e detalhes do atendimento."
    ),
    icon: "💬",
    tone: "blue",
    priority: 4,
    target: "chat",
    placement: "top",
  },
  [CONTEXTUAL_TIP_IDS.pedidoAceito]: {
    id: CONTEXTUAL_TIP_IDS.pedidoAceito,
    localKey: "correAquiDicaAceiteVista",
    remoteKey: "dicaAceiteVista",
    title: "Pedido aceito!",
    text: "Converse com o cliente e inicie o atendimento somente quando estiver pronto.",
    icon: "✓",
    tone: "emerald",
    priority: 3,
    target: "aceitar-pedido",
    placement: "top",
  },
  [CONTEXTUAL_TIP_IDS.atendimentoIniciado]: {
    id: CONTEXTUAL_TIP_IDS.atendimentoIniciado,
    localKey: "correAquiDicaAtendimentoIniciadoVista",
    remoteKey: "dicaAtendimentoIniciadoVista",
    title: "Atendimento iniciado",
    text: "Atendimento iniciado. Mantenha o cliente informado sobre o andamento.",
    icon: "▶",
    tone: "emerald",
    priority: 2,
    target: "progresso",
    placement: "top",
  },
  [CONTEXTUAL_TIP_IDS.cheguei]: {
    id: CONTEXTUAL_TIP_IDS.cheguei,
    localKey: "correAquiDicaChegueiVista",
    remoteKey: "dicaChegueiVista",
    title: "Chegada avisada",
    text: "O cliente foi avisado de que você chegou ao local.",
    icon: "📍",
    tone: "blue",
    priority: 2,
    target: "progresso",
    placement: "top",
  },
  [CONTEXTUAL_TIP_IDS.solicitarConclusao]: {
    id: CONTEXTUAL_TIP_IDS.solicitarConclusao,
    localKey: "correAquiDicaSolicitarConclusaoVista",
    remoteKey: "dicaSolicitarConclusaoVista",
    title: "Conclusão solicitada",
    text: "Agora o cliente precisa confirmar que o atendimento foi concluído.",
    icon: "✓",
    tone: "amber",
    priority: 1,
    target: "confirmacao-final",
    placement: "top",
  },
  [CONTEXTUAL_TIP_IDS.conclusaoConfirmada]: {
    id: CONTEXTUAL_TIP_IDS.conclusaoConfirmada,
    localKey: "correAquiDicaConclusaoVista",
    remoteKey: "dicaConclusaoVista",
    title: "Atendimento concluído",
    text: ({ evaluationActive } = {}) => (
      evaluationActive
        ? "Atendimento concluído! Agora você pode avaliar sua experiência."
        : "Atendimento concluído com sucesso."
    ),
    icon: "★",
    tone: "emerald",
    priority: 1,
  },
  [CONTEXTUAL_TIP_IDS.portfolioAberto]: {
    id: CONTEXTUAL_TIP_IDS.portfolioAberto,
    localKey: "correAquiDicaPortfolioVista",
    remoteKey: "dicaPortfolioVista",
    title: "Portfólio profissional",
    text: "Adicione fotos, serviços e valores para mostrar sua experiência aos clientes.",
    icon: "💼",
    tone: "blue",
    priority: 5,
    target: "portfolio",
    placement: "left",
  },
  [CONTEXTUAL_TIP_IDS.patentesAbertas]: {
    id: CONTEXTUAL_TIP_IDS.patentesAbertas,
    localKey: "correAquiDicaPatentesVista",
    remoteKey: "dicaPatentesVista",
    title: "Patentes e recompensas",
    text: "Conclua atendimentos para ganhar XP, moedas e evoluir sua patente.",
    icon: "★",
    tone: "amber",
    priority: 6,
    target: "patentes",
    placement: "left",
  },
}

export const CONTEXTUAL_TIP_LIST = Object.values(CONTEXTUAL_TIP_CONFIG)

export function normalizeContextualTipId(id) {
  const raw = String(id || "").trim()
  if (!raw) return ""
  return aliases[raw] || aliases[raw.toLowerCase()] || raw
}

export function getContextualTipConfig(id) {
  return CONTEXTUAL_TIP_CONFIG[normalizeContextualTipId(id)] || null
}

export function resolveContextualTip(id, options = {}) {
  const config = getContextualTipConfig(id)
  if (!config) return null
  const text = typeof config.text === "function" ? config.text(options) : config.text
  const title = typeof config.title === "function" ? config.title(options) : config.title

  return {
    ...config,
    options,
    title: title || "Dica rápida",
    text: text || "",
    target: options.target || config.target || "",
    placement: options.placement || config.placement || "",
  }
}
