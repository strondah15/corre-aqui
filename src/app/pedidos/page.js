'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { onValue, ref, serverTimestamp, update } from 'firebase/database'
import { auth, database } from '@/lib/firebase'
import { startPresence } from '@/lib/presence'

export default function ListaPedidos() {
  const [pedidos, setPedidos] = useState([])
  const [user, setUser] = useState(null)
  const [mensagem, setMensagem] = useState('')

  useEffect(() => {
    const off = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser || null)
    })

    return () => off()
  }, [])

  useEffect(() => {
    if (!user?.uid) return undefined

    let nome = user.displayName || ''
    let fotoURL = user.photoURL || ''

    try {
      nome = localStorage.getItem('meuNome') || nome
      fotoURL = localStorage.getItem('fotoURL') || fotoURL
    } catch {}

    return startPresence(database, user, { nome, fotoURL, modoAtual: 'corre' })
  }, [user])

  useEffect(() => {
    if (!user?.uid) {
      setPedidos([])
      return
    }

    const pedidosRef = ref(database, 'pedidos')
    const off = onValue(pedidosRef, (snapshot) => {
      const data = snapshot.val() || {}
      const lista = Object.entries(data).map(([id, pedido]) => ({ id, ...pedido }))
      setPedidos(lista)
    })

    return () => off()
  }, [user])

  const aceitarPedido = async (pedido) => {
    if (!user?.uid) {
      setMensagem('Entre no app para aceitar pedidos.')
      return
    }

    if (pedido?.criador?.id === user.uid) {
      setMensagem('Você não pode aceitar o próprio pedido.')
      return
    }

    const agora = Date.now()
    const nome = localStorage.getItem('meuNome') || user.displayName || 'Corre'

    await update(ref(database, `pedidos/${pedido.id}`), {
      status: 'aceito',
      aceite: {
        id: user.uid,
        nome,
        local: null,
        aceitoEm: agora,
      },
      conversaId: pedido.id,
      aceitoEm: agora,
      atualizadoEm: agora,
      atualizadoEmServer: serverTimestamp(),
    })

    setMensagem('Pedido aceito com sucesso.')
  }

  const abertos = pedidos.filter((p) => (p.status || 'aberto') === 'aberto')

  return (
    <main className="min-h-[100dvh] bg-[linear-gradient(135deg,#0b73ff_0%,#19b7c8_44%,#ffe36b_120%)] px-3 py-4 text-white md:px-6 md:py-7">
      <div className="mx-auto w-full max-w-5xl">
        <header className="rounded-[22px] border border-white/10 bg-white/[0.055] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.32)] md:rounded-[30px] md:p-6">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200 md:text-xs">
            Corre Aqui
          </div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-black md:text-3xl">Pedidos abertos</h1>
              <p className="mt-1 text-xs leading-relaxed text-slate-400 md:text-sm">
                Serviços disponíveis para aceitar agora.
              </p>
            </div>
            <div className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-black text-emerald-200 md:px-4 md:py-2">
              {abertos.length} ativo(s)
            </div>
          </div>
        </header>

        {mensagem ? (
          <p className="mt-3 rounded-2xl border border-blue-300/20 bg-blue-500/12 px-3 py-2.5 text-xs font-black text-blue-100 md:px-4 md:py-3 md:text-sm">
            {mensagem}
          </p>
        ) : null}

        <div className="mt-3 grid gap-2.5 md:mt-5 md:grid-cols-2 md:gap-4">
          {abertos.map((pedido) => (
            <div
              key={pedido.id}
              className="rounded-[20px] border border-white/10 bg-white/[0.965] p-3 text-slate-950 shadow-[0_16px_46px_rgba(0,0,0,0.22)] md:rounded-[26px] md:p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="line-clamp-2 text-lg font-black leading-tight md:text-xl">
                  {pedido.titulo || pedido.texto || 'Pedido sem título'}
                </p>
                <span className="shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-700">
                  aberto
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold text-slate-600 md:text-xs">
                <span className="rounded-full bg-slate-100 px-2 py-1">
                  {pedido.categoriaNome || pedido.categoria || 'Geral'}
                </span>
                {pedido.valor ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                    R$ {pedido.valor}
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => aceitarPedido(pedido)}
                disabled={!user?.uid || pedido?.criador?.id === user.uid}
                className="mt-3 h-10 w-full rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 md:h-11"
              >
                Aceitar pedido
              </button>
            </div>
          ))}

          {abertos.length === 0 && (
            <div className="rounded-[22px] border border-white/10 bg-white/[0.055] p-5 text-center text-sm font-bold text-slate-400 md:col-span-2">
              Nenhum pedido aberto no momento.
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
