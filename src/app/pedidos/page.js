'use client'
import { useEffect, useState } from 'react'
import { database } from '@/lib/firebase'
import { ref, onValue, update } from 'firebase/database'

export default function ListaPedidos() {
  const [pedidos, setPedidos] = useState([])

  useEffect(() => {
    const pedidosRef = ref(database, 'pedidos')
    onValue(pedidosRef, (snapshot) => {
      const data = snapshot.val() || {}
      const lista = Object.entries(data).map(([id, pedido]) => ({ id, ...pedido }))
      setPedidos(lista)
    })
  }, [])

  const aceitarPedido = async (id) => {
    const pedidoRef = ref(database, `pedidos/${id}`)
    await update(pedidoRef, {
      status: 'aceito',
      aceitoPor: {
        nome: 'Anônimo', // futuramente podemos usar nome real
        local: {
          lat: null,
          lng: null
        }
      }
    })
    alert('Pedido aceito com sucesso!')
  }

  return (
    <main className="min-h-screen bg-white p-6">
      <h1 className="text-3xl font-bold text-blue-600 mb-6">Pedidos abertos 📦</h1>

      <div className="space-y-4">
        {pedidos.filter(p => p.status === 'aberto').map(pedido => (
          <div key={pedido.id} className="p-4 border border-gray-300 rounded-xl shadow-sm">
            <p className="font-semibold text-lg">{pedido.texto}</p>
            <p className="text-gray-500 text-sm">Criado em: {new Date(pedido.criadoEm).toLocaleString()}</p>
            <button
              onClick={() => aceitarPedido(pedido.id)}
              className="mt-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl"
            >
              Aceitar pedido
            </button>
          </div>
        ))}

        {pedidos.filter(p => p.status === 'aberto').length === 0 && (
          <p className="text-gray-500">Nenhum pedido aberto no momento.</p>
        )}
      </div>
    </main>
  )
}
