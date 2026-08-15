'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { database } from '@/lib/firebase'
import { limitToLast, onValue, query, ref, update } from '@/lib/firebaseDebug'

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

function formatTempo(v) {
  const ms = getMs(v)
  if (!ms) return 'agora'
  const diff = Math.max(0, Date.now() - ms)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias < 7) return `${dias} d`
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function formatDataHora(v) {
  const ms = getMs(v)
  if (!ms) return ''
  return new Date(ms).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function pickText(...values) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || ''
}

function formatValor(value) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number') {
    return value > 0 ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''
  }
  const raw = String(value).trim()
  if (!raw) return ''
  if (/r\$/i.test(raw)) return raw
  const normalized = raw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(normalized)
  if (Number.isFinite(n) && n > 0) return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return raw
}

const TONES = {
  emerald: {
    card: 'border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(255,255,255,0.98))]',
    icon: 'bg-emerald-500 text-white shadow-[0_0_34px_rgba(16,185,129,0.34)]',
    label: 'text-emerald-700',
    pill: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    button: 'bg-emerald-500 hover:bg-emerald-400 text-white',
    dot: 'bg-emerald-400',
  },
  amber: {
    card: 'border-amber-200 bg-[linear-gradient(135deg,rgba(255,251,235,0.98),rgba(255,255,255,0.98))]',
    icon: 'bg-yellow-400 text-slate-950 shadow-[0_0_34px_rgba(250,204,21,0.28)]',
    label: 'text-amber-700',
    pill: 'border-amber-200 bg-amber-50 text-amber-700',
    button: 'bg-yellow-400 hover:bg-yellow-300 text-slate-950',
    dot: 'bg-yellow-300',
  },
  blue: {
    card: 'border-blue-200 bg-[linear-gradient(135deg,rgba(239,246,255,0.98),rgba(255,255,255,0.98))]',
    icon: 'bg-blue-500 text-white shadow-[0_0_34px_rgba(59,130,246,0.32)]',
    label: 'text-blue-700',
    pill: 'border-blue-200 bg-blue-50 text-blue-700',
    button: 'bg-blue-600 hover:bg-blue-500 text-white',
    dot: 'bg-blue-400',
  },
  purple: {
    card: 'border-purple-200 bg-[linear-gradient(135deg,rgba(250,245,255,0.98),rgba(255,255,255,0.98))]',
    icon: 'bg-purple-500 text-white shadow-[0_0_34px_rgba(168,85,247,0.32)]',
    label: 'text-purple-700',
    pill: 'border-purple-200 bg-purple-50 text-purple-700',
    button: 'bg-purple-600 hover:bg-purple-500 text-white',
    dot: 'bg-purple-400',
  },
  rose: {
    card: 'border-rose-200 bg-[linear-gradient(135deg,rgba(255,241,242,0.98),rgba(255,255,255,0.98))]',
    icon: 'bg-rose-500 text-white shadow-[0_0_34px_rgba(244,63,94,0.30)]',
    label: 'text-rose-700',
    pill: 'border-rose-200 bg-rose-50 text-rose-700',
    button: 'bg-rose-500 hover:bg-rose-400 text-white',
    dot: 'bg-rose-400',
  },
  slate: {
    card: 'border-slate-200 bg-white',
    icon: 'bg-slate-700 text-white',
    label: 'text-slate-600',
    pill: 'border-slate-200 bg-slate-50 text-slate-700',
    button: 'bg-slate-700 hover:bg-slate-600 text-white',
    dot: 'bg-slate-400',
  },
}

function tipoInfo(tipo) {
  const t = String(tipo || '').toLowerCase()
  if (t === 'pedido_direto_aceito' || t === 'corre_aceito') return { icon: '✓', label: 'Pedido aceito', tone: 'emerald' }
  if (t === 'pedido_direto_criado') return { icon: '▣', label: 'Novo pedido', tone: 'blue' }
  if (t === 'pedido_direto_recusado' || t === 'agendamento_recusado') return { icon: '×', label: 'Pedido recusado', tone: 'rose' }
  if (t === 'agendamento_criado') return { icon: '▣', label: 'Novo agendamento', tone: 'amber' }
  if (t === 'agendamento_aceito') return { icon: '✓', label: 'Agendamento confirmado', tone: 'blue' }
  if (t.includes('horario') || t.includes('horário')) return { icon: '◷', label: 'Novo horário sugerido', tone: 'purple' }
  if (t === 'atendimento_iniciado') return { icon: '▶', label: 'Atendimento iniciado', tone: 'emerald' }
  if (t === 'mensagem_chat') return { icon: '◦', label: 'Nova mensagem', tone: 'blue' }
  if (t === 'chamar_atencao_chat') return { icon: '!', label: 'Chamar atenção', tone: 'amber' }
  if (t === 'servico_concluido' || t === 'atendimento_finalizado') return { icon: '✓', label: 'Atendimento concluído', tone: 'blue' }
  if (t === 'avaliacao_recebida') return { icon: '★', label: 'Nova avaliação', tone: 'amber' }
  if (t.includes('problema') || t.includes('denuncia') || t.includes('seguranca')) return { icon: '!', label: 'Segurança', tone: 'rose' }
  return { icon: '•', label: 'Aviso', tone: 'slate' }
}

