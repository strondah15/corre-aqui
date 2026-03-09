// src/constants/categories.js

export const CATEGORIES = [
  { id: 'entregas', label: 'Entregas', emoji: '🛵' },
  { id: 'reparos', label: 'Reparos', emoji: '🔧' },
  { id: 'limpeza', label: 'Limpeza', emoji: '🧹' },
  { id: 'beleza', label: 'Beleza', emoji: '💇‍♂️' },
  { id: 'aulas', label: 'Aulas', emoji: '🧑‍🏫' },
  { id: 'pets', label: 'Pets', emoji: '🐶' },
  { id: 'tecnologia', label: 'Tecnologia', emoji: '💻' },
  { id: 'carreto', label: 'Carreto/Mudança', emoji: '📦' },
  { id: 'servicos_gerais', label: 'Serviços gerais (Bico)', emoji: '🧰' },
]

// ✅ pega o label pelo id (pra mostrar bonito no app)
export function getCategoryLabel(id) {
  const c = CATEGORIES.find((x) => x.id === id)
  return c ? `${c.emoji} ${c.label}` : '🧰 Serviços gerais (Bico)'
}
