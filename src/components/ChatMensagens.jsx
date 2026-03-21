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
  const mediaRef = useRef(null)
  const chunksRef = useRef([])


  const chatRef = useRef(null)
  const lastMsgCount = useRef(0)

  const outroId = outroUser?.id || null
  const outroNome = outroUser?.nome || 'Alguém'
  const nomeMeu = meuNome || 'Você'

  const podeNotificar = useMemo(() => {
    if (!outroId || !meuId) return false
    return String(outroId) !== String(meuId)
  }, [outroId, meuId])

  const tituloSeguro = useMemo(() => {
    const t = String(pedidoTitulo || '').trim()
    return t || 'Corre aqui'
  }, [pedidoTitulo])

  /* =========================
     ✅ 0) Ao abrir / trocar chat -> marcar como lido
  ========================== */
  useEffect(() => {
    if (!pedidoId || !meuId) return

    update(ref(database, `conversas/${meuId}/${pedidoId}`), {
      unread: false,
    }).catch(() => {})

    // reset contador de scroll quando troca pedido
    lastMsgCount.current = 0
  }, [pedidoId, meuId])

  /* =========================
     ✅ 1) Listener OTIMIZADO
  ========================== */
  useEffect(() => {
    if (!pedidoId) return

    const mensagensRef = query(ref(database, `chats/${pedidoId}`), limitToLast(50))

    const off = onValue(mensagensRef, (snap) => {
      const data = snap.val() || {}
      const lista = Object.entries(data).map(([id, item]) => ({ id, ...item }))

      lista.sort((a, b) => Number(a.hora || a.createdAt || 0) - Number(b.hora || b.createdAt || 0))

      setMensagens(lista)

      // ✅ scroll só se chegou msg nova
      if (lista.length > lastMsgCount.current) {
        requestAnimationFrame(() => {
          try {
            chatRef.current?.scrollTo({
              top: chatRef.current.scrollHeight,
              behavior: 'smooth',
            })
          } catch {}
        })
      }

      lastMsgCount.current = lista.length
    })

    

  async function iniciarGravacao() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mediaRecorder = new MediaRecorder(stream)
    mediaRef.current = mediaRecorder
    chunksRef.current = []
    mediaRecorder.ondataavailable = (e) => chunksRef.current.push(e.data)
    mediaRecorder.start()
    setGravando(true)
  }

  function pararGravacao() {
    if (!mediaRef.current) return
    mediaRef.current.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64 = reader.result
        await push(ref(database, `chats/${pedidoId}`), {
          audio: base64,
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

  return () => off()
  }, [pedidoId])

  /* =========================
     ✅ 2) Enviar mensagem
  ========================== */
  const enviar = async () => {
    const t = texto.trim()
    if (!t || !pedidoId || enviando) return

    // cache do texto pra restaurar em falha
    const backup = t

    setEnviando(true)
    setTexto('')

    try {
      const mensagensRef = ref(database, `chats/${pedidoId}`)
      const hora = Date.now()

      // ✅ salva mensagem no chat
      await push(mensagensRef, {
        texto: backup,
        autor: meuNome || 'Anônimo',
        userId: meuId || null,
        hora,
      })

      // ✅ base do "inbox"
      const baseIndex = {
        pedidoId,
        titulo: tituloSeguro,
        lastText: backup.slice(0, 80),
        lastAt: hora,
      }

      // ✅ meu inbox (sempre unread false)
      if (meuId) {
        await update(ref(database, `conversas/${meuId}/${pedidoId}`), {
          ...baseIndex,
          otherId: outroId || null,
          otherNome: outroNome || null,
          unread: false,
        })
      }

      // ✅ inbox do outro (unread true)
      if (podeNotificar) {
        await update(ref(database, `conversas/${outroId}/${pedidoId}`), {
          ...baseIndex,
          otherId: meuId || null,
          otherNome: meuNome || 'Anônimo',
          unread: true,
        })

        // ✅ opcional: notificação (se você usar)
        await push(ref(database, `notificacoes/${outroId}`), {
          tipo: 'msg',
          pedidoId,
          titulo: tituloSeguro,
          fromId: meuId || null,
          fromNome: meuNome || 'Anônimo',
          texto: backup.slice(0, 120),
          createdAt: hora,
          lida: false,
        })
      }
    } catch (e) {
      console.error('❌ erro ao enviar msg:', e)
      setTexto(backup) // devolve texto se falhar
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

  const glass = 'bg-white/10 backdrop-blur-md border border-white/10 shadow-xl shadow-black/30'

  

  async function iniciarGravacao() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mediaRecorder = new MediaRecorder(stream)
    mediaRef.current = mediaRecorder
    chunksRef.current = []
    mediaRecorder.ondataavailable = (e) => chunksRef.current.push(e.data)
    mediaRecorder.start()
    setGravando(true)
  }

  function pararGravacao() {
    if (!mediaRef.current) return
    mediaRef.current.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64 = reader.result
        await push(ref(database, `chats/${pedidoId}`), {
          audio: base64,
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

  return (
    <div className={`w-full max-w-[520px] mt-3 rounded-2xl overflow-hidden ${glass}`}>
      {/* topo */}
      <div className="px-4 py-3 border-b border-white/10 bg-white/5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-gray-100">💬 Conversa · {tituloSeguro}</div>
          <div className="text-[11px] px-2 py-1 rounded-full bg-white/10 border border-white/10 text-gray-200">
            {mensagens.length} msgs
          </div>
        </div>
        <div className="mt-1 text-[11px] text-gray-400">
          Você: <b className="text-gray-200">{nomeMeu}</b> · Outro:{' '}
          <b className="text-gray-200">{outroNome}</b>
        </div>
      </div>

      {/* mensagens */}
      <div ref={chatRef} className="h-72 overflow-y-auto px-4 py-3 space-y-2 bg-black/20">
        {mensagens.length === 0 && <div className="text-sm text-gray-300">Nenhuma mensagem ainda.</div>}

        {mensagens.map((msg) => {
          const minha =
            (msg.userId && meuId && String(msg.userId) === String(meuId)) ||
            (!msg.userId && msg.autor && meuNome && String(msg.autor) === String(meuNome))

          const ts = Number(msg.hora || msg.createdAt || 0)
          const hora =
            ts > 0
              ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : ''

          

  async function iniciarGravacao() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mediaRecorder = new MediaRecorder(stream)
    mediaRef.current = mediaRecorder
    chunksRef.current = []
    mediaRecorder.ondataavailable = (e) => chunksRef.current.push(e.data)
    mediaRecorder.start()
    setGravando(true)
  }

  function pararGravacao() {
    if (!mediaRef.current) return
    mediaRef.current.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64 = reader.result
        await push(ref(database, `chats/${pedidoId}`), {
          audio: base64,
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

  return (
            <div key={msg.id} className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[86%] px-3 py-2 text-sm rounded-2xl border ${
                  minha
                    ? 'bg-blue-600/25 border-blue-500/20 rounded-br-md'
                    : 'bg-white/10 border-white/10 rounded-bl-md'
                }`}
              >
                <div className="leading-relaxed whitespace-pre-wrap text-gray-100">{msg.texto}</div>{msg.audio && (<audio controls className='mt-2'><source src={msg.audio} type='audio/webm'/></audio>)}
                <div className="mt-1 text-[10px] text-gray-400 text-right">{hora}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* input */}
      <div className="border-t border-white/10 bg-white/5 px-3 py-3">
        <div className="flex gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Mensagem para ${outroNome}`}
            rows={2}
            className="flex-1 text-sm px-3 py-2 rounded-2xl bg-white/10 border border-white/10 text-gray-100 resize-none"
          />

          <div className="flex gap-2">
  <button
    onMouseDown={iniciarGravacao}
    onMouseUp={pararGravacao}
    onTouchStart={iniciarGravacao}
    onTouchEnd={pararGravacao}
    className={`px-3 rounded-full text-white ${gravando ? 'bg-red-600' : 'bg-green-600'}`}
  >
    🎤
  </button>

  <button
    onClick={enviar}
    disabled={enviando || !texto.trim()}
    className="px-4 rounded-2xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50"
    type="button"
  >
    {enviando ? '...' : '➤'}
  </button>
</div>
        </div>
      </div>
    </div>
  )
}


// ====== UPDATE: DATA, HORA E AUDIO ======
function formatarDataHora(ts){
  const d = ts ? new Date(ts) : new Date();
  return d.toLocaleString();
}

// Exemplo de uso dentro das mensagens:
// {formatarDataHora(msg.timestamp)}

// ===== AUDIO SIMPLES =====
let mediaRecorder;
let chunks = [];

export async function iniciarGravacao(setAudioBlob){
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = e => chunks.push(e.data);
  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'audio/webm' });
    chunks = [];
    setAudioBlob(blob);
  };
  mediaRecorder.start();
}

export function pararGravacao(){
  if(mediaRecorder){
    mediaRecorder.stop();
  }
}