function getActorId(n, relatedPedido) {
  return pickText(
    n?.fromUid,
    n?.autor?.id,
    n?.autor?.uid,
    relatedPedido?.criador?.id,
    relatedPedido?.aceite?.id
  )
}

function getNotificationDetails(n, relatedPedido, actorProfile) {
  const service = pickText(
    n?.servicoTitulo,
    n?.servicoNome,
    n?.pedidoTitulo,
    n?.serviceTitle,
    n?.tituloServico,
    relatedPedido?.servicoSnapshot?.titulo,
    relatedPedido?.servico?.titulo,
    relatedPedido?.titulo
  )
  const value = formatValor(
    n?.valor ??
      n?.preco ??
      n?.valorPedido ??
      n?.pedidoValor ??
      relatedPedido?.valor ??
      relatedPedido?.servicoSnapshot?.valor
  )
  const place = pickText(
    n?.cidade,
    n?.local,
    n?.regiao,
    n?.bairro,
    n?.endereco,
    relatedPedido?.cidade,
    relatedPedido?.local?.cidade,
    relatedPedido?.localizacao?.cidade
  )
  const schedule = pickText(
    n?.horario,
    n?.dataHora,
    n?.data,
    n?.agendaData,
    relatedPedido?.data && relatedPedido?.hora ? `${relatedPedido.data} às ${relatedPedido.hora}` : '',
    relatedPedido?.agendamento?.data && relatedPedido?.agendamento?.hora
      ? `${relatedPedido.agendamento.data} às ${relatedPedido.agendamento.hora}`
      : ''
  )
  const actorId = getActorId(n, relatedPedido)
  const relatedActor =
    String(relatedPedido?.criador?.id || '') === String(actorId) ? relatedPedido?.criador : relatedPedido?.aceite
  const actorName = pickText(
    n?.autor?.nome,
    n?.fromNome,
    n?.clienteNome,
    n?.profissionalNome,
    relatedActor?.nome,
    relatedActor?.displayName,
    actorProfile?.profile?.nome,
    actorProfile?.nome,
    actorProfile?.displayName
  )
  const actorPhoto = pickText(
    n?.autor?.fotoURL,
    n?.autor?.photoURL,
    n?.fromFotoURL,
    n?.clienteFotoURL,
    n?.profissionalFotoURL,
    relatedActor?.fotoURL,
    relatedActor?.photoURL,
    relatedActor?.avatarURL,
    actorProfile?.profile?.fotoURL,
    actorProfile?.fotoURL,
    actorProfile?.photoURL,
    actorProfile?.avatarURL
  )
  return { service, value, place, schedule, actorId, actorName, actorPhoto }
}

function notificationKey(id, notification) {
  const eventId = pickText(notification?.eventId, notification?.id)
  if (eventId) return `event:${eventId}`

  const type = String(notification?.tipo || '').toLowerCase()
  const pedidoId = pickText(notification?.pedidoId, notification?.privateRequestId, notification?.conversaId)
  const fromUid = pickText(notification?.fromUid, notification?.autor?.id, notification?.autor?.uid)
  const message = pickText(notification?.mensagem, notification?.titulo)

  if (pedidoId || fromUid || type) {
    return [type, pedidoId, fromUid, message].join('|')
  }

  return `id:${id}`
}

