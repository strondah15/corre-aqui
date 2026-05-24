'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { database, storage } from '@/lib/firebase'
import { enviarPushParaUsuario } from '@/lib/pushSender'
import { ref, push, onValue, query, limitToLast, update, serverTimestamp } from 'firebase/database'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
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
const LIMITE_ARQUIVO_BYTES = 12 * 1024 * 1024
const LIMITE_FALLBACK_DATABASE_BYTES = 900 * 1024
const ACCEPT_ANEXOS = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip'

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

function isStorageRetryError(error) {
  const code = String(error?.code || '')
  const message = String(error?.message || '')
  return code.includes('storage/retry-limit-exceeded') || message.includes('storage/retry-limit-exceeded')
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function uploadComTimeout(refArquivo, file, metadata, ms = 12_000) {
  return new Promise((resolve, reject) => {
    let settled = false
    const task = uploadBytesResumable(refArquivo, file, metadata)

    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(value)
    }

    const timer = setTimeout(() => {
      const error = new Error('storage_timeout')
      error.code = 'storage/retry-limit-exceeded'
      try {
        task.cancel()
      } catch {}
      finish(reject, error)
    }, ms)

    task.on(
      'state_changed',
      null,
      (error) => finish(reject, error),
      () => finish(resolve, task.snapshot)
    )
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
  planoAtual = 'free',
  mostrarAnuncio = false,
  onClose,
  onToast,
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

    if (file.size > LIMITE_ARQUIVO_BYTES) {
      onToast?.({
        type: 'error',
        title: 'Arquivo grande demais',
        message: `Envie arquivos de até ${formatarTamanho(LIMITE_ARQUIVO_BYTES)}.`,
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
    if (file.size > LIMITE_ARQUIVO_BYTES) {
      throw new Error('arquivo_grande')
    }

    const tipo = tipoForcado || tipoAnexoPorArquivo(file)
    const agora = Date.now()
    const nomeSeguro = limparNomeArquivo(file.name || `${tipo}-${agora}`)
    const caminho = `chatAnexos/${pedidoId}/${meuId}_${agora}_${nomeSeguro}`
    const refArquivo = storageRef(storage, caminho)

    try {
      await uploadComTimeout(refArquivo, file, {
        contentType: file.type || 'application/octet-stream',
        customMetadata: {
          pedidoId: String(pedidoId),
          userId: String(meuId),
          tipo,
        },
      })

      const url = await getDownloadURL(refArquivo)
      return {
        tipo,
        url,
        nome: file.name || nomeSeguro,
        mime: file.type || 'application/octet-stream',
        tamanho: file.size || 0,
        path: caminho,
        storage: 'firebase',
      }
    } catch (error) {
      if (!isStorageRetryError(error) || file.size > LIMITE_FALLBACK_DATABASE_BYTES) {
        throw error
      }

      const url = await fileToDataUrl(file)
      onToast?.({
        type: 'info',
        title: 'Enviado em modo leve',
        message: 'O Storage não respondeu agora; salvei essa mídia pequena direto na conversa.',
      })
      return {
        tipo,
        url,
        nome: file.name || nomeSeguro,
        mime: file.type || 'application/octet-stream',
        tamanho: file.size || 0,
        path: '',
        storage: 'database_fallback',
      }
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
        const retryStorage = isStorageRetryError(error)
        onToast?.({
          type: 'error',
          title: retryStorage ? 'Storage indisponível' : 'Falha no áudio',
          message: retryStorage
            ? 'Ative o Firebase Storage e publique as regras. Áudios maiores dependem dele.'
            : 'Não consegui enviar o áudio.',
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
      const retryStorage = isStorageRetryError(error)
      onToast?.({
        type: 'error',
        title: grande ? 'Arquivo grande demais' : retryStorage ? 'Storage indisponível' : 'Falha ao enviar',
        message: grande
          ? `Envie arquivos de até ${formatarTamanho(LIMITE_ARQUIVO_BYTES)}.`
          : retryStorage
            ? 'Ative o Firebase Storage e publique as regras. Arquivos maiores dependem dele.'
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

  return (
    <div className="relative z-[9999] flex h-[min(82dvh,720px)] max-h-[calc(100dvh-1rem)] w-full max-w-[780px] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#07111f] shadow-[0_30px_100px_rgba(0,0,0,0.45)] sm:rounded-[30px]">
      <div className="border-b border-white/10 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-3 py-3 sm:px-4 sm:py-4">
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

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <div className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-black text-slate-200 sm:px-3 sm:py-1.5 sm:text-xs">
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

      <div ref={chatRef} className="min-h-0 flex-1 overflow-y-auto bg-[#02091a] px-3 py-3 sm:px-4 sm:py-4">
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
                  <div className={`max-w-[90%] sm:max-w-[82%] ${minha ? 'text-right' : 'text-left'}`}>
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

                      <MensagemAnexo anexo={msg.anexo} audioLegacy={msg.audio} duracao={msg.duracao} />

                      <div className="mt-1 text-[10px] text-white/65">{hora}</div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      <div className="border-t border-white/10 bg-slate-950/95 px-3 py-3 sm:px-4">
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

        {!gravando ? (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => enviar(s)}
                disabled={enviando || anexando || !!anexoSelecionado}
                className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-white/[0.09] disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        {anexoSelecionado ? (
          <div className="mb-2 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06]">
            <div className="flex items-center gap-3 p-2.5">
              {anexoSelecionado.tipo === 'imagem' ? (
                <div
                  className="h-14 w-14 shrink-0 rounded-xl bg-slate-900 bg-cover bg-center"
                  style={{ backgroundImage: `url(${JSON.stringify(anexoSelecionado.previewUrl)})` }}
                  aria-label={anexoSelecionado.nome}
                />
              ) : anexoSelecionado.tipo === 'video' ? (
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-slate-900 text-xl">🎥</div>
              ) : anexoSelecionado.tipo === 'audio' ? (
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-emerald-600 text-xl">🎤</div>
              ) : (
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-slate-800 text-xl">📎</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-black text-white">{anexoSelecionado.nome}</div>
                <div className="mt-0.5 text-xs font-semibold text-slate-400">
                  {previewAnexo(anexoSelecionado)} {anexoSelecionado.tamanho ? `· ${formatarTamanho(anexoSelecionado.tamanho)}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={limparAnexoSelecionado}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.08] text-lg font-black text-white hover:bg-white/[0.14]"
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
            onClick={() => cameraInputRef.current?.click()}
            disabled={!pedidoId || enviando || anexando || gravando}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.07] text-base text-white transition hover:bg-white/[0.12] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:h-14 sm:w-14 sm:rounded-2xl sm:text-lg"
            title="Abrir câmera"
            aria-label="Abrir câmera"
          >
            📷
          </button>

          <button
            type="button"
            onClick={() => arquivoInputRef.current?.click()}
            disabled={!pedidoId || enviando || anexando || gravando}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.07] text-base text-white transition hover:bg-white/[0.12] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:h-14 sm:w-14 sm:rounded-2xl sm:text-lg"
            title="Anexar arquivo"
            aria-label="Anexar arquivo"
          >
            📎
          </button>

          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault()
              pararQuandoIniciarRef.current = false
              iniciarGravacao()
            }}
            onPointerUp={solicitarParadaGravacao}
            onPointerCancel={solicitarParadaGravacao}
            onPointerLeave={solicitarParadaGravacao}
            onContextMenu={(e) => e.preventDefault()}
            disabled={!pedidoId || enviando || anexando}
            className={`grid h-10 w-10 shrink-0 touch-none select-none place-items-center rounded-xl text-base text-white transition sm:h-14 sm:w-14 sm:rounded-2xl sm:text-xl ${
              gravando ? 'scale-105 bg-red-600 shadow-[0_0_34px_rgba(220,38,38,0.35)]' : 'bg-emerald-600 hover:bg-emerald-500'
            } disabled:cursor-not-allowed disabled:opacity-50`}
            title="Segure para gravar"
          >
            🎤
          </button>

          <div className="min-w-0 flex-1">
            {gravando ? (
              <div className="flex h-10 items-center rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-sm font-mono text-red-200 sm:h-14 sm:rounded-2xl sm:px-4 sm:text-base">
                Gravando... {formatarTempo(tempo)}
              </div>
            ) : (
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value.slice(0, LIMITE_TEXTO))}
                onKeyDown={onKeyDown}
                placeholder={anexoSelecionado ? 'Adicionar legenda...' : 'Digite uma mensagem sobre o serviço...'}
                rows={1}
                className="h-10 min-h-10 w-full max-h-32 resize-none rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500/40 sm:h-14 sm:min-h-14 sm:rounded-2xl sm:px-4 sm:py-3"
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => enviar()}
            disabled={enviando || anexando || (!texto.trim() && !anexoSelecionado) || gravando}
            className="grid h-10 min-w-10 place-items-center rounded-xl bg-blue-600 px-3 text-sm font-black text-white transition hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:h-14 sm:min-w-20 sm:rounded-2xl sm:px-4"
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
