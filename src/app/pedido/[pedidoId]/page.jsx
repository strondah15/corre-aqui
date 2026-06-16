'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { onValue, ref, runTransaction, serverTimestamp, set, update } from 'firebase/database'
import LoginGate from '@/components/LoginGate'
import { auth, database } from '@/lib/firebase'
import { enviarPushParaUsuario } from '@/lib/pushSender'

const MapinhaModal = dynamic(() => import('@/components/MapinhaModal'), { ssr: false })
const LIST_STATE_PREFIX = 'correAqui:listState:v2'
const LIST_RETURN_FLAG = 'correAqui:returningToList'

function getMs(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') return value.seconds * 1000
  return 0
}

function getValorPedido(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

function formatMoney(value) {
  const n = getValorPedido(value)
  if (!n) return 'Combinar'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatData(value) {
  const ms = getMs(value)
  if (!ms) return 'Sem data'
  return new Date(ms).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTempo(value) {
  const ms = getMs(value)
  if (!ms) return 'Agora'
  const diff = Math.max(0, Date.now() - ms)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'Agora'
  if (min < 60) return `${min} min atras`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h atras`
  return `${Math.floor(h / 24)} d atras`
}

function getMyLocation() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    )
  })
}

function dayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function missaoIncrementar(uid) {
  if (!uid) return
  const key = dayKey()

  await runTransaction(ref(database, `missoes/${uid}/${key}`), (cur) => {
    const c = cur || { aceitou: 0, entregou: 0, boostou: 0, xp: 0, moedas: 0, updatedAt: 0 }
    return {
      ...c,
      aceitou: Number(c.aceitou || 0) + 1,
      xp: Number(c.xp || 0) + 3,
      moedas: Number(c.moedas || 0) + 1,
      updatedAt: Date.now(),
    }
  })

  await runTransaction(ref(database, `users/${uid}`), (cur) => {
    const u = cur || {}
    return {
      ...u,
      xp: Number(u.xp || 0) + 3,
      moedas: Number(u.moedas || 0) + 1,
      missaoAtualizadaEm: Date.now(),
    }
  })
}

function PedidoDetalhe() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const pedidoId = String(params?.pedidoId || '')
  const voltar = searchParams.get('voltar') || 'corre'

  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [pedido, setPedido] = useState(null)
  const [loading, setLoading] = useState(true)
  const [aceitando, setAceitando] = useState(false)
  const [erro, setErro] = useState('')
  const [mapOpen, setMapOpen] = useState(false)

  useEffect(() => {
    const off = onAuthStateChanged(auth, (authUser) => setUser(authUser || null))
    return () => off()
  }, [])

  useEffect(() => {
    if (!pedidoId) return undefined
    setLoading(true)
    const off = onValue(ref(database, `pedidos/${pedidoId}`), (snap) => {
      setPedido(snap.exists() ? { id: pedidoId, ...(snap.val() || {}) } : null)
      setLoading(false)
    })
    return () => off()
  }, [pedidoId])

  useEffect(() => {
    if (!user?.uid) {
      setProfile(null)
      return undefined
    }
    const off = onValue(ref(database, `users/${user.uid}`), (snap) => {
      setProfile(snap.val() || null)
    })
    return () => off()
  }, [user?.uid])

  const status = String(pedido?.status || 'aberto').toLowerCase()
  const souCriador = !!user?.uid && String(pedido?.criador?.id || '') === String(user.uid)
  const souAceitador = !!user?.uid && String(pedido?.aceite?.id || '') === String(user.uid)
  const podeAceitar = !!user?.uid && pedido && status === 'aberto' && !pedido?.aceite?.id && !souCriador
  const categoria = pedido?.categoriaNome || pedido?.categoriaLabel || pedido?.categoriaId || pedido?.categoria || 'Geral'
  const criadoEm = pedido?.criadoEm || pedido?.createdAt || pedido?.atualizadoEm
  const localOk = pedido?.local?.lat != null && pedido?.local?.lng != null

  const statusLabel = useMemo(() => {
    if (status === 'aceito') return 'Em andamento'
    if (status === 'concluido') return 'Concluido'
    if (status === 'cancelado') return 'Cancelado'
    return 'Aberto'
  }, [status])

  const voltarParaLista = () => {
    const fallback = voltar === 'cliente' ? '/cliente' : '/corre'

    try {
      const stateKey = `${LIST_STATE_PREFIX}:${voltar === 'cliente' ? 'cliente' : 'corre'}`
      if (sessionStorage.getItem(stateKey)) {
        if (process.env.NODE_ENV !== 'production') console.time('back-list')
        sessionStorage.setItem(LIST_RETURN_FLAG, stateKey)
        router.back()
        return
      }
    } catch {}

    router.replace(fallback)
  }

  const abrirChat = () => {
    if (!pedidoId) return
    router.push(`/chat/${encodeURIComponent(pedidoId)}?voltar=${voltar}`)
  }

  const aceitarPedido = async () => {
    if (!podeAceitar || aceitando) return
    setErro('')
    setAceitando(true)

    try {
      const agora = Date.now()
      const local = await getMyLocation()
      const nome = profile?.nome || user.displayName || 'Corre'
      const conversaId = pedido.id
      const aceite = {
        id: user.uid,
        nome,
        local: local || null,
        aceitoEm: agora,
      }

      await update(ref(database, `pedidos/${pedido.id}`), {
        status: 'aceito',
        aceite,
        conversaId,
        aceitoEm: agora,
        atualizadoEm: agora,
        atualizadoEmServer: serverTimestamp(),
      })

      await update(ref(database, `users/${user.uid}`), {
        statusProfissional: 'em_servico',
        ocupadoAte: agora + 3 * 24 * 60 * 60 * 1000,
        agendaAberta: true,
        atualizadoEm: serverTimestamp(),
      }).catch(() => {})

      if (pedido?.criador?.id) {
        await update(ref(database, `conversas/${pedido.criador.id}/${conversaId}`), {
          pedidoId: pedido.id,
          titulo: pedido.titulo || 'Corre aqui',
          outroId: user.uid,
          outroNome: nome,
          unread: true,
          status: 'ativa',
          tipoNotificacao: 'corre_aceito',
          lastText: `${nome} aceitou seu corre.`,
          lastAt: agora,
          lastById: user.uid,
          lastByNome: nome,
          mensagemPreview: `${nome} aceitou seu corre.`,
          updatedAt: agora,
        })

        await update(ref(database, `notificacoes/${pedido.criador.id}/notif_${agora}`), {
          tipo: 'corre_aceito',
          pedidoId: pedido.id,
          conversaId,
          titulo: 'Seu corre foi aceito!',
          mensagem: `${nome} aceitou: ${pedido.titulo || 'Corre aqui'}`,
          prioridade: 'alta',
          acao: 'abrir_chat',
          lida: false,
          criadoEm: agora,
          autor: { id: user.uid, nome },
        })

        enviarPushParaUsuario(pedido.criador.id, {
          tipo: 'corre_aceito',
          pedidoId: pedido.id,
          conversaId,
          titulo: 'Seu corre foi aceito!',
          mensagem: `${nome} aceitou: ${pedido.titulo || 'Corre aqui'}`,
          prioridade: 'alta',
          acao: 'abrir_chat',
        })
      }

      await update(ref(database, `conversas/${user.uid}/${conversaId}`), {
        pedidoId: pedido.id,
        titulo: pedido.titulo || 'Corre aqui',
        outroId: pedido?.criador?.id || null,
        outroNome: pedido?.criador?.nome || 'Cliente',
        unread: false,
        status: 'ativa',
        lastText: 'Voce aceitou esse corre.',
        lastAt: agora,
        lastById: user.uid,
        lastByNome: nome,
        mensagemPreview: 'Voce aceitou esse corre.',
        updatedAt: agora,
      })

      const mensagemSistema = {
        texto: `${nome} aceitou o pedido.`,
        sistema: true,
        criadoEm: agora,
        hora: agora,
        autorId: 'sistema',
        autorNome: 'Sistema',
      }

      await set(ref(database, `chats/${conversaId}/msg_${agora}`), mensagemSistema)
      await set(ref(database, `mensagens/${conversaId}/msg_${agora}`), mensagemSistema)
      if (pedido?.criador?.id) await set(ref(database, `usersChats/${pedido.criador.id}/${conversaId}`), true)
      await set(ref(database, `usersChats/${user.uid}/${conversaId}`), true)
      await missaoIncrementar(user.uid)
    } catch (error) {
      console.error('Erro ao aceitar pedido:', error)
      setErro(error?.message || 'Nao foi possivel aceitar agora.')
    } finally {
      setAceitando(false)
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#050b12] px-4 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.055] px-5 py-4 text-sm font-black">
          Carregando pedido...
        </div>
      </main>
    )
  }

  if (!pedido) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#050b12] px-4 text-white">
        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.055] p-5 text-center">
          <div className="text-xl font-black">Pedido nao encontrado</div>
          <button type="button" onClick={voltarParaLista} className="mt-4 h-11 rounded-2xl bg-[#ffd91a] px-5 text-sm font-black text-blue-950">
            Voltar
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-[100dvh] bg-[#050b12] px-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 text-white md:px-6 md:py-6">
      <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_20%_0%,rgba(11,115,255,0.18),transparent_34%),linear-gradient(180deg,#07111f_0%,#050b12_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4">
          <button type="button" onClick={voltarParaLista} className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/8 text-lg font-black">
            <span aria-hidden="true">‹</span>
          </button>
          <div className="min-w-0 flex-1 text-center">
            <div className="text-sm font-black">Ficha do pedido</div>
            <div className="mt-0.5 truncate text-[11px] font-bold text-slate-400">{statusLabel}</div>
          </div>
          <span className="rounded-full bg-[#ffd91a] px-3 py-1 text-[11px] font-black text-blue-950">
            {formatMoney(pedido.valor)}
          </span>
        </header>

        <div className="p-4 md:p-6">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.055] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="line-clamp-3 text-2xl font-black leading-tight md:text-4xl">
                  {pedido.titulo || 'Pedido sem titulo'}
                </h1>
                <div className="mt-2 text-sm font-bold text-slate-300">{categoria}</div>
              </div>
              <span className="shrink-0 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-300">
                {statusLabel}
              </span>
            </div>

            {pedido.descricao ? (
              <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/45 p-3 text-sm font-semibold leading-relaxed text-slate-200">
                {pedido.descricao}
              </p>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              {[
                ['Valor', formatMoney(pedido.valor)],
                ['Postado', formatTempo(criadoEm)],
                ['Data', formatData(criadoEm)],
                ['Local', localOk ? 'Mapa disponivel' : 'A combinar'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
                  <div className="mt-1 line-clamp-2 text-sm font-black text-white">{value}</div>
                </div>
              ))}
            </div>
          </div>

          {erro ? (
            <div className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm font-bold text-rose-100">
              {erro}
            </div>
          ) : null}

          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {podeAceitar ? (
              <button
                type="button"
                onClick={aceitarPedido}
                disabled={aceitando}
                className="h-12 rounded-2xl bg-[#ffd91a] px-4 text-sm font-black text-blue-950 shadow-[0_16px_34px_rgba(250,204,21,0.28)] transition active:scale-[0.98] disabled:opacity-60 md:col-span-1"
              >
                {aceitando ? 'Aceitando...' : 'Aceitar pedido'}
              </button>
            ) : null}

            {(souCriador || souAceitador || status === 'aceito') ? (
              <button type="button" onClick={abrirChat} className="h-12 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-black text-white transition active:scale-[0.98]">
                Abrir conversa
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setMapOpen(true)}
              disabled={!localOk}
              className="h-12 rounded-2xl border border-white/10 bg-blue-600 px-4 text-sm font-black text-white transition active:scale-[0.98] disabled:bg-white/10 disabled:text-slate-500"
            >
              Ver no mapa
            </button>
          </div>
        </div>
      </section>

      {mapOpen ? (
        <MapinhaModal
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          pedidoLocal={pedido?.local || null}
          aceiteLocal={pedido?.aceite?.local || null}
          titulo={pedido?.titulo || 'Corre aqui'}
          infoExtra={{
            status: pedido?.status || 'aberto',
            valor: pedido?.valor || null,
            categoria,
          }}
        />
      ) : null}
    </main>
  )
}

export default function PedidoPage() {
  return (
    <LoginGate>
      <PedidoDetalhe />
    </LoginGate>
  )
}