function mergeNotificationSources(rawLegacy, rawModern) {
  const merged = new Map()
  const add = (source, id, notification) => {
    if (!notification || typeof notification !== 'object') return
    const key = notificationKey(id, notification)
    const current = merged.get(key)
    const sourceEntry = { source, id }

    if (!current) {
      merged.set(key, {
        id,
        ...notification,
        __sources: [sourceEntry],
        __legacy: source === 'legacy',
        __modern: source === 'modern',
      })
      return
    }

    merged.set(key, {
      ...current,
      ...notification,
      id: current.id || id,
      lida: current.lida === true || current.read === true || notification.lida === true || notification.read === true,
      read: current.lida === true || current.read === true || notification.lida === true || notification.read === true,
      __sources: [...current.__sources, sourceEntry],
      __legacy: current.__legacy || source === 'legacy',
      __modern: current.__modern || source === 'modern',
    })
  }

  Object.entries(rawLegacy || {}).forEach(([id, notification]) => add('legacy', id, notification))
  Object.entries(rawModern || {}).forEach(([id, notification]) => add('modern', id, notification))

  return Array.from(merged.values()).sort(
    (a, b) => getMs(b.criadoEm || b.createdAt) - getMs(a.criadoEm || a.createdAt)
  )
}

function defaultActionLabel(notification, info) {
  const type = String(notification?.tipo || '').toLowerCase()
  if (type === 'agendamento_criado') return 'Ver agenda'
  if (type === 'pedido_direto_criado') return 'Ver pedido'
  if (type === 'pedido_direto_aceito' || type === 'atendimento_iniciado' || type === 'mensagem_chat') return 'Abrir conversa'
  if (type === 'agendamento_aceito') return 'Ver pedido'
  if (type === 'pedido_direto_recusado' || type === 'agendamento_recusado') return 'Procurar outro'
  if (type.includes('horario')) return 'Ver agenda'
  if (type === 'avaliacao_recebida') return 'Ver histórico'
  if (type === 'atendimento_finalizado' || type === 'servico_concluido') return 'Ver atendimento'
  return info.tone === 'amber' ? 'Ver agenda' : 'Abrir'
}

function NotificationAvatar({ details, tone }) {
  const initial = pickText(details.actorName, 'C').slice(0, 1).toUpperCase()
  if (details.actorPhoto) {
    return (
      <div className="relative h-12 w-12 shrink-0 rounded-full border-2 border-white bg-slate-100 shadow-[0_8px_22px_rgba(15,23,42,0.14)]">
        <div
          className="h-full w-full rounded-full bg-cover bg-center"
          style={{ backgroundImage: `url(${JSON.stringify(details.actorPhoto)})` }}
          aria-hidden="true"
        />
        <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${TONES[tone]?.dot || TONES.slate.dot}`} />
      </div>
    )
  }

  return (
    <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-slate-200 bg-slate-100 text-base font-black text-slate-700">
      {initial}
      <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${TONES[tone]?.dot || TONES.slate.dot}`} />
    </div>
  )
}

