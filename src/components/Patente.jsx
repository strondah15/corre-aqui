export const XP_POR_NIVEL = {
  1: 0,
  2: 200,
  3: 600,
  4: 1400,
  5: 3000,
}

export const TITULOS_CORRE = {
  1: 'Iniciante',
  2: 'Corredor',
  3: 'Resolvedor',
  4: 'Brabo',
  5: 'Lendário',
}

export const TITULOS_PROFISSIONAL = {
  1: 'Profissional',
  2: 'Especialista',
  3: 'Mestre',
  4: 'Referência',
  5: 'Imparável',
}

export function calcularPatente(xp = 0) {
  if (xp >= XP_POR_NIVEL[5]) return 5
  if (xp >= XP_POR_NIVEL[4]) return 4
  if (xp >= XP_POR_NIVEL[3]) return 3
  if (xp >= XP_POR_NIVEL[2]) return 2
  return 1
}

export function progressoNivel(xp = 0) {
  const nivel = calcularPatente(xp)

  if (nivel === 5) return 100

  const atual = XP_POR_NIVEL[nivel]
  const prox = XP_POR_NIVEL[nivel + 1]

  return Math.max(
    0,
    Math.min(100, ((xp - atual) / (prox - atual)) * 100)
  )
}


export default function Patente() {
  return null
}
