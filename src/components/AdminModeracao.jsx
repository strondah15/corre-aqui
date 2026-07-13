'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { onAuthStateChanged } from 'firebase/auth'
import { limitToLast, onValue, query, ref, update } from '@/lib/firebaseDebug'
import { auth, database } from '@/lib/firebase'
import LogoCorreAqui from '@/components/LogoCorreAqui'

const STATUS = [
  { id: 'aberto', label: 'Aberto', tone: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'em_analise', label: 'Em analise', tone: 'bg-blue-100 text-blue-800 border-blue-200' },
  { id: 'resolvido', label: 'Resolvido', tone: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'arquivado', label: 'Arquivado', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
]

const TIPOS = {
  servico_nao_resolvido: 'Servico nao resolvido',
  valor_combinado: 'Valor ou combinado',
  atraso_cancelamento: 'Atraso ou cancelamento',
  conduta_inadequada: 'Conduta inadequada',
  seguranca_golpe: 'Seguranca ou golpe',
  outro: 'Outro',
}

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

function formatData(v) {
  const ms = getMs(v)
  if (!ms) return 'sem data'
  return new Date(ms).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusInfo(status) {
  const id = String(status || 'aberto').toLowerCase()
  return STATUS.find((s) => s.id === id) || STATUS[0]
}

function isAdminUser(adminFlag) {
  return adminFlag === true
}

function normalizeRegistros(problemas, denuncias, pedidos, users) {
  const map = new Map()

  problemas.forEach((item) => {
    if (!item?.id) return
    map.set(item.id, {
      ...item,
      id: item.id,
      origem: 'problema',
      denuncia: item.denuncia === true,
    })
  })

  denuncias.forEach((item) => {
    if (!item?.id) return
    const atual = map.get(item.id) || {}
    map.set(item.id, {
      ...atual,
      ...item,
      id: item.id,
      origem: 'denuncia',
      denuncia: true,
    })
  })

  return Array.from(map.values())
    .map((item) => {
      const pedido = pedidos[item.pedidoId] || null
      const autorId = item?.autor?.id || ''
      const autorUser = autorId ? users[autorId] : null
      const clienteUser = item?.clienteId ? users[item.clienteId] : null
      const aceitadorUser = item?.aceitadorId ? users[item.aceitadorId] : null

      return {
        ...item,
        pedido,
        autorUser,
        clienteUser,
        aceitadorUser,
        tipoLabel: TIPOS[item.tipo] || item.tipo || 'Registro',
        statusNormalizado: String(item.status || 'aberto').toLowerCase(),
        criadoMs: getMs(item.criadoEm),
      }
    })
    .sort((a, b) => b.criadoMs - a.criadoMs)
}

function GuardCard({ title, message, children }) {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#050914] px-4 py-6 text-white">
      <div className="w-full max-w-md rounded-[30px] border border-white/10 bg-white/[0.055] p-5 text-center shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <LogoCorreAqui className="mx-auto h-16 w-16 rounded-2xl" />
        <h1 className="mt-4 text-2xl font-black">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{message}</p>
        <div className="mt-5">{children}</div>
      </div>
    </main>
  )
}

export default function AdminModeracao() {
  const [authUser, setAuthUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [userNode, setUserNode] = useState(null)
  const [adminFlag, setAdminFlag] = useState(false)
  const [problemas, setProblemas] = useState([])
  const [denuncias, setDenuncias] = useState([])
  const [pedidos, setPedidos] = useState({})
  const [users, setUsers] = useState({})
  const [statusFiltro, setStatusFiltro] = useState('pendentes')
  const [tipoFiltro, setTipoFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [selecionadoId, setSelecionadoId] = useState('')
  const [novoStatus, setNovoStatus] = useState('em_analise')
  const [notaInterna, setNotaInterna] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    const off = onAuthStateChanged(auth, (user) => {
      setAuthUser(user || null)
      setAuthReady(true)
    })
    return () => off()
  }, [])

  useEffect(() => {
    if (!authUser?.uid) {
      setUserNode(null)
      setAdminFlag(false)
      return
    }

    const offUser = onValue(ref(database, `users/${authUser.uid}`), (snap) => {
      setUserNode(snap.val() || null)
    })
    const offAdmin = onValue(ref(database, `admins/${authUser.uid}`), (snap) => {
      setAdminFlag(snap.val() === true)
    })

    return () => {
      offUser()
      offAdmin()
    }
  }, [authUser?.uid])

  const isAdmin = useMemo(() => isAdminUser(adminFlag), [adminFlag])

  useEffect(() => {
    if (!isAdmin) return

    const offProblemas = onValue(query(ref(database, 'problemasServico'), limitToLast(300)), (snap) => {
      const raw = snap.val() || {}
      setProblemas(Object.entries(raw).map(([id, item]) => ({ id, ...(item || {}) })))
    })
    const offDenuncias = onValue(query(ref(database, 'denuncias'), limitToLast(300)), (snap) => {
      const raw = snap.val() || {}
      setDenuncias(Object.entries(raw).map(([id, item]) => ({ id, ...(item || {}) })))
    })
    const offPedidos = onValue(query(ref(database, 'pedidos'), limitToLast(500)), (snap) => {
      setPedidos(snap.val() || {})
    })
    const offUsers = onValue(ref(database, 'users'), (snap) => {
      setUsers(snap.val() || {})
    })

    return () => {
      offProblemas()
      offDenuncias()
      offPedidos()
      offUsers()
    }
  }, [isAdmin])

  const registros = useMemo(
    () => normalizeRegistros(problemas, denuncias, pedidos, users),
    [problemas, denuncias, pedidos, users]
  )

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    return registros.filter((r) => {
      const status = r.statusNormalizado || 'aberto'
      const pendente = status === 'aberto' || status === 'em_analise'
      if (statusFiltro === 'pendentes' && !pendente) return false
      if (statusFiltro !== 'todos' && statusFiltro !== 'pendentes' && status !== statusFiltro) return false
      if (tipoFiltro === 'denuncias' && !r.denuncia) return false
      if (tipoFiltro === 'problemas' && r.denuncia) return false

      if (!termo) return true
      const haystack = [
        r.id,
        r.pedidoId,
        r.tipoLabel,
        r.descricao,
        r?.autor?.nome,
        r?.pedido?.titulo,
        r?.clienteUser?.nome,
        r?.aceitadorUser?.nome,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(termo)
    })
  }, [registros, busca, statusFiltro, tipoFiltro])

  const selecionado = useMemo(() => {
    if (!filtrados.length) return null
    return filtrados.find((r) => r.id === selecionadoId) || filtrados[0]
  }, [filtrados, selecionadoId])

  useEffect(() => {
    if (!selecionado) return
    setSelecionadoId(selecionado.id)
    setNovoStatus(selecionado.statusNormalizado === 'aberto' ? 'em_analise' : selecionado.statusNormalizado)
    setNotaInterna(selecionado?.moderacao?.notaInterna || '')
  }, [selecionado])

  const metricas = useMemo(() => {
    return {
      total: registros.length,
      abertos: registros.filter((r) => r.statusNormalizado === 'aberto').length,
      analise: registros.filter((r) => r.statusNormalizado === 'em_analise').length,
      denuncias: registros.filter((r) => r.denuncia).length,
    }
  }, [registros])

  async function salvarModeracao() {
    if (!selecionado || !authUser?.uid || salvando) return

    try {
      setSalvando(true)
      setFeedback('')
      const agora = Date.now()
      const adminNome = userNode?.profile?.nome || userNode?.nome || authUser.displayName || 'Admin'
      const nota = notaInterna.trim().slice(0, 1200)
      const moderacao = {
        status: novoStatus,
        notaInterna: nota,
        adminId: authUser.uid,
        adminNome,
        atualizadoEm: agora,
      }

      const updates = {
        [`problemasServico/${selecionado.id}/status`]: novoStatus,
        [`problemasServico/${selecionado.id}/moderacao`]: moderacao,
        [`problemasServico/${selecionado.id}/moderadoEm`]: agora,
        [`problemasServico/${selecionado.id}/moderadoPor`]: { id: authUser.uid, nome: adminNome },
      }

      if (selecionado.denuncia) {
        updates[`denuncias/${selecionado.id}/status`] = novoStatus
        updates[`denuncias/${selecionado.id}/moderacao`] = moderacao
        updates[`denuncias/${selecionado.id}/moderadoEm`] = agora
        updates[`denuncias/${selecionado.id}/moderadoPor`] = { id: authUser.uid, nome: adminNome }
      }

      if (selecionado.pedidoId && selecionado.pedido) {
        updates[`pedidos/${selecionado.pedidoId}/problemaServico/status`] = novoStatus
        updates[`pedidos/${selecionado.pedidoId}/problemaServico/moderacao`] = {
          status: novoStatus,
          atualizadoEm: agora,
        }
        updates[`pedidos/${selecionado.pedidoId}/atualizadoEm`] = agora
      }

      await update(ref(database), updates)
      setFeedback('Moderacao salva.')
    } catch (error) {
      setFeedback(error?.message || 'Nao consegui salvar a moderacao.')
    } finally {
      setSalvando(false)
    }
  }

  if (!authReady) {
    return (
      <GuardCard title="Abrindo moderacao..." message="Verificando sua sessao e permissoes." />
    )
  }

  if (!authUser?.uid) {
    return (
      <GuardCard title="Entre para continuar" message="A moderacao exige uma conta autenticada.">
        <Link
          href="/login"
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-black text-slate-950"
        >
          Ir para login
        </Link>
      </GuardCard>
    )
  }

  if (!isAdmin) {
    return (
      <GuardCard
        title="Acesso restrito"
        message="Esta area aparece apenas para contas marcadas como admin no Firebase."
      >
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm font-black text-white"
        >
          Voltar ao app
        </Link>
      </GuardCard>
    )
  }

  return (
    <main className="min-h-[100dvh] bg-[#050914] px-3 py-4 text-white sm:px-5 sm:py-6">
      <div className="mx-auto w-full max-w-7xl">
        <header className="rounded-[30px] border border-white/10 bg-white/[0.055] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <LogoCorreAqui className="h-14 w-14 rounded-2xl" />
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-red-300">
                  Admin
                </div>
                <h1 className="truncate text-2xl font-black sm:text-3xl">Moderacao</h1>
                <p className="mt-1 text-sm text-slate-400">
                  Acompanhe denuncias, problemas de servico e decisoes internas.
                </p>
              </div>
            </div>

            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm font-black text-white transition hover:bg-white/[0.1]"
            >
              Voltar ao app
            </Link>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {[
              ['Total', metricas.total],
              ['Abertos', metricas.abertos],
              ['Em analise', metricas.analise],
              ['Denuncias', metricas.denuncias],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
                <div className="text-2xl font-black">{value}</div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
              </div>
            ))}
          </div>
        </header>

        <section className="mt-4 grid gap-4 lg:grid-cols-[430px_1fr]">
          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.965] text-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
            <div className="border-b border-slate-200 bg-slate-50 p-3">
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por pedido, usuario ou texto..."
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/25"
              />

              <div className="mt-2 grid grid-cols-2 gap-2">
                <select
                  value={statusFiltro}
                  onChange={(e) => setStatusFiltro(e.target.value)}
                  className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800"
                >
                  <option value="pendentes">Pendentes</option>
                  <option value="todos">Todos</option>
                  <option value="aberto">Abertos</option>
                  <option value="em_analise">Em analise</option>
                  <option value="resolvido">Resolvidos</option>
                  <option value="arquivado">Arquivados</option>
                </select>

                <select
                  value={tipoFiltro}
                  onChange={(e) => setTipoFiltro(e.target.value)}
                  className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800"
                >
                  <option value="todos">Todos tipos</option>
                  <option value="denuncias">Denuncias</option>
                  <option value="problemas">Problemas</option>
                </select>
              </div>
            </div>

            <div className="max-h-[calc(100dvh-21rem)] overflow-y-auto p-2">
              {filtrados.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">
                  Nenhum registro neste filtro.
                </div>
              ) : (
                <div className="space-y-2">
                  {filtrados.map((r) => {
                    const info = statusInfo(r.statusNormalizado)
                    const active = selecionado?.id === r.id
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelecionadoId(r.id)}
                        className={[
                          'w-full rounded-[22px] border p-3 text-left transition active:scale-[0.99]',
                          active
                            ? 'border-blue-300 bg-blue-50 shadow-[0_12px_34px_rgba(37,99,235,0.12)]'
                            : 'border-slate-200 bg-white hover:bg-slate-50',
                        ].join(' ')}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap gap-1.5">
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
                                {r.denuncia ? 'Denuncia' : 'Problema'}
                              </span>
                              <span className={['rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]', info.tone].join(' ')}>
                                {info.label}
                              </span>
                            </div>
                            <div className="mt-2 truncate text-sm font-black text-slate-950">{r.tipoLabel}</div>
                            <div className="mt-0.5 truncate text-xs font-bold text-slate-500">
                              {r?.pedido?.titulo || r.pedidoTitulo || r.pedidoId || 'Pedido nao carregado'}
                            </div>
                          </div>
                          <div className="shrink-0 text-[10px] font-bold text-slate-400">{formatData(r.criadoEm)}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.965] p-4 text-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:p-5">
            {!selecionado ? (
              <div className="grid min-h-[340px] place-items-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 text-center">
                <div>
                  <div className="text-xl font-black">Selecione um registro</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">Os detalhes aparecem aqui.</div>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-red-600">
                      {selecionado.denuncia ? 'Denuncia' : 'Problema'}
                    </div>
                    <h2 className="mt-1 text-2xl font-black text-slate-950">{selecionado.tipoLabel}</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      Registro {selecionado.id} · {formatData(selecionado.criadoEm)}
                    </p>
                  </div>
                  <span className={['w-fit rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em]', statusInfo(selecionado.statusNormalizado).tone].join(' ')}>
                    {statusInfo(selecionado.statusNormalizado).label}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Pedido</div>
                    <div className="mt-2 text-lg font-black text-slate-950">
                      {selecionado?.pedido?.titulo || selecionado.pedidoTitulo || 'Pedido nao carregado'}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-600">
                      ID: {selecionado.pedidoId || '-'}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="font-black text-slate-500">Cliente</div>
                        <div className="mt-1 truncate font-bold text-slate-900">
                          {selecionado?.clienteUser?.nome || selecionado?.pedido?.criador?.nome || selecionado.clienteId || '-'}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="font-black text-slate-500">Aceitador</div>
                        <div className="mt-1 truncate font-bold text-slate-900">
                          {selecionado?.aceitadorUser?.nome || selecionado?.pedido?.aceite?.nome || selecionado.aceitadorId || '-'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Autor do registro</div>
                    <div className="mt-2 text-lg font-black text-slate-950">
                      {selecionado?.autor?.nome || selecionado?.autorUser?.nome || 'Usuario'}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-600">
                      {selecionado?.autor?.id || '-'}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Descricao enviada</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {selecionado.descricao || 'Sem descricao.'}
                  </p>
                </div>

                <div className="mt-4 rounded-3xl border border-blue-200 bg-blue-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">Acao de moderacao</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[220px_1fr]">
                    <select
                      value={novoStatus}
                      onChange={(e) => setNovoStatus(e.target.value)}
                      className="h-12 rounded-2xl border border-blue-200 bg-white px-3 text-sm font-black text-slate-900"
                    >
                      {STATUS.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>

                    <textarea
                      value={notaInterna}
                      onChange={(e) => setNotaInterna(e.target.value)}
                      placeholder="Observacao interna da moderacao..."
                      className="min-h-24 rounded-2xl border border-blue-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/25"
                    />
                  </div>

                  {feedback ? (
                    <div className="mt-3 rounded-2xl border border-white bg-white/70 px-3 py-2 text-xs font-black text-slate-700">
                      {feedback}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={salvarModeracao}
                    disabled={salvando}
                    className="mt-3 h-12 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {salvando ? 'Salvando...' : 'Salvar moderacao'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
