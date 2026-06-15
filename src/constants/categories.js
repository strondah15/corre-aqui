// src/constants/categories.js

export const CATEGORIES = [
  {
    id: 'servicos_gerais',
    label: 'Serviços gerais',
    emoji: '⚡',
    accent: '#2563eb',
    soft: '#eef5ff',
    wave: '#dceaff',
    aliases: ['geral', 'servicos', 'serviços gerais (bico)', 'bico'],
  },
  {
    id: 'entregas',
    label: 'Entregas',
    emoji: '🛵',
    accent: '#16a34a',
    soft: '#e8f8ed',
    wave: '#dff3df',
    aliases: ['entrega', 'delivery', 'encomenda'],
  },
  {
    id: 'compras',
    label: 'Compras',
    emoji: '🛒',
    accent: '#0ea5e9',
    soft: '#e8f7ff',
    wave: '#d7efff',
    aliases: ['compra', 'mercado', 'farmacia', 'farmácia'],
  },
  {
    id: 'casa',
    label: 'Casa',
    emoji: '🏠',
    accent: '#f59e0b',
    soft: '#fff8e1',
    wave: '#ffe9ad',
    aliases: ['construcao', 'construção', 'lar', 'telhado', 'pintura'],
  },
  {
    id: 'reparos',
    label: 'Reparos',
    emoji: '🔧',
    accent: '#2563eb',
    soft: '#eaf2ff',
    wave: '#dceaff',
    aliases: ['reparo', 'conserto', 'manutencao', 'manutenção', 'instalacao', 'instalação'],
  },
  {
    id: 'limpeza',
    label: 'Limpeza',
    emoji: '🧹',
    accent: '#ec4899',
    soft: '#fff0f7',
    wave: '#ffd8e9',
    aliases: ['faxina', 'diarista'],
  },
  {
    id: 'beleza',
    label: 'Beleza',
    emoji: '💇',
    accent: '#f59e0b',
    soft: '#fff7dd',
    wave: '#ffefbf',
    aliases: ['maquiagem', 'escova', 'cabelo'],
  },
  {
    id: 'aulas',
    label: 'Aulas',
    emoji: '👩‍🏫',
    accent: '#6d28d9',
    soft: '#f0e9ff',
    wave: '#e7dcff',
    aliases: ['aula', 'educacao', 'educação', 'professor'],
  },
  {
    id: 'pets',
    label: 'Pets',
    emoji: '🐶',
    accent: '#92400e',
    soft: '#f7eee5',
    wave: '#ead9c8',
    aliases: ['pet', 'cachorro', 'gato'],
  },
  {
    id: 'tecnologia',
    label: 'Tecnologia',
    emoji: '💻',
    accent: '#7c3aed',
    soft: '#f0e9ff',
    wave: '#eadcff',
    aliases: ['internet', 'roteador', 'computador', 'tomada'],
  },
  {
    id: 'transporte',
    label: 'Transporte',
    emoji: '🚗',
    accent: '#1d4ed8',
    soft: '#e8f1ff',
    wave: '#d7e7ff',
    aliases: ['transporte', 'carro', 'corrida'],
  },
  {
    id: 'mudancas',
    label: 'Mudanças',
    emoji: '📦',
    accent: '#f97316',
    soft: '#fff1e7',
    wave: '#ffe0c2',
    aliases: ['carreto', 'mudanca', 'mudança', 'frete'],
  },
  {
    id: 'eventos',
    label: 'Eventos',
    emoji: '🎉',
    accent: '#ec4899',
    soft: '#fff0f6',
    wave: '#ffd8e8',
    aliases: ['evento', 'decoracao', 'decoração', 'festa'],
  },
  {
    id: 'midia',
    label: 'Mídia',
    emoji: '📷',
    accent: '#0891b2',
    soft: '#e6f9fb',
    wave: '#cff4f7',
    aliases: ['media', 'foto', 'fotografia', 'video', 'vídeo'],
  },
  {
    id: 'cuidados',
    label: 'Cuidados',
    emoji: '👶',
    accent: '#db2777',
    soft: '#fff0f6',
    wave: '#ffd8e8',
    aliases: ['cuidado', 'baba', 'babá', 'idoso', 'cuidador'],
  },
]

const CATEGORY_BY_ID = new Map(CATEGORIES.map((cat) => [cat.id, cat]))
const CATEGORY_ALIAS_TO_ID = new Map(
  CATEGORIES.flatMap((cat) => [cat.id, ...(cat.aliases || [])].map((alias) => [normalizeCategoryKey(alias), cat.id]))
)

function normalizeCategoryKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function getCanonicalCategoryId(id) {
  const key = normalizeCategoryKey(id)
  return CATEGORY_ALIAS_TO_ID.get(key) || key
}

export function getCategoryById(id) {
  const canonical = getCanonicalCategoryId(id)
  return CATEGORY_BY_ID.get(canonical) || null
}

export function categoryMatches(value, target) {
  if (!target || target === 'todas') return true
  return getCanonicalCategoryId(value) === getCanonicalCategoryId(target)
}

export function getCategoryLabel(id) {
  const c = getCategoryById(id)
  return c ? `${c.emoji} ${c.label}` : '⚡ Serviços gerais'
}
