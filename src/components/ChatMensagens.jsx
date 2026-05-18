'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { database } from '@/lib/firebase'
import { ref, push, onValue, query, limitToLast, update, serverTimestamp } from 'firebase/database'
import { motion } from 'framer-motion'

function getMsgMs(v) {
  if (!v) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const parsed = Date.parse(v)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000
  return 0
}

function formatarHoraMensagem(v) {
  const ms = getMsgMs(v)
  if (!ms) return ''
  return new Date(ms).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatarTempo(segundos) {
  const min = String(Math.floor(Number(segundos || 0) / 60)).padStart(2, '0')
  const sec = String(Number(segundos || 0) % 60).padStart(2, '0')
  return `${min}:${sec}`
}

function safeName(v, fallback = 'Alguém') {
  return String(v || '').trim() || fallback
}

const SUGESTOES = [
  'Pode me passar mais detalhes?',
  'Qual melhor horário?',
  'Estou a caminho.',
  'Combinado, obrigado.',
]

export default function ChatMensagens({
  pedidoId,
  meuId,
  meuNome,
  pedidoTitulo = 'Corre aqui',
  outroUser,
  planoAtual = 'free',
  mostrarAnuncio = false,
  onClose,
  onToast,
}) {
  const [mensagens, setMensagens] = useState([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [tempo, setTempo] = useState(0)
  const [fechado, setFechado] = useState(false)

  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const chatRef = useRef(null)

  const outroId = outroUser?.id || null
  const outroNome = safeName(outroUser?.nome)
  const nomeMeu = safeName(meuNome, 'Você')
  const planoNormalizado = String(planoAtual || 'free').toLowerCase()
  const planoPago = planoNormalizado === 'pro' || planoNormalizado === 'ultra'
  const deveMostrarAnuncio = mostrarAnuncio && !planoPago

  const statusConversa = useMemo(() => {
    if (!mensagens.length) return 'Aguardando primeira mensagem'
    const ultima = mensagens[mensagens.length - 1]
    const quem = String(ultima?.userId || '') === String(meuId || '') ? 'Você' : safeName(ultima?.autor, outroNome)
    return `${quem} · ${formatarHoraMensagem(ultima?.hora || ultima?.criadoEm)}`
  }, [mensagens, meuId, outroNome])

  useEffect(() => {
    if (!pedidoId) return

    const mensagensRef = query(ref(database, `chats/${pedidoId}`), limitToLast(80))

    const off = onValue(mensagensRef, (snap) => {
      const data = snap.val() || {}
      const lista = Object.entries(data).map(([id, item]) => ({ id, ...item }))

      lista.sort((a, b) => Number(getMsgMs(a.hora || a.criadoEm)) - Number(getMsgMs(b.hora || b.criadoEm)))
      setMensagens(lista)

      requestAnimationFrame(() => {
        try {
          if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
        } catch {}
      })
    })

    return () => off()
  }, [pedidoId])

  useEffect(() => {
    if (!pedidoId || !meuId) return
    update(ref(database, `conversas/${meuId}/${pedidoId}`), {
      unread: false,
      abertoEm: Date.now(),
    }).catch(() => {})
  }, [pedidoId, meuId])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      try {
        mediaRef.current?.stream?.getTracks?.().forEach((track) => track.stop())
      } catch {}
    }
  }, [])

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

  async function registrarMensagem({ texto: textoMsg = '', audio = null, duracao = 0 }) {
    if (!pedidoId || !meuId) return

    const agora = Date.now()
    const preview = textoMsg || (audio ? `Áudio de ${formatarTempo(duracao)}` : 'Nova mensagem')
    const payload = {
      texto: textoMsg || '',
      audio: audio || null,
      duracao: audio ? duracao : null,
      autor: nomeMeu,
      autorNome: nomeMeu,
      userId: meuId,
      hora: agora,
      criadoEm: agora,
      criadoEmServer: serverTimestamp(),
    }

    await push(ref(database, `chats/${pedidoId}`), payload)

    const baseConversa = {
      pedidoId,
      titulo: pedidoTitulo || 'Corre aqui',
      lastText: preview,
      mensagemPreview: preview,
      lastAt: agora,
      updatedAt: agora,
      lastById: meuId,
      lastByNome: nomeMeu,
      status: 'ativa',
    }

    await update(ref(database, `conversas/${meuId}/${pedidoId}`), {
      ...baseConversa,
      outroId,
      outroNome,
      unread: false,
    }).catch(() => {})

    if (outroId) {
      await update(ref(database, `conversas/${outroId}/${pedidoId}`), {
        ...baseConversa,
        outroId: meuId,
        outroNome: nomeMeu,
        unread: true,
      }).catch(() => {})

      await update(ref(database, `notificacoes/${outroId}/notif_${agora}`), {
        tipo: 'mensagem_chat',
        pedidoId,
        conversaId: pedidoId,
        titulo: `Nova mensagem de ${nomeMeu}`,
        mensagem: preview,
        lida: false,
        criadoEm: agora,
        autor: { id: meuId, nome: nomeMeu },
      }).catch(() => {})
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
        if (e.data?.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.start()
      setGravando(true)
      iniciarTimer()
    } catch (error) {
      console.error('Erro ao iniciar gravação:', error)
      onToast?.({ type: 'error', title: 'Microfone indisponível', message: 'Não foi possível acessar o microfone.' })
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
            await registrarMensagem({ audio: reader.result, duracao: duracaoAtual })
          } catch (error) {
            console.error('Erro ao salvar áudio:', error)
            onToast?.({ type: 'error', title: 'Falha no áudio', message: 'Não consegui enviar o áudio.' })
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

  const enviar = async (textoDireto = '') => {
    const t = String(textoDireto || texto).trim()
    if (!t || !pedidoId || enviando || gravando) return

    try {
      setEnviando(true)
      await registrarMensagem({ texto: t })
      setTexto('')
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error)
      onToast?.({ type: 'error', title: 'Falha ao enviar', message: 'Tente novamente em instantes.' })
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

  const fecharChat = () => {
    try {
      onClose?.()
    } catch {}
    setFechado(true)
  }

  useEffect(() => {
    setFechado(false)
  }, [pedidoId])

  if (fechado) return null

  return (
    <div className="relative z-[9999] flex h-[min(78vh,720px)] w-full max-w-[780px] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#07111f] shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
      <div className="border-b border-white/10 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-300">Conversa do pedido</div>
            <div className="mt-1 truncate text-lg font-black text-white">{pedidoTitulo}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>Você: <b className="text-slate-200">{nomeMeu}</b></span>
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <span>Outro: <b className="text-slate-200">{outroNome}</b></span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-black text-slate-200">
              {mensagens.length} msg
            </div>
            <button
              type="button"
              onClick={fecharChat}
              aria-label="Fechar conversa"
              className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-xl font-black text-white transition hover:bg-white/[0.12] active:scale-95"
            >
              ×
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-100">
            100% do valor combinado fica com quem faz o serviço
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-slate-300">
            {statusConversa}
          </div>
        </div>
      </div>

      {deveMostrarAnuncio ? (
        <div className="border-b border-white/10 bg-slate-950 px-4 py-2">
          <div className="rounded-2xl border border-yellow-400/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-100">
            Espaço para anúncio leve em breve.
          </div>
        </div>
      ) : null}

      <div ref={chatRef} className="min-h-0 flex-1 overflow-y-auto bg-[#02091a] px-4 py-4">
        {mensagens.length === 0 ? (
          <div className="grid h-full min-h-[260px] place-items-center text-center">
            <div className="max-w-sm">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-2xl">
                💬
              </div>
              <div className="mt-4 text-lg font-black text-white">Combine tudo por aqui</div>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Horário, endereço, valor final e qualquer detalhe do serviço ficam registrados na conversa.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {mensagens.map((msg, index) => {
              const minha =
                (msg.userId && meuId && String(msg.userId) === String(meuId)) ||
                (!msg.userId && msg.autor && meuNome && String(msg.autor) === String(meuNome))
              const sistema = msg.sistema || msg.autorId === 'sistema'
              const hora = formatarHoraMensagem(msg.hora || msg.criadoEm || msg.createdAt)

              if (sistema) {
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex justify-center"
                  >
                    <div className="max-w-[88%] rounded-full border border-cyan-300/15 bg-cyan-400/10 px-3 py-1.5 text-center text-xs font-bold text-cyan-100">
                      {msg.texto || 'Atualização do pedido'}
                    </div>
                  </motion.div>
                )
              }

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.22, delay: Math.min(index * 0.018, 0.14), ease: 'easeOut' }}
                  className={`flex ${minha ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[82%] ${minha ? 'text-right' : 'text-left'}`}>
                    <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {minha ? 'Você' : safeName(msg.autor, outroNome)}
                    </div>
                    <div
                      className={[
                        'rounded-[22px] px-3.5 py-2.5 shadow-[0_12px_34px_rgba(0,0,0,0.22)]',
                        minha
                          ? 'rounded-br-md bg-blue-600 text-white'
                          : 'rounded-bl-md border border-white/10 bg-slate-800 text-white',
                      ].join(' ')}
                    >
                      {msg.texto ? (
                        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{msg.texto}</div>
                      ) : null}

                      {msg.audio ? (
                        <div className="mt-1 rounded-2xl bg-black/20 p-2">
                          <audio controls className="w-full">
                            <source src={msg.audio} type="audio/webm" />
                          </audio>
                          {msg.duracao ? (
                            <div className="mt-1 text-[11px] text-white/70">Áudio · {formatarTempo(msg.duracao)}</div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-1 text-[10px] text-white/65">{hora}</div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      <div className="border-t border-white/10 bg-slate-950/95 px-4 py-3">
        {!gravando ? (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => enviar(s)}
                disabled={enviando}
                className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-white/[0.09] disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

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
            className={`grid h-14 w-14 place-items-center rounded-2xl text-xl text-white transition ${
              gravando ? 'scale-105 bg-red-600 shadow-[0_0_34px_rgba(220,38,38,0.35)]' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
            title="Segure para gravar"
          >
            🎤
          </button>

          <div className="min-w-0 flex-1">
            {gravando ? (
              <div className="flex h-14 items-center rounded-2xl border border-red-500/30 bg-red-500/10 px-4 font-mono text-red-200">
                Gravando... {formatarTempo(tempo)}
              </div>
            ) : (
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Digite uma mensagem sobre o serviço..."
                rows={1}
                className="h-14 min-h-14 w-full max-h-32 resize-none rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500/40"
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => enviar()}
            disabled={enviando || !texto.trim() || gravando}
            className="h-14 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enviando ? '...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}