export default function CentralNotificacoes({
  meuId,
  corres = [],
  onAbrirChat,
  onAbrirPedido,
  onAction,
  onToast,
  limit = 80,
}) {
  const [notificacoes, setNotificacoes] = useState([])
  const [filtro, setFiltro] = useState('todas')
  const [actorProfiles, setActorProfiles] = useState({})

  useEffect(() => {
    if (!meuId) {
      setNotificacoes([])
      return undefined
    }

    let rawLegacy = {}
    let rawModern = {}
    const emitLista = () => {
      setNotificacoes(mergeNotificationSources(rawLegacy, rawModern))
    }

    const nLimit = Math.max(20, Number(limit || 80))
    const offLegacy = onValue(query(ref(database, `notificacoes/${meuId}`), limitToLast(nLimit)), (snap) => {
      rawLegacy = snap.val() || {}
      emitLista()
    })
    const offModern = onValue(query(ref(database, `notifications/${meuId}`), limitToLast(nLimit)), (snap) => {
      rawModern = snap.val() || {}
      emitLista()
    })

    return () => {
      offLegacy()
      offModern()
    }
  }, [meuId, limit])

  const actorIds = useMemo(
    () =>
      Array.from(
        new Set(
          notificacoes
            .map((notification) => pickText(notification?.fromUid, notification?.autor?.id, notification?.autor?.uid))
            .filter((id) => id && String(id) !== String(meuId))
        )
      ).slice(0, 12),
    [notificacoes, meuId]
  )

  useEffect(() => {
    if (!actorIds.length) return undefined

    const unsubscribers = actorIds.map((uid) =>
      onValue(
        ref(database, `users/${uid}`),
        (snapshot) => {
          const profile = snapshot.val()
          if (!profile) return
          setActorProfiles((current) => ({ ...current, [uid]: profile }))
        },
        () => {}
      )
    )

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe?.())
  }, [actorIds])

  const naoLidas = useMemo(() => notificacoes.filter((n) => n?.lida !== true && n?.read !== true).length, [notificacoes])
  const lidas = notificacoes.length - naoLidas

  const filtradas = useMemo(() => {
    if (filtro === 'nao_lidas') return notificacoes.filter((n) => n?.lida !== true && n?.read !== true)
    if (filtro === 'lidas') return notificacoes.filter((n) => n?.lida === true || n?.read === true)
    return notificacoes
  }, [notificacoes, filtro])

  const marcarLida = useCallback(
    async (n) => {
      if (!meuId || !n?.id || n?.lida === true || n?.read === true) return
      const agora = Date.now()
      const sources = n.__sources?.length ? n.__sources : [{ source: n.__modern ? 'modern' : 'legacy', id: n.id }]
      const results = await Promise.allSettled(sources.map(({ source, id }) => {
        const root = source === 'modern' ? 'notifications' : 'notificacoes'
        return update(ref(database, `${root}/${meuId}/${id}`), {
          lida: true,
          read: true,
          lidaEm: agora,
          vistoEm: agora,
        })
      }))
      if (process.env.NODE_ENV !== 'production' && results.some((result) => result.status === 'rejected')) {
        console.warn('[NOTIFICATIONS] um espelho nao foi marcado como lido', { eventId: n.eventId || n.id })
      }
    },
    [meuId]
  )

  const marcarTodas = async () => {
    if (!meuId || naoLidas === 0) return
    const agora = Date.now()
    const writes = []
    notificacoes.forEach((n) => {
      if (n?.id && n?.lida !== true && n?.read !== true) {
        const sources = n.__sources?.length ? n.__sources : [{ source: n.__modern ? 'modern' : 'legacy', id: n.id }]
        sources.forEach(({ source, id }) => {
          const root = source === 'modern' ? 'notifications' : 'notificacoes'
          writes.push(update(ref(database, `${root}/${meuId}/${id}`), {
            lida: true,
            read: true,
            lidaEm: agora,
            vistoEm: agora,
          }))
        })
      }
    })
    await Promise.allSettled(writes)
  }

  const abrir = async (n) => {
    await marcarLida(n)
    const action = n?.action || {}
    const actionScreen = String(action?.screen || n?.acao || '').toLowerCase()
    const actionId = action?.id || n?.privateRequestId || n?.pedidoId || n?.conversaId || n?.servicoId
    const pedidoId = n?.pedidoId || n?.conversaId || actionId
    const pedido = (corres || []).find((p) => String(p?.id || '') === String(pedidoId || ''))
    const tipo = String(n?.tipo || '').toLowerCase()
    const deveAbrirPedido =
      actionScreen === 'abrir_pedido' ||
      actionScreen === 'pedido' ||
      actionScreen === 'pedido_details' ||
      actionScreen === 'pedidodetails' ||
      tipo === 'corre_aceito'
    const deveAbrirChat =
      actionScreen === 'abrir_chat' ||
      actionScreen === 'chat' ||
      tipo === 'mensagem_chat' ||
      tipo === 'chamar_atencao_chat' ||
      tipo === 'atendimento_iniciado' ||
      (tipo === 'pedido_direto_aceito' && actionScreen !== 'myorders')

    if (actionScreen === 'avaliacoes') {
      onAction?.('professionalReviews', n)
      return
    }

    if (actionScreen === 'avaliar_pedido' || actionScreen === 'ver_historico') {
      onAction?.('myorders', n)
      return
    }

    if (actionScreen === 'agenda' || actionScreen === 'myorders' || actionScreen === 'portfolio' || actionScreen === 'privaterequestdetails') {
      onAction?.(actionScreen, n)
      return
    }

    if (!pedido) {
      if (deveAbrirPedido && pedidoId) {
        onAction?.('abrir_pedido', n)
        return
      }
      if (deveAbrirChat && pedidoId) {
        onAbrirChat?.({ id: pedidoId, titulo: n?.titulo || 'Conversa do pedido' })
        return
      }
      onToast?.({ type: 'info', title: 'Pedido carregando', message: 'Abra novamente em alguns segundos.' })
      return
    }

    if (deveAbrirChat) {
      onAbrirChat?.(pedido)
      return
    }

    if (deveAbrirPedido) {
      onAbrirPedido?.(pedido)
      return
    }

    onAbrirPedido?.(pedido)
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white text-slate-950 shadow-[0_18px_55px_rgba(15,23,42,0.12)] md:rounded-[32px]">
      <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.10),transparent_34%),linear-gradient(180deg,#ffffff,#f8fafc)] px-4 py-4 md:px-6 md:py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">Tempo real</div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">Notificações</h2>
            <p className="mt-1 max-w-md text-xs font-semibold leading-relaxed text-slate-600 md:text-sm">
              Pedidos, agenda, chat e atualizações importantes em um só lugar.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="relative grid h-10 w-10 place-items-center rounded-2xl border border-amber-200 bg-amber-50 text-lg" aria-label="Notificações">
              🔔
              {naoLidas > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
                  {Math.min(naoLidas, 99)}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={marcarTodas}
              disabled={naoLidas === 0}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Marcar lidas
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ['todas', 'Todas', notificacoes.length],
            ['nao_lidas', 'Não lidas', naoLidas],
            ['lidas', 'Lidas', lidas],
          ].map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              className={[
                'relative h-11 rounded-2xl border text-xs font-black transition active:scale-[0.98] md:h-12 md:text-sm',
                filtro === id
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 shadow-[0_10px_24px_rgba(16,185,129,0.12)]'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {label}
              {Number(count) > 0 ? (
                <span className="ml-2 inline-grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] text-white">
                  {Math.min(Number(count), 99)}
                </span>
              ) : null}
              {filtro === id ? <span className="absolute inset-x-6 -bottom-px h-0.5 rounded-full bg-emerald-500" /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto bg-slate-50 p-3 md:max-h-[calc(100dvh-14rem)] md:p-4">
        {filtradas.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-slate-300 bg-white p-8 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-3xl border border-emerald-200 bg-emerald-50 text-2xl text-emerald-600">✓</div>
            <div className="mt-4 text-lg font-black text-slate-950">Tudo em dia</div>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">Quando algo importante acontecer, aparece aqui.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtradas.map((n, index) => {
              const info = tipoInfo(n?.tipo)
              const tone = TONES[info.tone] || TONES.slate
              const unread = n?.lida !== true && n?.read !== true
              const pedidoId = n?.pedidoId || n?.privateRequestId || n?.conversaId
              const relatedPedido = (corres || []).find((pedido) => String(pedido?.id || '') === String(pedidoId || ''))
              const details = getNotificationDetails(n, relatedPedido, actorProfiles[getActorId(n, relatedPedido)])
              const actionLabel = n?.action?.label || defaultActionLabel(n, info)

              return (
                <motion.article
                  key={n.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: Math.min(index * 0.025, 0.18) }}
                  className={[
                    'rounded-[20px] border p-3 shadow-[0_10px_28px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(15,23,42,0.12)]',
                    tone.card,
                    unread ? 'ring-1 ring-slate-200' : 'opacity-75',
                  ].join(' ')}
                >
                  <div className="flex items-start gap-3">
                    <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl font-black ${tone.icon}`}>
                      {info.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`truncate text-[11px] font-black uppercase tracking-[0.12em] ${tone.label}`}>{info.label}</span>
                        {unread ? (
                          <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-white">
                            Novo
                          </span>
                        ) : null}
                        <span
                          className="ml-auto shrink-0 text-[11px] font-bold text-slate-500"
                          title={formatDataHora(n?.criadoEm || n?.createdAt)}
                        >
                          {formatTempo(n?.criadoEm || n?.createdAt)}
                        </span>
                      </div>

                      <h3 className="mt-1 line-clamp-1 text-sm font-black text-slate-950 md:text-base">
                        {n?.titulo || 'Nova notificação'}
                      </h3>
                      {details.actorName ? (
                        <div className="mt-1 truncate text-xs font-black text-slate-700">{details.actorName}</div>
                      ) : null}
                      <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-600 md:text-sm">
                        {n?.mensagem || 'Você tem uma atualização no Corre Aqui.'}
                      </p>

                      {(details.service || details.value || details.place || details.schedule) ? (
                        <div className="mt-3 rounded-[16px] border border-slate-200 bg-white/80 p-3">
                          {details.service ? <div className="text-sm font-black text-slate-950">{details.service}</div> : null}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {details.value ? <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${tone.pill}`}>{details.value}</span> : null}
                            {details.place ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600">📍 {details.place}</span> : null}
                            {details.schedule ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600">🕒 {details.schedule}</span> : null}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <NotificationAvatar details={details} tone={info.tone} />
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <button
                      type="button"
                      onClick={() => abrir(n)}
                      className={`h-11 rounded-2xl px-4 text-sm font-black shadow-[0_10px_24px_rgba(15,23,42,0.12)] transition active:scale-[0.98] ${tone.button}`}
                    >
                      {actionLabel}
                      <span className="ml-2">→</span>
                    </button>
                    {unread ? (
                      <button
                        type="button"
                        onClick={() => marcarLida(n)}
                        className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
                      >
                        Marcar lida
                      </button>
                    ) : null}
                  </div>
                </motion.article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
