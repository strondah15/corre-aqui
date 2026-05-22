'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { onValue, ref, serverTimestamp, update } from 'firebase/database'
import { auth, database } from '@/lib/firebase'

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
    <main className="min-h-screen bg-white p-6">
      <h1 className="mb-6 text-3xl font-bold text-blue-600">Pedidos abertos</h1>

      {mensagem ? (
        <p className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
          {mensagem}
        </p>
      ) : null}

      <div className="space-y-4">
        {abertos.map((pedido) => (
          <div key={pedido.id} className="rounded-xl border border-gray-300 p-4 shadow-sm">
            <p className="text-lg font-semibold">
              {pedido.titulo || pedido.texto || 'Pedido sem título'}
            </p>
            <button
              type="button"
              onClick={() => aceitarPedido(pedido)}
              disabled={!user?.uid || pedido?.criador?.id === user.uid}
              className="mt-2 rounded-xl bg-green-500 px-4 py-2 text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Aceitar pedido
            </button>
          </div>
        ))}

        {abertos.length === 0 && (
          <p className="text-gray-500">Nenhum pedido aberto no momento.</p>
        )}
      </div>
    </main>
  )
}
