'use client'

import { useEffect, useRef, useState } from 'react'
import { database } from '@/lib/firebase'
import { enviarPushParaUsuario } from '@/lib/pushSender'
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

const LIMITE_TEXTO = 700
const LIMITE_FALLBACK_DATABASE_BYTES = 900 * 1024
const ACCEPT_ANEXOS = 'image/*,.pdf,.doc,.docx,.txt,.zip'

function IconBack(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M15 5 8 12l7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconClose(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function IconPhone(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M8.2 5.2 9.6 8c.4.8.2 1.7-.4 2.3l-1 1c1.1 2.2 2.8 3.9 5 5l1-1c.6-.6 1.5-.8 2.3-.4l2.8 1.4c.8.4 1.2 1.2 1.1 2.1l-.3 1.7c-.1.7-.7 1.2-1.4 1.2C9.7 21.3 2.7 14.3 2.7 5.3c0-.7.5-1.3 1.2-1.4l1.7-.3c.9-.1 1.7.3 2.1 1.1Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconMore(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  )
}

function IconMic(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 14.5a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5.5a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="2" />
      <path d="M5.8 11.5a6.2 6.2 0 0 0 12.4 0M12 17.7V21M8.8 21h6.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconStop(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  )
}

function IconCheck(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m5 12.5 4 4L19.5 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function formatarTamanho(bytes) {
  const n = Number(bytes || 0)
  if (!n) return ''
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(n > 10 * 1024 * 1024 ? 0 : 1)} MB`
}

function limparNomeArquivo(nome) {
  return String(nome || 'arquivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

function tipoAnexoPorArquivo(file, fallback = 'arquivo') {
  const mime = String(file?.type || '').toLowerCase()
  if (mime.startsWith('image/')) return 'imagem'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return fallback
}

function previewAnexo(anexo, duracao = 0) {
  if (!anexo) return ''
  if (anexo.tipo === 'imagem') return '📷 Imagem'
  if (anexo.tipo === 'video') return '🎥 Vídeo'
  if (anexo.tipo === 'audio') return `🎤 Áudio${duracao ? ` de ${formatarTempo(duracao)}` : ''}`
  return `📎 ${anexo.nome || 'Arquivo'}`
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function MensagemAnexo({ anexo, audioLegacy, duracao }) {
  const item = anexo || (audioLegacy ? { tipo: 'audio', url: audioLegacy, mime: 'audio/webm', nome: 'Áudio' } : null)
  if (!item?.url) return null

  if (item.tipo === 'imagem') {
    return (
      <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-2xl bg-black/20">
        <div
          className="aspect-[4/3] w-full bg-slate-900 bg-cover bg-center"
          style={{ backgroundImage: `url(${JSON.stringify(item.url)})` }}
          aria-label={item.nome || 'Imagem enviada'}
        />
        <div className="px-3 py-2 text-[11px] font-bold text-white/75">
          {item.nome || 'Imagem'} {item.tamanho ? `· ${formatarTamanho(item.tamanho)}` : ''}
        </div>
      </a>
    )
  }

  if (item.tipo === 'video') {
    return (
      <div className="mt-2 overflow-hidden rounded-2xl bg-black/20">
        <video controls playsInline className="max-h-72 w-full bg-black">
          <source src={item.url} type={item.mime || 'video/mp4'} />
        </video>
        <div className="px-3 py-2 text-[11px] font-bold text-white/75">
          {item.nome || 'Vídeo'} {item.tamanho ? `· ${formatarTamanho(item.tamanho)}` : ''}
        </div>
      </div>
    )
  }

  if (item.tipo === 'audio') {
    return (
      <div className="mt-2 rounded-2xl bg-black/20 p-2">
        <audio controls className="w-full" src={item.url} />
        {duracao ? (
          <div className="mt-1 text-[11px] text-white/70">Áudio · {formatarTempo(duracao)}</div>
        ) : null}
      </div>
    )
  }

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-left transition hover:bg-black/30"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-xl">📎</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-white">{item.nome || 'Arquivo'}</span>
        <span className="block text-[11px] font-bold text-white/60">
          {item.tamanho ? formatarTamanho(item.tamanho) : 'Abrir arquivo'}
        </span>
      </span>
    </a>
  )
}

export default function ChatMensagens({
  pedidoId,
  meuId,
  meuNome,
  pedidoTitulo = 'Corre aqui',
  outroUser,
  onClose,
  onToast,
  modoPagina = false,
}) {
  const [mensagens, setMensagens] = useState([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [anexando, setAnexando] = useState(false)
  const [anexoSelecionado, setAnexoSelecionado] = useState(null)
  const [gravando, setGravando] = useState(false)
  const [tempo, setTempo] = useState(0)
  const [fechado, setFechado] = useState(false)

  const mediaRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const pararQuandoIniciarRef = useRef(false)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const chatRef = useRef(null)
  const cameraInputRef = useRef(null)
  const arquivoInputRef = useRef(null)

  const outroId = outroUser?.id || null
  const outroNome = safeName(outroUser?.nome)
  const nomeMeu = safeName(meuNome, 'Você')
  const deveMostrarAnuncio = false
  const statusConversa = (() => {
    if (!mensagens.length) return 'Aguardando primeira mensagem'
    const ultima = mensagens[mensagens.length - 1]
    const quem = String(ultima?.userId || '') === String(meuId || '') ? 'Você' : safeName(ultima?.autor, outroNome)
    return `${quem} · ${formatarHoraMensagem(ultima?.hora || ultima?.criadoEm)}`
  })()

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
        mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop())
      } catch {}
    }
  }, [])

  useEffect(() => {
    return () => {
      if (anexoSelecionado?.previewUrl) URL.revokeObjectURL(anexoSelecionado.previewUrl)
    }
  }, [anexoSelecionado?.previewUrl])

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

  function limparAnexoSelecionado() {
    if (anexoSelecionado?.previewUrl) URL.revokeObjectURL(anexoSelecionado.previewUrl)
    setAnexoSelecionado(null)
  }

  function selecionarArquivo(event, tipoForcado = '') {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (file.size > LIMITE_FALLBACK_DATABASE_BYTES) {
      onToast?.({
        type: 'error',
        title: 'Arquivo grande demais',
        message: `No MVP, envie anexos leves de ate ${formatarTamanho(LIMITE_FALLBACK_DATABASE_BYTES)}.`,
      })
      return
    }

    const tipo = tipoForcado || tipoAnexoPorArquivo(file)
    const previewUrl = tipo === 'imagem' || tipo === 'video' ? URL.createObjectURL(file) : ''
    limparAnexoSelecionado()
    setAnexoSelecionado({
      file,
      tipo,
      previewUrl,
      nome: file.name || (tipo === 'imagem' ? 'foto.jpg' : 'arquivo'),
      mime: file.type || 'application/octet-stream',
      tamanho: file.size || 0,
    })
  }

  async function subirArquivoChat(file, tipoForcado = '') {
    if (!file || !pedidoId || !meuId) return null
    if (file.size > LIMITE_FALLBACK_DATABASE_BYTES) {
      throw new Error('arquivo_grande')
    }

    const tipo = tipoForcado || tipoAnexoPorArquivo(file)
    const agora = Date.now()
    const nomeSeguro = limparNomeArquivo(file.name || `${tipo}-${agora}`)
    const url = await fileToDataUrl(file)

    return {
      tipo,
      url,
      nome: file.name || nomeSeguro,
      mime: file.type || 'application/octet-stream',
      tamanho: file.size || 0,
      path: '',
      storage: 'database_mvp',
    }
  }

  async function registrarMensagem({ texto: textoMsg = '', audio = null, anexo = null, duracao = 0 }) {
    if (!pedidoId || !meuId) return

    const agora = Date.now()
    const preview = (textoMsg || previewAnexo(anexo, duracao) || (audio ? `Áudio de ${formatarTempo(duracao)}` : 'Nova mensagem')).slice(0, 140)
    const payload = {
      tipo: anexo?.tipo || (audio ? 'audio' : 'texto'),
      texto: textoMsg || '',
      anexo: anexo || null,
      audio: audio || (anexo?.tipo === 'audio' ? anexo.url : null),
      duracao: audio || anexo?.tipo === 'audio' ? duracao : null,
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
        prioridade: 'normal',
        acao: 'abrir_chat',
        lida: false,
        criadoEm: agora,
        autor: { id: meuId, nome: nomeMeu },
      }).catch(() => {})

      enviarPushParaUsuario(outroId, {
        tipo: 'mensagem_chat',
        pedidoId,
        conversaId: pedidoId,
        titulo: `Nova mensagem de ${nomeMeu}`,
        mensagem: preview,
        prioridade: 'normal',
        acao: 'abrir_chat',
      })
    }
  }

  async function iniciarGravacao() {
    if (!pedidoId || gravando || anexando || mediaRef.current) return

    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        onToast?.({
          type: 'error',
          title: 'Áudio indisponível',
          message: 'Este navegador não liberou gravação de áudio aqui.',
        })
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(type)
      )
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

      mediaRef.current = mediaRecorder
      mediaStreamRef.current = stream
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.start()
      setGravando(true)
      iniciarTimer()

      if (pararQuandoIniciarRef.current) {
        setTimeout(() => pararGravacao(), 120)
      }
    } catch (error) {
      console.warn('Erro ao iniciar gravação:', error)
      onToast?.({ type: 'error', title: 'Microfone indisponível', message: 'Não foi possível acessar o microfone.' })
    }
  }

  function solicitarParadaGravacao() {
    if (mediaRef.current && mediaRef.current.state !== 'inactive') {
      pararGravacao()
      return
    }

    pararQuandoIniciarRef.current = true
  }

  function pararGravacao() {
    if (!mediaRef.current || mediaRef.current.state === 'inactive') return

    const duracaoAtual = Math.max(tempo, 1)
    pararTimer()

    mediaRef.current.onstop = async () => {
      try {
        setAnexando(true)
        const mime = mediaRef.current?.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mime })

        if (!blob.size) {
          setGravando(false)
          return
        }

        const extensao = mime.includes('mp4') ? 'm4a' : 'webm'
        const file = new File([blob], `audio-${Date.now()}.${extensao}`, { type: mime })
        const anexo = await subirArquivoChat(file, 'audio')
        await registrarMensagem({ anexo, duracao: duracaoAtual })
      } catch (error) {
        console.warn('Erro ao salvar áudio:', error)
        onToast?.({
          type: 'error',
          title: 'Falha no audio',
          message: 'O envio de audio ainda nao esta estavel no MVP.',
        })
      } finally {
        try {
          mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop())
        } catch {}
        mediaRef.current = null
        mediaStreamRef.current = null
        pararQuandoIniciarRef.current = false
        chunksRef.current = []
        setAnexando(false)
        setGravando(false)
        setTempo(0)
      }
    }

    mediaRef.current.stop()
  }

  const enviar = async (textoDireto = '') => {
    const t = String(textoDireto || texto).trim()
    const arquivo = anexoSelecionado?.file
    if ((!t && !arquivo) || !pedidoId || enviando || gravando || anexando) return

    try {
      setEnviando(true)
      let anexo = null
      if (arquivo) {
        setAnexando(true)
        anexo = await subirArquivoChat(arquivo, anexoSelecionado?.tipo)
      }

      await registrarMensagem({ texto: t, anexo })
      setTexto('')
      limparAnexoSelecionado()
    } catch (error) {
      console.warn('Erro ao enviar mensagem:', error)
      const grande = error?.message === 'arquivo_grande'
      onToast?.({
        type: 'error',
        title: grande ? 'Arquivo grande demais' : 'Falha ao enviar',
        message: grande
          ? `No MVP, envie anexos leves de ate ${formatarTamanho(LIMITE_FALLBACK_DATABASE_BYTES)}.`
          : 'Tente novamente em instantes.',
      })
    } finally {
      setEnviando(false)
      setAnexando(false)
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

  const outroFoto = outroUser?.fotoURL || outroUser?.photoURL || ''
  const outroInicial = safeName(outroNome, 'C').slice(0, 1).toUpperCase()
  const podeEnviarMensagem = Boolean(texto.trim() || anexoSelecionado)
  const containerClass = modoPagina
    ? 'fixed inset-0 z-[100000] flex h-[100svh] min-h-0 w-screen flex-col overflow-hidden bg-[#050b12] text-white supports-[height:100dvh]:h-[100dvh]'
    : 'relative z-[9999] flex h-[min(86dvh,760px)] max-h-[calc(100dvh-1rem)] w-full max-w-[780px] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#050b12] text-white shadow-[0_30px_100px_rgba(0,0,0,0.45)] sm:rounded-[30px]'

  return (
    <div className={containerClass}>
      <div className="shrink-0 border-b border-white/10 bg-[#07111f]/95 px-2.5 py-2 shadow-[0_18px_45px_rgba(0,0,0,0.22)] backdrop-blur sm:px-4 sm:py-3">
        <div className="flex h-12 items-center gap-2 sm:h-14 sm:gap-3">
          <button
            type="button"
            onClick={fecharChat}
            aria-label={modoPagina ? 'Voltar' : 'Fechar conversa'}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/[0.08] active:scale-95"
          >
            {modoPagina ? <IconBack className="h-6 w-6" /> : <IconClose className="h-5 w-5" />}
          </button>

          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-blue-500 to-emerald-400 shadow-[0_10px_26px_rgba(14,165,233,0.22)] sm:h-11 sm:w-11">
            {outroFoto ? (
              <div
                className="h-full w-full bg-cover bg-center"
                style={{ backgroundImage: `url(${JSON.stringify(outroFoto)})` }}
                aria-hidden="true"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-sm font-black text-white sm:text-base">{outroInicial}</div>
            )}
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#07111f] bg-emerald-400" />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-black text-white sm:text-base">{outroNome}</div>
            <div className="mt-0.5 hidden flex-wrap items-center gap-1.5 text-[10px] text-slate-400 sm:text-xs">
              <span>Você: <b className="text-slate-200">{nomeMeu}</b></span>
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <span>Outro: <b className="text-slate-200">{outroNome}</b></span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <div className="hidden rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-black text-slate-200 sm:px-3 sm:py-1.5 sm:text-xs">
              {mensagens.length} msg
            </div>
            <button
              type="button"
              onClick={fecharChat}
              aria-label={modoPagina ? 'Voltar' : 'Fechar conversa'}
              className="hidden h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-base font-black text-white transition hover:bg-white/[0.12] active:scale-95 sm:h-10 sm:w-10 sm:rounded-2xl sm:text-xl"
            >
              {modoPagina ? '←' : '×'}
            </button>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full text-slate-200 transition hover:bg-white/[0.08] active:scale-95"
              aria-label="Ligar"
            >
              <IconPhone className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full text-slate-200 transition hover:bg-white/[0.08] active:scale-95"
              aria-label="Mais opcoes"
            >
              <IconMore className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="hidden mt-2 gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:gap-2">
          <div className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-100 sm:px-3 sm:py-1.5 sm:text-xs">
            100% do valor combinado fica com quem faz o serviço
          </div>
          <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-bold text-slate-300 sm:px-3 sm:py-1.5 sm:text-xs">
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

      <div
        ref={chatRef}
        className="min-h-0 flex-1 overscroll-contain overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.16),transparent_30%),linear-gradient(180deg,#050b12_0%,#06111f_100%)] px-3 py-3 sm:px-5 sm:py-5"
      >
        {mensagens.length === 0 ? (
          <div className="grid h-full min-h-[150px] place-items-center text-center sm:min-h-[240px]">
            <div className="max-w-xs sm:max-w-sm">
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-xl sm:h-14 sm:w-14 sm:text-2xl">
                💬
              </div>
              <div className="mt-2 text-base font-black text-white sm:mt-4 sm:text-lg">Combine tudo por aqui</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400 sm:mt-2 sm:text-sm">
                Horário, endereço, valor final e qualquer detalhe do serviço ficam registrados na conversa.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
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
                    <div className="max-w-[90%] rounded-full border border-cyan-300/15 bg-cyan-400/10 px-2.5 py-1 text-center text-[11px] font-bold text-cyan-100 sm:px-3 sm:py-1.5 sm:text-xs">
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
                  <div className={`max-w-[84%] sm:max-w-[72%] ${minha ? 'text-right' : 'text-left'}`}>
                    <div className="hidden mb-0.5 px-1 text-[9px] font-bold uppercase tracking-wide text-slate-500 sm:mb-1 sm:text-[10px]">
                      {minha ? 'Você' : safeName(msg.autor, outroNome)}
                    </div>
                    <div
                      className={[
                        'rounded-[18px] px-3 py-2 shadow-[0_10px_28px_rgba(0,0,0,0.18)] sm:rounded-[20px] sm:px-3.5 sm:py-2.5',
                        minha
                          ? 'rounded-br-md bg-[#1d4ed8] text-white'
                          : 'rounded-bl-md border border-white/10 bg-[#172032] text-white',
                      ].join(' ')}
                    >
                      {msg.texto ? (
                        <div className="whitespace-pre-wrap break-words text-[14px] leading-snug sm:text-[15px] sm:leading-relaxed">{msg.texto}</div>
                      ) : null}

                      <MensagemAnexo anexo={msg.anexo} audioLegacy={msg.audio} duracao={msg.duracao} />

                      <div className={`mt-1 flex items-center gap-1 text-[10px] text-white/60 ${minha ? 'justify-end' : 'justify-start'}`}>
                        <span>{hora}</span>
                        {minha ? <IconCheck className="h-3.5 w-3.5 text-cyan-200" /> : null}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#07111f]/95 px-2.5 py-2 pb-[max(0.65rem,env(safe-area-inset-bottom))] shadow-[0_-18px_45px_rgba(0,0,0,0.22)] sm:px-4 sm:py-3">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => selecionarArquivo(e, 'imagem')}
        />
        <input
          ref={arquivoInputRef}
          type="file"
          accept={ACCEPT_ANEXOS}
          className="hidden"
          onChange={(e) => selecionarArquivo(e)}
        />

        {!gravando && !modoPagina ? (
          <div className="mb-1.5 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mb-2 sm:gap-2">
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => enviar(s)}
                disabled={enviando || anexando || !!anexoSelecionado}
                className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-bold text-slate-200 transition hover:bg-white/[0.09] disabled:opacity-50 sm:px-3 sm:py-1.5 sm:text-xs"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        {anexoSelecionado ? (
          <div className="mb-1.5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] sm:mb-2">
            <div className="flex items-center gap-2 p-2 sm:gap-3 sm:p-2.5">
              {anexoSelecionado.tipo === 'imagem' ? (
                <div
                  className="h-11 w-11 shrink-0 rounded-xl bg-slate-900 bg-cover bg-center sm:h-14 sm:w-14"
                  style={{ backgroundImage: `url(${JSON.stringify(anexoSelecionado.previewUrl)})` }}
                  aria-label={anexoSelecionado.nome}
                />
              ) : anexoSelecionado.tipo === 'video' ? (
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-lg sm:h-14 sm:w-14 sm:text-xl">🎥</div>
              ) : anexoSelecionado.tipo === 'audio' ? (
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-600 text-lg sm:h-14 sm:w-14 sm:text-xl">🎤</div>
              ) : (
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-800 text-lg sm:h-14 sm:w-14 sm:text-xl">📎</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-black text-white sm:text-sm">{anexoSelecionado.nome}</div>
                <div className="mt-0.5 text-[11px] font-semibold text-slate-400 sm:text-xs">
                  {previewAnexo(anexoSelecionado)} {anexoSelecionado.tamanho ? `· ${formatarTamanho(anexoSelecionado.tamanho)}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={limparAnexoSelecionado}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.08] text-base font-black text-white hover:bg-white/[0.14] sm:h-10 sm:w-10 sm:rounded-2xl sm:text-lg"
                aria-label="Remover anexo"
              >
                ×
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex items-end gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={gravando ? solicitarParadaGravacao : iniciarGravacao}
            disabled={!pedidoId || enviando || anexando}
            className={[
              'grid h-10 w-10 shrink-0 place-items-center rounded-full border text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:h-12 sm:w-12',
              gravando
                ? 'border-red-400/40 bg-red-500/20 text-red-100'
                : 'border-white/10 bg-white/[0.07] hover:bg-white/[0.12]',
            ].join(' ')}
            title={gravando ? 'Parar audio' : 'Gravar audio'}
            aria-label={gravando ? 'Parar audio' : 'Gravar audio'}
          >
            {gravando ? <IconStop className="h-5 w-5" /> : <IconMic className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={!pedidoId || enviando || anexando || gravando}
            className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.07] text-[0px] text-white transition hover:bg-white/[0.12] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 before:absolute before:text-[18px] before:content-['📷'] sm:h-12 sm:w-12 sm:rounded-2xl"
            title="Abrir câmera"
            aria-label="Abrir câmera"
          >
            📷
          </button>

          <button
            type="button"
            onClick={() => arquivoInputRef.current?.click()}
            disabled={!pedidoId || enviando || anexando || gravando}
            className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.07] text-[0px] text-white transition hover:bg-white/[0.12] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 before:absolute before:text-[18px] before:content-['📎'] sm:h-12 sm:w-12 sm:rounded-2xl"
            title="Anexar arquivo"
            aria-label="Anexar arquivo"
          >
            📎
          </button>


          <div className="min-w-0 flex-1">
            {gravando ? (
              <div className="flex h-9 items-center rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-xs font-mono text-red-200 sm:h-12 sm:rounded-2xl sm:px-4 sm:text-base">
                Gravando... {formatarTempo(tempo)}
              </div>
            ) : (
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value.slice(0, LIMITE_TEXTO))}
                onKeyDown={onKeyDown}
                placeholder={anexoSelecionado ? 'Adicionar legenda...' : 'Digite uma mensagem sobre o serviço...'}
                rows={1}
                className="h-10 min-h-10 w-full max-h-28 resize-none rounded-[22px] border border-white/10 bg-white/[0.08] px-3.5 py-2.5 text-[14px] text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500/40 sm:h-12 sm:min-h-12 sm:rounded-[26px] sm:px-4 sm:py-3 sm:text-sm"
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => enviar()}
            disabled={enviando || anexando || (!texto.trim() && !anexoSelecionado) || gravando}
            className="grid h-10 min-w-10 place-items-center rounded-full bg-blue-600 px-3 text-xs font-black text-white shadow-[0_10px_28px_rgba(37,99,235,0.35)] transition hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:h-12 sm:min-w-16 sm:px-4 sm:text-sm"
          >
            {enviando || anexando ? (
              '...'
            ) : (
              <>
                <span className="sm:hidden">➤</span>
                <span className="hidden sm:inline">Enviar</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
