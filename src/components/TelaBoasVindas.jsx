'use client'

export default function TelaBoasVindas({ onEntrar }) {
  return (
    <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-black via-slate-900 to-blue-950 text-white">

      <div className="max-w-md w-full px-6 text-center">

        {/* LOGO */}
        <div className="text-4xl font-bold mb-4">
          🚀 Corre Aqui
        </div>

        {/* FRASE */}
        <h1 className="text-2xl font-semibold mb-3">
          Tudo o que você precisa, perto de você
        </h1>

        <p className="text-gray-400 mb-6">
          Peça ajuda, ofereça serviços e encontre oportunidades em tempo real no mapa.
        </p>

        {/* BOTÕES */}
        <button
          onClick={onEntrar}
          className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 transition font-semibold"
        >
          Entrar
        </button>

        <div className="mt-4 text-sm text-gray-500">
          Ao continuar, você concorda com os termos
        </div>

      </div>
    </div>
  )
}