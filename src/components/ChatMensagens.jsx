'use client'

import { useEffect, useRef, useState } from 'react'
import { database } from '@/lib/firebase'
import { ref, push, onValue, query, limitToLast } from 'firebase/database'

export default function ChatMensagens({
  pedidoId,
  meuId,
  meuNome,
  pedidoTitulo = 'Corre aqui',
  outroUser,
}) {
  const [mensagens, setMensagens] = useState([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [tempo, setTempo] = useState(0)

  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const chatRef = useRef(null)

  const outroNome = outroUser?.nome || 'Alguém'
  const nomeMeu = meuNome || 'Você'

  useEffect(() => {
    if (!pedidoId) return

    const mensagensRef = query(ref(database, `chats/${pedidoId}`), limitToLast(50))

    const off = onValue(mensagensRef, (snap) => {
      const data = snap.val() || {}
      const lista = Object.entries(data).map(([id, item]) => ({ id, ...item }))

      lista.sort((a, b) => Number(a.hora || 0) - Number(b.hora || 0))
      setMensagens(lista)

      requestAnimationFrame(() => {
        try {
          if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight
          }
        } catch {}
      })
    })

    return () => off()
  }, [pedidoId])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      try {
        mediaRef.current?.stream?.getTracks?.().forEach((track) => track.stop())
      } catch {}
    }
  }, [])

  function formatarTempo(segundos) {
    const min = String(Math.floor(segundos / 60)).padStart(2, '0')
    const sec = String(segundos % 60).padStart(2, '0')
    return `${min}:${sec}`
  }

  function iniciarTimer() {
    setTempo(0)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTempo((t) => t + 1)
    }, 1000)
  }

  function pararTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  async function iniciarGravacao() {
    if (!pedidoId || gravando) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)

      mediaRef.current = mediaRecorder
      mediaRef.current.stream = stream
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data?.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.start()
      setGravando(true)
      iniciarTimer()
    } catch (error) {
      console.error('Erro ao iniciar gravação:', error)
      alert('Não foi possível acessar o microfone.')
    }
  }

  function pararGravacao() {
    if (!mediaRef.current || mediaRef.current.state === 'inactive') return

    const duracaoAtual = tempo
    pararTimer()

    mediaRef.current.onstop = async () => {
      try {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })

        if (!blob.size) {
          setGravando(false)
          return
        }

        const reader = new FileReader()
        reader.onloadend = async () => {
          try {
            const base64 = reader.result

            await push(ref(database, `chats/${pedidoId}`), {
              audio: base64,
              duracao: duracaoAtual,
              autor: meuNome || 'Anônimo',
              userId: meuId || null,
              hora: Date.now(),
            })
          } catch (error) {
            console.error('Erro ao salvar áudio:', error)
          } finally {
            try {
              mediaRef.current?.stream?.getTracks?.().forEach((track) => track.stop())
            } catch {}
            mediaRef.current = null
            chunksRef.current = []
            setGravando(false)
            setTempo(0)
          }
        }

        reader.readAsDataURL(blob)
      } catch (error) {
        console.error('Erro ao finalizar áudio:', error)
        setGravando(false)
        setTempo(0)
      }
    }

    mediaRef.current.stop()
  }

  const enviar = async () => {
    const t = texto.trim()
    if (!t || !pedidoId || enviando) return

    try {
      setEnviando(true)

      await push(ref(database, `chats/${pedidoId}`), {
        texto: t,
        autor: meuNome || 'Anônimo',
        userId: meuId || null,
        hora: Date.now(),
      })

      setTexto('')
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error)
    } finally {
      setEnviando(false)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  return (
    <div className="w-full max-w-[720px] rounded-3xl overflow-hidden border border-white/10 bg-slate-950/90 shadow-2xl shadow-black/30">
      <div className="px-4 py-4 border-b border-white/10 bg-slate-900/80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-white font-semibold text-base">Conversa do pedido</div>
            <div className="text-gray-400 text-sm truncate max-w-[420px]">{pedidoTitulo}</div>
          </div>

          <div className="text-xs px-3 py-1.5 rounded-full bg-white/10 text-gray-200">
            {mensagens.length} mensagens
          </div>
        </div>

        <div className="mt-2 text-xs text-gray-400">
          Você: <span className="text-gray-200">{nomeMeu}</span> • Outro:{' '}
          <span className="text-gray-200">{outroNome}</span>
        </div>
      </div>

      <div
        ref={chatRef}
        className="h-[360px] overflow-y-auto px-4 py-4 bg-[#020b22] space-y-3"
      >
        {mensagens.length === 0 && (
          <div className="text-gray-400 text-sm">Nenhuma mensagem ainda.</div>
        )}

        {mensagens.map((msg) => {
          const minha =
            (msg.userId && meuId && String(msg.userId) === String(meuId)) ||
            (!msg.userId && msg.autor && meuNome && String(msg.autor) === String(meuNome))

          const hora = new Date(msg.hora || 0).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })

          return (
            <div key={msg.id} className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[82%] rounded-2xl px-3 py-2 ${
                  minha ? 'bg-blue-600 text-white rounded-br-md' : 'bg-slate-800 text-white rounded-bl-md'
                }`}
              >
                {msg.texto ? (
                  <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {msg.texto}
                  </div>
                ) : null}

                {msg.audio && (
                  <div className="mt-2 rounded-xl bg-black/20 p-2">
                    <audio controls className="w-full">
                      <source src={msg.audio} type="audio/webm" />
                    </audio>

                    {msg.duracao ? (
                      <div className="mt-1 text-[11px] text-gray-300">
                        Áudio • {formatarTempo(msg.duracao)}
                      </div>
                    ) : null}
                  </div>
                )}

                <div className="mt-1 text-[10px] text-right text-white/70">{hora}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t border-white/10 bg-slate-900/80 px-4 py-3">
        <div className="flex items-end gap-2">
          <button
            type="button"
            onMouseDown={iniciarGravacao}
            onMouseUp={pararGravacao}
            onMouseLeave={() => {
              if (gravando) pararGravacao()
            }}
            onTouchStart={iniciarGravacao}
            onTouchEnd={pararGravacao}
            className={`h-12 min-w-12 rounded-full flex items-center justify-center text-white text-xl transition ${
              gravando ? 'bg-red-600 scale-110' : 'bg-green-600'
            }`}
            title="Segure para gravar"
          >
            🎤
          </button>

          <div className="flex-1">
            {gravando ? (
              <div className="h-12 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 flex items-center text-red-300 font-mono">
                Gravando... {formatarTempo(tempo)}
              </div>
            ) : (
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Digite uma mensagem..."
                rows={1}
                className="w-full min-h-12 max-h-32 resize-none rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none"
              />
            )}
          </div>

          <button
            type="button"
            onClick={enviar}
            disabled={enviando || !texto.trim() || gravando}
            className="h-12 px-4 rounded-2xl bg-blue-600 text-white font-semibold disabled:opacity-50"
          >
            {enviando ? '...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}
