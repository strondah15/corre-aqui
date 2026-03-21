'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { database } from '@/lib/firebase'
import { ref, push, onValue, update, query, limitToLast } from 'firebase/database'

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
  const lastMsgCount = useRef(0)

  const outroId = outroUser?.id || null
  const outroNome = outroUser?.nome || 'Alguém'
  const nomeMeu = meuNome || 'Você'

  function formatarTempo(segundos) {
    const min = String(Math.floor(segundos / 60)).padStart(2, '0')
    const sec = String(segundos % 60).padStart(2, '0')
    return `${min}:${sec}`
  }

  function iniciarTimer() {
    setTempo(0)
    timerRef.current = setInterval(() => {
      setTempo((t) => t + 1)
    }, 1000)
  }

  function pararTimer() {
    clearInterval(timerRef.current)
  }

  async function iniciarGravacao() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mediaRecorder = new MediaRecorder(stream)

    mediaRef.current = mediaRecorder
    chunksRef.current = []

    mediaRecorder.ondataavailable = (e) => {
      chunksRef.current.push(e.data)
    }

    mediaRecorder.start()
    setGravando(true)
    iniciarTimer()
  }

  function pararGravacao() {
    if (!mediaRef.current) return

    pararTimer()

    mediaRef.current.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })

      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64 = reader.result

        await push(ref(database, `chats/${pedidoId}`), {
          audio: base64,
          duracao: tempo,
          autor: meuNome || 'Anônimo',
          userId: meuId || null,
          hora: Date.now(),
        })
      }

      reader.readAsDataURL(blob)
    }

    mediaRef.current.stop()
    setGravando(false)
  }

  useEffect(() => {
    if (!pedidoId) return

    const mensagensRef = query(ref(database, `chats/${pedidoId}`), limitToLast(50))

    const off = onValue(mensagensRef, (snap) => {
      const data = snap.val() || {}
      const lista = Object.entries(data).map(([id, item]) => ({ id, ...item }))

      lista.sort((a, b) => Number(a.hora || 0) - Number(b.hora || 0))

      setMensagens(lista)
    })

    return () => off()
  }, [pedidoId])

  const enviar = async () => {
    if (!texto.trim()) return

    await push(ref(database, `chats/${pedidoId}`), {
      texto,
      autor: meuNome || 'Anônimo',
      userId: meuId || null,
      hora: Date.now(),
    })

    setTexto('')
  }

  return (
    <div>
      {mensagens.map((msg) => {
        const hora = new Date(msg.hora || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

        return (
          <div key={msg.id}>
            <div>{msg.texto}</div>

            {msg.audio && (
              <div>
                <audio controls>
                  <source src={msg.audio} type="audio/webm" />
                </audio>
                {msg.duracao && <span>{formatarTempo(msg.duracao)}</span>}
              </div>
            )}

            <div>{hora}</div>
          </div>
        )
      })}

      <button
        onMouseDown={iniciarGravacao}
        onMouseUp={pararGravacao}
      >
        🎤 {gravando && formatarTempo(tempo)}
      </button>

      <input value={texto} onChange={(e) => setTexto(e.target.value)} />
      <button onClick={enviar}>Enviar</button>
    </div>
  )
}
