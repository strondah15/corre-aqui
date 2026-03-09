// src/lib/pedidos.js
import { ref, push, set, serverTimestamp } from 'firebase/database'
import { database } from './firebase' // ajuste se seu firebase estiver em outro caminho

export const toNum = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export const normalizePedido = (p) => {
  if (!p || typeof p !== 'object') return p
  let lat =
    p?.local?.lat ??
    p?.latitude ?? p?.Latitude ?? p?.lat ??
    p?.geo?.lat ?? p?.location?.lat
  let lng =
    p?.local?.lng ??
    p?.longitude ?? p?.Longitude ?? p?.lng ??
    p?.geo?.lng ?? p?.location?.lng

  if ((lat == null || lng == null) && Array.isArray(p?.coordenadas) && p.coordenadas.length) {
    const first = p.coordenadas[0]
    if (Array.isArray(first) && first.length >= 2) {
      lat ??= first[0]
      lng ??= first[1]
    } else if (first?.lat != null && first?.lng != null) {
      lat ??= first.lat
      lng ??= first.lng
    }
  }

  lat = toNum(lat); lng = toNum(lng)
  const local = (lat != null && lng != null) ? { lat, lng } : null
  return { ...p, local }
}

export async function criarPedido({ draft = {}, mapRef, meuId, meuNome }) {
  // 1) coordenadas: centro do mapa → geolocalização
  let lat = null, lng = null
  try {
    if (mapRef?.current?.getCenter) {
      const c = mapRef.current.getCenter()
      lat = toNum(c.lat); lng = toNum(c.lng)
    }
  } catch {}

  if ((lat == null || lng == null) && typeof navigator !== 'undefined' && navigator.geolocation) {
    await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => { lat = toNum(p.coords.latitude); lng = toNum(p.coords.longitude); resolve() },
        () => resolve(),
        { enableHighAccuracy: true, timeout: 8000 }
      )
    })
  }

  const local = (lat != null && lng != null) ? { lat, lng } : null

  // 2) gera ID primeiro para UI otimista
  const novoRef = push(ref(database, 'pedidos'))
  const payload = {
    id: novoRef.key,
    criador: { id: meuId || 'anon', nome: meuNome || 'Anônimo' },
    titulo: (draft.titulo || '(sem título)').trim(),
    tipo: (draft.tipo || 'outro').toLowerCase(),
    descricao: draft.descricao || '',
    destino: draft.destino || '',
    valor: Number(draft.valor) || 0,
    forma: (draft.forma || '').toLowerCase(),
    urgencia: (draft.urgencia || 'normal').toLowerCase(),
    local,
    status: 'aberto',
    criadoEm: serverTimestamp?.() || Date.now(),
  }

  // 3) UI OTIMISTA: avisa o mapa imediatamente
  try {
    window?.dispatchEvent?.(new CustomEvent('correaqui:pedido-criado', {
      detail: { pedido: payload, otimista: true }
    }))
  } catch {}

  try {
    // 4) grava no Firebase
    await set(novoRef, payload)

    // 5) confirma (opcional)
    try {
      window?.dispatchEvent?.(new CustomEvent('correaqui:pedido-confirmado', {
        detail: { id: payload.id }
      }))
    } catch {}

    return { ok: true, id: payload.id, payload }
  } catch (error) {
    // 6) erro → remove do otimista
    try {
      window?.dispatchEvent?.(new CustomEvent('correaqui:pedido-erro', {
        detail: { id: payload.id, error: String(error) }
      }))
    } catch {}
    throw error
  }
}
