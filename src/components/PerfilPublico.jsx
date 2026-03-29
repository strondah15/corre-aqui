'use client'

export default function PerfilPublico({ user, onClose }) {
  if (!user) return null

  const prof = user.profissional || {}

  return (
    <div className="fixed inset-0 z-[99999]">

      {/* FUNDO */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* CARD */}
      <div className="absolute bottom-0 left-0 right-0 bg-[#0b1220] text-white rounded-t-3xl p-5 animate-slideUp">

        {/* HEADER */}
        <div className="flex items-center gap-4 mb-4">

          {user.fotoURL ? (
            <img
              src={user.fotoURL}
              className="w-16 h-16 rounded-full object-cover border-2 border-blue-500"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-2xl">
              {user.avatarEmoji || '🙂'}
            </div>
          )}

          <div>
            <div className="text-lg font-bold">
              {user.nome || 'Usuário'}
            </div>

            <div className="text-sm text-gray-400">
              {user.cidade || 'Local não informado'}
            </div>
          </div>
        </div>

        {/* PROFISSIONAL */}
        {prof?.titulo && (
          <div className="bg-white/5 p-4 rounded-2xl border border-white/10 mb-4">

            <div className="text-blue-400 font-semibold mb-1">
              {prof.titulo}
            </div>

            <div className="text-sm text-gray-300 mb-2">
              {prof.descricao}
            </div>

            <div className="text-green-400 font-bold">
              💰 R$ {prof.preco || 'a combinar'}
            </div>

          </div>
        )}

        {/* WHATSAPP */}
        {prof?.whatsapp && (
          <a
            href={`https://wa.me/${prof.whatsapp}`}
            target="_blank"
            className="block text-center bg-green-600 py-3 rounded-2xl font-bold shadow-lg"
          >
            Falar no WhatsApp
          </a>
        )}

      </div>
    </div>
  )
}