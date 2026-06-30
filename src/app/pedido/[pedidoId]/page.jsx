'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { onValue, ref, runTransaction, serverTimestamp, set, update } from 'firebase/database'
import LoginGate from '@/components/LoginGate'
import { getCategoryById } from '@/constants/categories'
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
  if (min < 60) return `${min} min atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h atrás`
  return `${Math.floor(h / 24)} d atrás`
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

function getInitials(name) {
  const parts = String(name || 'Usuário')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'CA'
}

function getTelefone(profile, criador) {
  return (
    profile?.telefone ||
    profile?.phone ||
    profile?.whatsapp ||
    profile?.profWhats ||
    criador?.telefone ||
    criador?.phone ||
    criador?.whatsapp ||
    ''
  )
}

function phoneHref(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  return `tel:+${withCountry}`
}

function StatusPill({ status, label }) {
  const tone =
    status === 'aceito'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : status === 'concluido'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : status === 'cancelado'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-blue-100 bg-blue-50 text-blue-700'

  return (
    <span className={`inline-flex items-center justify-center rounded-full border px-4 py-1.5 text-sm font-black ${tone}`}>
      {label}
    </span>
  )
}

function IconChevronLeft({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M15 18 9 12l6-6" />
    </svg>
  )
}

function IconX({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function IconCheck({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

function IconBox({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m21 8-9-5-9 5 9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  )
}

function IconDollar({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2v20M17 6.5C15.8 5.5 14.1 5 12.3 5 9.6 5 8 6.2 8 8.2c0 4.2 9 2.1 9 7 0 2.2-1.9 3.8-5 3.8-2 0-3.8-.6-5-1.7" />
    </svg>
  )
}

function IconClock({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function IconCalendar({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M8 2v4M16 2v4M4 9h16" />
      <rect x="4" y="5" width="16" height="17" rx="3" />
    </svg>
  )
}

function IconPin({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C8.13 2 5 5.05 5 8.82c0 5.12 7 13.18 7 13.18s7-8.06 7-13.18C19 5.05 15.87 2 12 2Zm0 9.4a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2Z" />
    </svg>
  )
}

function IconShield({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3 5 6v5c0 4.5 2.8 8.7 7 10 4.2-1.3 7-5.5 7-10V6l-7-3Z" />
      <path d="m8.8 12 2.1 2.1 4.4-4.8" />
    </svg>
  )
}

function IconChat({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 11.5a8.4 8.4 0 0 1-8.8 8.3 9.5 9.5 0 0 1-3.8-.8L3 21l1.8-4.7A8.2 8.2 0 0 1 3 11.5 8.4 8.4 0 0 1 11.8 3 8.4 8.4 0 0 1 21 11.5Z" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </svg>
  )
}

function IconPhone({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 16.9v2.5a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 3.7 2 2 0 0 1 4.1 1.5h2.5a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.4 2.1L7.7 9a16 16 0 0 0 7.3 7.3l1.1-1.1a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z" />
    </svg>
  )
}

function IconRoute({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.5 6h4.2a3.3 3.3 0 0 1 0 6.6H11a3.3 3.3 0 0 0 0 6.6h4.5" />
    </svg>
  )
}

function IconStar({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
    </svg>
  )
}

function IconExternal({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 3h7v7" />
      <path d="M10 14 21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </svg>
  )
}

function MetricCard({ icon, label, value }) {
  return (
    <div className="min-h-[92px] rounded-[22px] border border-blue-100 bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,72,150,0.07)]">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-600 text-white shadow-[0_12px_24px_rgba(37,99,235,0.2)]">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">{label}</div>
          <div className="mt-1 line-clamp-2 text-base font-black leading-tight text-[#06184a]">{value}</div>
        </div>
      </div>
    </div>
  )
}

function FeatureCard({ icon, title, text }) {
  return (
    <div className="flex min-w-0 items-center gap-4 px-2 py-2 md:px-4">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-base font-black text-[#06184a]">{title}</div>
        <div className="mt-1 text-sm font-semibold leading-snug text-slate-600">{text}</div>
      </div>
    </div>
  )
}

function MiniMapPreview({ onOpen, disabled }) {
  return (
    <div className="relative min-h-[260px] overflow-hidden rounded-[24px] border border-blue-100 bg-blue-50 shadow-inner md:min-h-[300px]">
      <div
        className="absolute inset-0 opacity-90"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(255,255,255,.68), rgba(239,246,255,.82)), url('/cliente-home-map-bg.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <div className="absolute left-[16%] top-[18%] -rotate-[54deg] text-sm font-semibold text-[#07184b] opacity-80">Rua das Flores</div>
      <div className="absolute right-[6%] top-[24%] rotate-[28deg] text-sm font-semibold text-[#07184b] opacity-80">Rua das Palmeiras</div>
      <div className="absolute bottom-[18%] right-[17%] rotate-[26deg] text-sm font-semibold text-[#07184b] opacity-80">Rua das Acácias</div>
      <div className="absolute bottom-[22%] left-[27%] -rotate-[64deg] text-sm font-semibold text-[#07184b] opacity-80">Av. Central</div>
      <div className="absolute left-1/2 top-[37%] -translate-x-1/2 text-blue-600 drop-shadow-[0_18px_26px_rgba(37,99,235,0.35)]">
        <IconPin className="h-20 w-20 md:h-24 md:w-24" />
      </div>
      <span className="absolute left-1/2 top-[58%] h-7 w-7 -translate-x-1/2 rounded-full border-[5px] border-blue-200 bg-blue-600 shadow-[0_16px_28px_rgba(37,99,235,0.32)]" />
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="absolute bottom-4 right-4 inline-flex h-14 items-center gap-2 rounded-[20px] border border-blue-100 bg-white/95 px-5 text-lg font-black text-blue-700 shadow-[0_16px_34px_rgba(15,72,150,0.14)] transition active:scale-[0.98] disabled:opacity-55"
      >
        Abrir no mapa
        <IconExternal className="h-5 w-5" />
      </button>
    </div>
  )
}

function PedidoDetalhe() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const pedidoId = String(params?.pedidoId || '')
  const voltar = searchParams.get('voltar') || 'corre'

  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [creatorProfile, setCreatorProfile] = useState(null)
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

  useEffect(() => {
    const creatorId = pedido?.criador?.id
    if (!creatorId) {
      setCreatorProfile(null)
      return undefined
    }

    const off = onValue(
      ref(database, `users/${creatorId}`),
      (snap) => setCreatorProfile(snap.val() || null),
      () => setCreatorProfile(null),
    )
    return () => off()
  }, [pedido?.criador?.id])

  const status = String(pedido?.status || 'aberto').toLowerCase()
  const souCriador = !!user?.uid && String(pedido?.criador?.id || '') === String(user.uid)
  const souAceitador = !!user?.uid && String(pedido?.aceite?.id || '') === String(user.uid)
  const podeAceitar = !!user?.uid && pedido && status === 'aberto' && !pedido?.aceite?.id && !souCriador
  const podeAbrirChat = souCriador || souAceitador
  const criadoEm = pedido?.criadoEm || pedido?.createdAt || pedido?.atualizadoEm
  const localOk = pedido?.local?.lat != null && pedido?.local?.lng != null

  const categoryMeta = useMemo(
    () => getCategoryById(pedido?.categoriaId || pedido?.categoria || pedido?.category),
    [pedido?.categoriaId, pedido?.categoria, pedido?.category],
  )

  const categoria = pedido?.categoriaNome || pedido?.categoriaLabel || categoryMeta?.label || pedido?.categoriaId || pedido?.categoria || 'Serviços gerais'
  const criadorNome = pedido?.criador?.nome || creatorProfile?.nome || creatorProfile?.displayName || 'Usuário Corre Aqui'
  const criadorFoto = pedido?.criador?.fotoURL || pedido?.criador?.photoURL || creatorProfile?.fotoURL || creatorProfile?.photoURL || ''
  const criadorOnline = !!(creatorProfile?.online || creatorProfile?.disponivel)
  const telefone = getTelefone(creatorProfile, pedido?.criador)
  const telefoneLink = phoneHref(telefone)
  const tituloPedido = pedido?.titulo || pedido?.texto || 'Pedido sem título'
  const descricaoPedido = pedido?.descricao || pedido?.texto || 'Converse no chat para combinar os detalhes desse serviço.'

  const statusLabel = useMemo(() => {
    if (status === 'aceito') return 'Aceito'
    if (status === 'concluido') return 'Concluído'
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
        lastText: 'Você aceitou esse corre.',
        lastAt: agora,
        lastById: user.uid,
        lastByNome: nome,
        mensagemPreview: 'Você aceitou esse corre.',
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
      setErro(error?.message || 'Não foi possível aceitar agora.')
    } finally {
      setAceitando(false)
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#eef4ff] px-4 text-[#06184a]">
        <div className="rounded-[24px] border border-blue-100 bg-white px-6 py-5 text-sm font-black shadow-[0_22px_60px_rgba(15,72,150,0.12)]">
          Carregando pedido...
        </div>
      </main>
    )
  }

  if (!pedido) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#eef4ff] px-4 text-[#06184a]">
        <div className="w-full max-w-sm rounded-[28px] border border-blue-100 bg-white p-6 text-center shadow-[0_22px_60px_rgba(15,72,150,0.12)]">
          <div className="text-xl font-black">Pedido não encontrado</div>
          <button type="button" onClick={voltarParaLista} className="mt-5 h-12 rounded-[18px] bg-blue-600 px-6 text-sm font-black text-white shadow-[0_16px_30px_rgba(37,99,235,0.25)]">
            Voltar
          </button>
        </div>
      </main>
    )
  }

  const primaryLabel = podeAceitar
    ? aceitando
      ? 'Aceitando pedido...'
      : 'Aceitar pedido'
    : podeAbrirChat
      ? 'Abrir conversa'
      : 'Voltar para lista'
  const primaryAction = podeAceitar ? aceitarPedido : podeAbrirChat ? abrirChat : voltarParaLista

  return (
    <main className="min-h-[100dvh] bg-[#eef4ff] px-2 py-2 text-[#06184a] md:px-5 md:py-5">
      <section className="mx-auto w-full max-w-[1540px] rounded-[28px] border border-blue-100 bg-white p-4 shadow-[0_24px_80px_rgba(15,72,150,0.12)] md:rounded-[34px] md:p-8">
        <header className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto]">
          <button
            type="button"
            onClick={voltarParaLista}
            className="grid h-16 w-16 place-items-center rounded-full border border-blue-100 bg-blue-50 text-[#06184a] shadow-[0_10px_24px_rgba(15,72,150,0.08)] transition active:scale-[0.98] md:h-[66px] md:w-[66px]"
            aria-label="Voltar"
          >
            <IconChevronLeft className="h-8 w-8" />
          </button>

          <div className="min-w-0 text-center">
            <h1 className="text-2xl font-black tracking-tight md:text-[32px]">Detalhes do pedido</h1>
            <div className="mt-2">
              <StatusPill status={status} label={statusLabel} />
            </div>
          </div>

          <div className="col-span-2 justify-self-end md:col-span-1">
            <span className="inline-flex h-14 items-center gap-2 rounded-full bg-blue-600 px-6 text-lg font-black text-white shadow-[0_16px_34px_rgba(37,99,235,0.25)]">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white/18">
                <IconDollar className="h-4 w-4" />
              </span>
              {formatMoney(pedido.valor)}
            </span>
          </div>
        </header>

        <div className="mt-7 rounded-[28px] border border-blue-100 bg-white p-4 shadow-[0_14px_44px_rgba(15,72,150,0.06)] md:p-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_520px]">
            <div className="min-w-0 xl:border-r xl:border-blue-100 xl:pr-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex max-w-full items-center gap-3 rounded-full border border-blue-100 bg-blue-50 px-5 py-3 text-lg font-black text-blue-700">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-600 text-white">
                    <IconBox className="h-5 w-5" />
                  </span>
                  <span className="truncate">{categoria}</span>
                </span>
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-5 py-3 text-lg font-black uppercase text-emerald-600">
                  {statusLabel}
                </span>
              </div>

              <h2 className="mt-6 break-words text-[46px] font-black leading-[0.95] tracking-tight text-[#06184a] md:text-[70px]">
                {tituloPedido}
              </h2>

              <div className="mt-7">
                <h3 className="text-2xl font-black text-blue-700">Descrição do pedido</h3>
                <p className="mt-3 whitespace-pre-wrap break-words text-xl font-semibold leading-relaxed text-[#06184a]">
                  {descricaoPedido}
                </p>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                <MetricCard icon={<IconDollar className="h-7 w-7" />} label="Valor" value={formatMoney(pedido.valor)} />
                <MetricCard icon={<IconClock className="h-7 w-7" />} label="Postado" value={formatTempo(criadoEm)} />
                <MetricCard icon={<IconCalendar className="h-7 w-7" />} label="Data" value={formatData(criadoEm)} />
                <MetricCard icon={<IconPin className="h-7 w-7" />} label="Local" value={localOk ? 'Mapa disponível' : 'A combinar'} />
              </div>

              <div className="mt-5 flex items-center gap-4 rounded-[22px] border border-blue-100 bg-white px-5 py-4 shadow-[0_12px_28px_rgba(15,72,150,0.06)]">
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[20px] bg-blue-600 text-white shadow-[0_14px_30px_rgba(37,99,235,0.22)]">
                  <IconShield className="h-9 w-9" />
                </span>
                <div>
                  <div className="text-xl font-black text-[#06184a]">Pedido seguro</div>
                  <div className="mt-1 text-lg font-semibold leading-snug text-slate-600">
                    Use o chat para combinar os detalhes antes de aceitar.
                  </div>
                </div>
              </div>
            </div>

            <aside className="grid content-start gap-5">
              <MiniMapPreview onOpen={() => setMapOpen(true)} disabled={!localOk} />

              <div className="rounded-[24px] border border-blue-100 bg-white p-5 shadow-[0_12px_28px_rgba(15,72,150,0.06)]">
                <div className="text-lg font-black text-[#06184a]">Enviado por</div>
                <div className="mt-5 flex items-center gap-4">
                  {criadorFoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={criadorFoto}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-full object-cover ring-4 ring-blue-50"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-blue-50 text-xl font-black text-blue-700 ring-4 ring-blue-50">
                      {getInitials(criadorNome)}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xl font-black text-[#06184a]">{criadorNome}</div>
                    <div className={`mt-1 flex items-center gap-2 text-base font-semibold ${criadorOnline ? 'text-emerald-600' : 'text-slate-500'}`}>
                      <span className={`h-3 w-3 rounded-full ${criadorOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      {criadorOnline ? 'Online' : 'Aceita agendamento'}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={abrirChat}
                    className="grid h-16 w-16 shrink-0 place-items-center rounded-[20px] border border-blue-100 bg-white text-blue-700 shadow-[0_10px_24px_rgba(15,72,150,0.08)] transition active:scale-[0.98]"
                    aria-label="Abrir chat"
                  >
                    <IconChat className="h-8 w-8" />
                  </button>

                  <a
                    href={telefoneLink || undefined}
                    aria-disabled={!telefoneLink}
                    className={`grid h-16 w-16 shrink-0 place-items-center rounded-[20px] border border-blue-100 bg-white shadow-[0_10px_24px_rgba(15,72,150,0.08)] transition active:scale-[0.98] ${telefoneLink ? 'text-blue-700' : 'pointer-events-none text-slate-300'}`}
                    aria-label="Ligar para o cliente"
                  >
                    <IconPhone className="h-8 w-8" />
                  </a>
                </div>
              </div>
            </aside>
          </div>
        </div>

        <div className="mt-5 grid rounded-[24px] border border-blue-100 bg-gradient-to-r from-blue-50 to-white p-4 shadow-[0_12px_34px_rgba(15,72,150,0.06)] md:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-blue-100">
          <FeatureCard icon={<IconShield className="h-8 w-8" />} title="Comunique-se" text="Converse no chat antes de aceitar" />
          <FeatureCard icon={<IconRoute className="h-8 w-8" />} title="Rota rápida" text="Veja a melhor rota até o local" />
          <FeatureCard icon={<IconDollar className="h-8 w-8" />} title="Pagamento seguro" text="Combine tudo antes de concluir" />
          <FeatureCard icon={<IconStar className="h-8 w-8" />} title="Avaliação" text="Ambos avaliam após concluir o pedido" />
        </div>

        {erro ? (
          <div className="mt-4 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700">
            {erro}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <button
            type="button"
            onClick={voltarParaLista}
            className="flex min-h-[86px] items-center justify-center gap-4 rounded-[24px] border-2 border-blue-600 bg-white px-6 text-2xl font-black text-blue-700 shadow-[0_14px_32px_rgba(15,72,150,0.08)] transition active:scale-[0.98]"
          >
            <span className="grid h-16 w-16 place-items-center rounded-full bg-blue-50 text-[#06184a]">
              <IconX className="h-8 w-8" />
            </span>
            {podeAceitar ? 'Recusar pedido' : 'Voltar'}
          </button>

          <button
            type="button"
            onClick={primaryAction}
            disabled={aceitando}
            className="flex min-h-[86px] flex-col items-center justify-center rounded-[24px] bg-blue-600 px-6 text-white shadow-[0_18px_42px_rgba(37,99,235,0.3)] transition active:scale-[0.99] disabled:opacity-65"
          >
            <span className="mb-2 grid h-11 w-11 place-items-center rounded-full bg-white text-blue-600">
              <IconCheck className="h-7 w-7" />
            </span>
            <span className="text-3xl font-black leading-none">{primaryLabel}</span>
            <span className="mt-2 text-lg font-semibold text-blue-100">
              {podeAceitar ? 'Você será notificado e pode conversar com o cliente' : 'Acompanhe os detalhes pelo chat'}
            </span>
          </button>
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
