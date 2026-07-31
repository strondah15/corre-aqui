'use client'

import { useEffect, useRef, useState } from 'react'
import { database } from '@/lib/firebase'
import { enviarPushParaUsuario } from '@/lib/pushSender'
import { getCategoryById } from '@/constants/categories'
import { ATENDIMENTO_STATUS, normalizeAtendimentoStatus, transitionAtendimento } from '@/lib/atendimento'
import { ref, push, onValue, query, limitToLast, update, serverTimestamp, get, set } from '@/lib/firebaseDebug'
import { CONTEXTUAL_TIP_IDS } from '@/lib/tutorial/contextualTipsConfig'
import { showCorreAquiTipOnce } from '@/components/tutorial/TutorialProvider'
import { motion, useReducedMotion } from 'framer-motion'

const chatOpenTipSessionKeys = new Set()

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

function formatarUltimaPresenca(value) {
  const ms = getMsgMs(value)
  if (!ms) return 'Offline'
  const diff = Math.max(0, Date.now() - ms)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'Visto agora'
  if (min < 60) return `Visto ha ${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `Visto ha ${horas} h`
  if (horas < 48) return 'Visto ontem'
  return `Visto ha ${Math.floor(horas / 24)} d`
}

function getValorPedido(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

function formatarValorPedido(value) {
  const n = getValorPedido(value)
  if (!n) return 'Combinar valor'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarDataPedido(value) {
  const ms = getMsgMs(value)
  if (!ms) return 'Data a combinar'
  const hoje = new Date()
  const d = new Date(ms)
  const mesmoDia =
    hoje.getFullYear() === d.getFullYear() &&
    hoje.getMonth() === d.getMonth() &&
    hoje.getDate() === d.getDate()
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (mesmoDia) return `Hoje, ${hora}`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + `, ${hora}`
}

function legacyStatusAtendimentoMeta(status) {
  const s = String(status || 'aberto').toLowerCase()
  if (s === 'chegou' || s === 'em_local' || s === 'chegando') return { label: 'Chegando', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/25', step: 2 }
  if (s === 'em_atendimento' || s === 'a_caminho' || s === 'em_deslocamento') return { label: 'Em andamento', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/25', step: 1 }
  if (s === 'concluido') return { label: 'Concluído', tone: 'text-blue-200 bg-blue-500/10 border-blue-400/25', step: 3 }
  if (s === 'avaliado') return { label: 'Avaliado', tone: 'text-yellow-200 bg-yellow-400/10 border-yellow-300/25', step: 3 }
  if (s === 'aceito' || s === 'aguardando_inicio') return { label: 'Aguardando início', tone: 'text-yellow-200 bg-yellow-400/10 border-yellow-300/25', step: 0 }
  return { label: 'Aberto', tone: 'text-slate-300 bg-white/5 border-white/10', step: 0 }
}

function statusAtendimentoMeta(status) {
  const s = normalizeAtendimentoStatus(status)
  if (s === ATENDIMENTO_STATUS.CHEGOU) return { label: 'Chegou ao local', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/25', step: 2 }
  if (s === ATENDIMENTO_STATUS.EM_ANDAMENTO) return { label: 'Em andamento', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/25', step: 1 }
  if (s === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO) return { label: 'Confirmação pendente', tone: 'text-yellow-200 bg-yellow-400/10 border-yellow-300/25', step: 3 }
  if (s === ATENDIMENTO_STATUS.FINALIZADO) return { label: 'Finalizado', tone: 'text-blue-200 bg-blue-500/10 border-blue-400/25', step: 3 }
  if (s === ATENDIMENTO_STATUS.ACEITO) return { label: 'Aceito', tone: 'text-yellow-200 bg-yellow-400/10 border-yellow-300/25', step: 0 }
  if (s === ATENDIMENTO_STATUS.CANCELADO) return { label: 'Cancelado', tone: 'text-rose-200 bg-rose-500/10 border-rose-400/25', step: 0 }
  return legacyStatusAtendimentoMeta(s)
}

const TIMELINE_GUIADA = ['Aceito', 'A caminho', 'Cheguei', 'Confirmar', 'Finalizado']

const SUGESTOES = [
  { label: 'Estou a caminho', texto: 'Já estou a caminho.', icon: '🚗' },
  { label: 'Cheguei', texto: 'Cheguei ao local.', icon: '📍' },
  { label: 'Pode me atender?', texto: 'Pode me atender?', icon: '💬' },
  { label: 'Enviei foto', texto: 'Enviei uma foto do serviço.', icon: '📷' },
  { label: 'Preciso de mais tempo', texto: 'Preciso de mais tempo.', icon: '⏱' },
  { label: 'Combinar valor', texto: 'Podemos combinar o valor?', icon: '💰' },
  { label: 'Obrigado', texto: 'Obrigado!', icon: '✨' },
  { label: 'Serviço concluído', texto: 'O serviço foi concluído.', icon: '✅' },
]

function getGuidedTimelineStep(status) {
  const normalized = normalizeAtendimentoStatus(status)
  if (normalized === ATENDIMENTO_STATUS.FINALIZADO) return 4
  if (normalized === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO) return 3
  if (normalized === ATENDIMENTO_STATUS.CHEGOU) return 2
  if (normalized === ATENDIMENTO_STATUS.EM_ANDAMENTO) return 1
  if (normalized === ATENDIMENTO_STATUS.ACEITO) return 0
  return -1
}

const LIMITE_TEXTO = 700
const LIMITE_FALLBACK_DATABASE_BYTES = 900 * 1024
const ACCEPT_ANEXOS = 'image/*,.pdf,.doc,.docx,.txt,.zip'

function compactSystemChip(msg) {
  const texto = String(msg?.texto || 'Atualizacao do pedido').trim()
  const evento = String(msg?.evento || '').toLowerCase()
  const lower = texto.toLowerCase()

  if (evento.includes('chamar') || lower.includes('chamou atencao')) {
    return { icon: '✓', label: texto.replace(' na conversa.', '') }
  }

  if (lower.includes('localiza')) {
    return { icon: '📍', label: 'Localizacao enviada' }
  }

  if (lower.includes('finalizado')) {
    return { icon: '✓', label: 'Atendimento finalizado' }
  }

  if (lower.includes('iniciou') || lower.includes('iniciado')) {
    return { icon: '✓', label: 'Atendimento iniciado' }
  }

  return { icon: '✓', label: texto.length > 54 ? `${texto.slice(0, 54).trim()}...` : texto }
}

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

function IconBell(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M18 9.5a6 6 0 0 0-12 0c0 4.7-2 5.7-2 5.7h16s-2-1-2-5.7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.8 18.5a2.3 2.3 0 0 0 4.4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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

function IconPlus(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function IconSend(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m4 12 16-8-4.5 16-3.2-6.3L4 12Z" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m12.3 13.7 3.2-3.2" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  )
}

function IconSmile(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8.7 10h.1M15.2 10h.1" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M8.8 14.2c1.8 1.7 4.6 1.7 6.4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconCamera(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M8.7 7.5 10 5.8h4l1.3 1.7H18a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2.7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function IconPaperclip(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m8.5 12.5 5.8-5.8a3.3 3.3 0 0 1 4.7 4.7l-7.1 7.1a5 5 0 0 1-7.1-7.1l7.5-7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconMapPin(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="9" r="2.4" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function IconDollar(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 3v18M16.5 7.5c-.8-1-2.3-1.6-4.1-1.6-2.2 0-3.9 1.1-3.9 2.8 0 1.9 1.9 2.5 4.1 3 2.1.5 4 1.1 4 3.1 0 1.8-1.7 3-4.2 3-2 0-3.8-.7-4.8-1.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconShield(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 3.5 19 6v5.5c0 4.4-2.8 7.4-7 9-4.2-1.6-7-4.6-7-9V6l7-2.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="m8.8 12 2.1 2.1 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconChevronDown(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconCar(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m5.5 11 1.8-4h9.4l1.8 4M4 11h16v6H4v-6Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 17v2M17 17v2M4 13h3M17 13h3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

function IconTools(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M14.5 6.5a4 4 0 0 0-5-5l2.1 2.1-2.8 2.8-2.1-2.1a4 4 0 0 0 5 5l7.1 7.1a1.7 1.7 0 0 1-2.4 2.4l-7.1-7.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m8.2 13.8-4.8 4.8a1.7 1.7 0 0 0 2.4 2.4l4.8-4.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

function IconFlag(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M6 21V4m0 1h10l-1.6 3L16 11H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TimelineIcon({ index, className }) {
  if (index === 0) return <IconCheck className={className} />
  if (index === 1) return <IconCar className={className} />
  if (index === 2) return <IconMapPin className={className} />
  if (index === 3) return <IconTools className={className} />
  return <IconFlag className={className} />
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
  initialDetailsOpen = false,
}) {
  const reduzirMovimento = useReducedMotion()
  const [mensagens, setMensagens] = useState([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [anexando, setAnexando] = useState(false)
  const [anexoSelecionado, setAnexoSelecionado] = useState(null)
  const [gravando, setGravando] = useState(false)
  const [tempo, setTempo] = useState(0)
  const [chamandoAtencao, setChamandoAtencao] = useState(false)
  const [fechado, setFechado] = useState(false)
  const [pedido, setPedido] = useState(null)
  const [detalhesPedidoAberto, setDetalhesPedidoAberto] = useState(Boolean(initialDetailsOpen))
  const [avisoAtendimentoVisivel, setAvisoAtendimentoVisivel] = useState(true)

  const mediaRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const pararQuandoIniciarRef = useRef(false)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const chatRef = useRef(null)
  const initialScrollDoneRef = useRef(false)
  const shouldStickToBottomRef = useRef(true)
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
    initialScrollDoneRef.current = false
    shouldStickToBottomRef.current = true
  }, [pedidoId])

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
          const ultima = lista[lista.length - 1]
          const ultimaFoiMinha = String(ultima?.userId || '') === String(meuId || '')
          const deveRolar = !initialScrollDoneRef.current || shouldStickToBottomRef.current || ultimaFoiMinha

          if (chatRef.current && deveRolar) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight
            shouldStickToBottomRef.current = true
          }
          initialScrollDoneRef.current = true
        } catch {}
      })
    })

    return () => off()
  }, [meuId, pedidoId])

  useEffect(() => {
    if (!pedidoId) {
      setPedido(null)
      return undefined
    }

    const off = onValue(
      ref(database, `pedidos/${pedidoId}`),
      (snap) => {
        setPedido(snap.exists() ? { id: pedidoId, ...(snap.val() || {}) } : null)
      },
      () => setPedido(null),
    )
    return () => off()
  }, [pedidoId])

  useEffect(() => {
    if (!pedido?.id || !meuId) return
    const mode = String(pedido?.aceite?.id || '') === String(meuId) ? 'corre' : 'cliente'
    const tipSessionKey = `${meuId}:${pedido.id}`
    if (chatOpenTipSessionKeys.has(tipSessionKey)) return
    chatOpenTipSessionKeys.add(tipSessionKey)
    showCorreAquiTipOnce(CONTEXTUAL_TIP_IDS.chatAberto, {
      id: CONTEXTUAL_TIP_IDS.chatAberto,
      mode,
      target: 'chat',
    })
  }, [meuId, pedido?.aceite?.id, pedido?.id])

  useEffect(() => {
    if (!pedidoId || !meuId) return undefined
    let cancelado = false

    const criarMensagemInicial = async () => {
      try {
        const msgId = 'msg_atendimento_intro'
        const msgRef = ref(database, `chats/${pedidoId}/${msgId}`)
        const snap = await get(msgRef)
        if (cancelado || snap.exists()) return

        const agora = Date.now()
        const payload = {
          texto:
            'Este chat é exclusivo deste atendimento.\nCombine por aqui:\n• horário\n• endereço\n• detalhes do serviço\n• valor final, se necessário\nTudo ficará registrado no aplicativo.',
          sistema: true,
          evento: 'atendimento_intro',
          criadoEm: agora,
          hora: agora,
          autorId: 'sistema',
          autorNome: 'Sistema',
        }

        await set(msgRef, payload)
        const mirrorRef = ref(database, `mensagens/${pedidoId}/${msgId}`)
        const mirrorSnap = await get(mirrorRef).catch(() => null)
        if (!mirrorSnap?.exists?.()) await set(mirrorRef, payload).catch(() => {})
      } catch (error) {
        console.warn('Não foi possível criar a mensagem inicial do atendimento:', error)
      }
    }

    criarMensagemInicial()
    return () => {
      cancelado = true
    }
  }, [pedidoId, meuId])

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
      pedidoStatus: pedido?.status || null,
      valor: pedido?.valor || null,
      categoriaNome: pedido?.categoriaNome || pedido?.categoriaLabel || '',
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
        type: 'nova_mensagem',
        pedidoId,
        conversaId: pedidoId,
        titulo: `Nova mensagem de ${nomeMeu}`,
        mensagem: preview,
        prioridade: 'normal',
        action: { label: 'Abrir conversa', screen: 'chat', id: pedidoId },
        notificationId: `notif_${agora}`,
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

  async function chamarAtencao() {
    if (!pedidoId || !meuId || !outroId || enviando || anexando || chamandoAtencao) return

    try {
      setChamandoAtencao(true)
      const agora = Date.now()
      const notificationId = `notif_chamar_atencao_${agora}`
      const tituloPedido = pedido?.titulo || pedido?.servicoTitulo || pedidoTitulo || 'atendimento'
      const titulo = `${nomeMeu} chamou sua atencao`
      const mensagem = `${nomeMeu} esta aguardando voce na conversa sobre ${tituloPedido}.`
      const systemMessage = `${nomeMeu} chamou atencao na conversa.`

      await update(ref(database), {
        [`conversas/${outroId}/${pedidoId}/pedidoId`]: pedidoId,
        [`conversas/${outroId}/${pedidoId}/outroId`]: meuId,
        [`conversas/${outroId}/${pedidoId}/outroNome`]: nomeMeu,
        [`conversas/${outroId}/${pedidoId}/unread`]: true,
        [`conversas/${outroId}/${pedidoId}/lastText`]: systemMessage,
        [`conversas/${outroId}/${pedidoId}/mensagemPreview`]: systemMessage,
        [`conversas/${outroId}/${pedidoId}/lastAt`]: agora,
        [`conversas/${outroId}/${pedidoId}/updatedAt`]: agora,
        [`conversas/${outroId}/${pedidoId}/status`]: 'ativa',
        [`conversas/${meuId}/${pedidoId}/pedidoId`]: pedidoId,
        [`conversas/${meuId}/${pedidoId}/lastText`]: systemMessage,
        [`conversas/${meuId}/${pedidoId}/mensagemPreview`]: systemMessage,
        [`conversas/${meuId}/${pedidoId}/lastAt`]: agora,
        [`conversas/${meuId}/${pedidoId}/updatedAt`]: agora,
        [`notificacoes/${outroId}/${notificationId}`]: {
          tipo: 'chamar_atencao_chat',
          pedidoId,
          conversaId: pedidoId,
          titulo,
          mensagem,
          prioridade: 'alta',
          acao: 'abrir_chat',
          lida: false,
          criadoEm: agora,
          toUid: outroId,
          fromUid: meuId,
          autor: { id: meuId, nome: nomeMeu },
        },
        [`notifications/${outroId}/${notificationId}`]: {
          id: notificationId,
          tipo: 'chamar_atencao_chat',
          titulo,
          mensagem,
          pedidoId,
          servicoId: pedido?.servicoId || '',
          fromUid: meuId,
          toUid: outroId,
          lida: false,
          criadoEm: agora,
          action: { label: 'Abrir conversa', screen: 'chat', id: pedidoId },
          autor: { id: meuId, nome: nomeMeu },
        },
      })

      await registrarMensagemSistema(systemMessage, 'chamar_atencao')

      enviarPushParaUsuario(outroId, {
        type: 'chamar_atencao_chat',
        pedidoId,
        conversaId: pedidoId,
        titulo,
        mensagem,
        prioridade: 'alta',
        action: { label: 'Abrir conversa', screen: 'chat', id: pedidoId },
        notificationId,
      })

      onToast?.({ type: 'success', title: 'Aviso enviado', message: `${outroNome} recebeu um alerta para abrir a conversa.` })
    } catch (error) {
      console.warn('Erro ao chamar atencao:', error)
      onToast?.({ type: 'error', title: 'Nao foi possivel avisar', message: 'Tente novamente em instantes.' })
    } finally {
      setChamandoAtencao(false)
    }
  }

  async function registrarMensagemSistema(texto, evento) {
    if (!pedidoId || !meuId) return
    const agora = Date.now()
    const msgId = `msg_${evento || 'sistema'}_${agora}`
    const payload = {
      texto,
      sistema: true,
      evento: evento || 'sistema',
      criadoEm: agora,
      hora: agora,
      autorId: 'sistema',
      autorNome: 'Sistema',
    }

    await set(ref(database, `chats/${pedidoId}/${msgId}`), payload)
    await set(ref(database, `mensagens/${pedidoId}/${msgId}`), payload).catch(() => {})
  }

  async function legacyFinalizarAtendimento() {
    if (!pedidoId || !meuId || enviando || anexando) return
    if (!pedido) {
      onToast?.({
        type: 'info',
        title: 'Atendimento em preparo',
        message: 'A finalização automática está disponível para pedidos públicos.',
      })
      return
    }

    const souProfissional = String(pedido?.aceite?.id || '') === String(meuId || '')
    if (pedido && !souProfissional) {
      onToast?.({
        type: 'info',
        title: 'Ação do profissional',
        message: 'Quem aceitou o pedido deve finalizar o atendimento.',
      })
      return
    }

    const confirmar = typeof window === 'undefined' || window.confirm('Deseja finalizar este atendimento?')
    if (!confirmar) return

    try {
      setEnviando(true)
      const agora = Date.now()
      await update(ref(database, `pedidos/${pedidoId}`), {
        status: 'concluido',
        concluidoEm: agora,
        concluidoPor: { id: meuId, nome: nomeMeu },
        avaliacaoPendente: true,
        atualizadoEm: agora,
        atualizadoEmServer: serverTimestamp(),
      })

      await registrarMensagemSistema('Atendimento finalizado.', 'atendimento_finalizado')

      if (outroId) {
        const notificationId = `notif_atendimento_finalizado_${agora}`
        const mensagem = 'Avalie o atendimento recebido.'
        await update(ref(database), {
          [`conversas/${meuId}/${pedidoId}/pedidoId`]: pedidoId,
          [`conversas/${meuId}/${pedidoId}/lastText`]: 'Atendimento finalizado.',
          [`conversas/${meuId}/${pedidoId}/mensagemPreview`]: 'Atendimento finalizado.',
          [`conversas/${meuId}/${pedidoId}/lastAt`]: agora,
          [`conversas/${meuId}/${pedidoId}/updatedAt`]: agora,
          [`conversas/${meuId}/${pedidoId}/status`]: 'arquivavel',
          [`conversas/${meuId}/${pedidoId}/pedidoStatus`]: 'concluido',
          [`conversas/${outroId}/${pedidoId}/pedidoId`]: pedidoId,
          [`conversas/${outroId}/${pedidoId}/outroId`]: meuId,
          [`conversas/${outroId}/${pedidoId}/outroNome`]: nomeMeu,
          [`conversas/${outroId}/${pedidoId}/unread`]: true,
          [`conversas/${outroId}/${pedidoId}/lastText`]: mensagem,
          [`conversas/${outroId}/${pedidoId}/mensagemPreview`]: mensagem,
          [`conversas/${outroId}/${pedidoId}/lastAt`]: agora,
          [`conversas/${outroId}/${pedidoId}/updatedAt`]: agora,
          [`conversas/${outroId}/${pedidoId}/status`]: 'ativa',
          [`conversas/${outroId}/${pedidoId}/pedidoStatus`]: 'concluido',
          [`notificacoes/${outroId}/${notificationId}`]: {
            tipo: 'atendimento_finalizado',
            pedidoId,
            conversaId: pedidoId,
            titulo: 'Atendimento finalizado',
            mensagem,
            prioridade: 'alta',
            acao: 'avaliar_pedido',
            lida: false,
            criadoEm: agora,
            toUid: outroId,
            fromUid: meuId,
            autor: { id: meuId, nome: nomeMeu },
          },
          [`notifications/${outroId}/${notificationId}`]: {
            id: notificationId,
            tipo: 'atendimento_finalizado',
            titulo: 'Atendimento finalizado',
            mensagem,
            pedidoId,
            servicoId: pedido?.servicoId || '',
            fromUid: meuId,
            toUid: outroId,
            lida: false,
            criadoEm: agora,
            action: { label: 'Avaliar atendimento', screen: 'myOrders', id: pedidoId },
            autor: { id: meuId, nome: nomeMeu },
          },
        })

        enviarPushParaUsuario(outroId, {
          type: 'atendimento_finalizado',
          pedidoId,
          conversaId: pedidoId,
          titulo: 'Atendimento finalizado',
          mensagem,
          prioridade: 'alta',
          action: { label: 'Avaliar atendimento', screen: 'myOrders', id: pedidoId },
          notificationId: `notif_finalizado_${agora}`,
        })
      }

      onToast?.({ type: 'success', title: 'Atendimento finalizado', message: 'O cliente foi avisado para avaliar.' })
    } catch (error) {
      console.warn('Erro ao finalizar atendimento:', error)
      onToast?.({ type: 'error', title: 'Falha ao finalizar', message: 'Tente novamente em instantes.' })
    } finally {
      setEnviando(false)
    }
  }

  async function finalizarAtendimento() {
    if (!pedido) return legacyFinalizarAtendimento()
    if (!pedidoId || !meuId || enviando || anexando) return

    const status = normalizeAtendimentoStatus(pedido.status)
    const souCliente = String(pedido?.criador?.id || '') === String(meuId)
    const souTrabalhador = String(pedido?.aceite?.id || '') === String(meuId)
    const nextStatus = souTrabalhador && status === ATENDIMENTO_STATUS.EM_ANDAMENTO
      ? ATENDIMENTO_STATUS.CHEGOU
      : souTrabalhador && status === ATENDIMENTO_STATUS.CHEGOU
        ? ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
        : souCliente && status === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
          ? ATENDIMENTO_STATUS.FINALIZADO
          : ''

    if (!nextStatus) {
      onToast?.({ type: 'info', title: 'Etapa indisponível', message: 'A próxima etapa precisa ser confirmada pelo participante correto.' })
      return
    }

    if (nextStatus === ATENDIMENTO_STATUS.FINALIZADO) {
      const confirmar = typeof window === 'undefined' || window.confirm('Deseja confirmar a conclusão deste atendimento?')
      if (!confirmar) return
    }

    try {
      setEnviando(true)
      const agora = Date.now()
      const profissionalNome = pedido?.aceite?.nome || 'Profissional'
      const clienteNome = pedido?.criador?.nome || 'Cliente'
      const actorName = souCliente ? clienteNome : profissionalNome
      const evento = nextStatus === ATENDIMENTO_STATUS.CHEGOU
        ? 'atendimento_chegou'
        : nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
          ? 'finalizacao_solicitada'
          : 'atendimento_finalizado'
      const textoEvento = nextStatus === ATENDIMENTO_STATUS.CHEGOU
        ? `${profissionalNome} informou que chegou ao local.`
        : nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
          ? `${profissionalNome} solicitou a finalização do atendimento.`
          : `${clienteNome} confirmou que o atendimento foi concluído.`
      const patch = nextStatus === ATENDIMENTO_STATUS.CHEGOU
        ? { chegouEm: agora, chegouPor: { id: meuId, nome: actorName } }
        : nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
          ? { finalizacaoSolicitadaEm: agora, finalizacaoSolicitadaPor: { id: meuId, nome: actorName } }
          : { finalizadoEm: agora, finalizadoPor: { id: meuId, nome: actorName } }

      await transitionAtendimento({
        database,
        pedidoId,
        actorUid: meuId,
        expectedStatus: status,
        nextStatus,
        atendimentoPatch: patch,
        topLevelPatch: { ...patch, ...(nextStatus === ATENDIMENTO_STATUS.FINALIZADO ? { avaliacaoPendente: true } : {}) },
      })

      await registrarMensagemSistema(textoEvento, evento)
      const updates = {}
      for (const uid of [meuId, outroId]) {
        if (!uid) continue
        updates[`conversas/${uid}/${pedidoId}/pedidoStatus`] = nextStatus
        updates[`conversas/${uid}/${pedidoId}/lastText`] = textoEvento
        updates[`conversas/${uid}/${pedidoId}/mensagemPreview`] = textoEvento
        updates[`conversas/${uid}/${pedidoId}/lastAt`] = agora
        updates[`conversas/${uid}/${pedidoId}/updatedAt`] = agora
        updates[`conversas/${uid}/${pedidoId}/lastById`] = meuId
        updates[`conversas/${uid}/${pedidoId}/lastByNome`] = actorName
        updates[`conversas/${uid}/${pedidoId}/unread`] = uid !== meuId
        updates[`conversas/${uid}/${pedidoId}/status`] = nextStatus === ATENDIMENTO_STATUS.FINALIZADO ? 'arquivavel' : 'ativa'
      }

      if (outroId) {
        const notificationId = `notif_atendimento_${evento}_${agora}`
        const notification = {
          id: notificationId,
          tipo: evento,
          titulo: nextStatus === ATENDIMENTO_STATUS.CHEGOU ? 'Profissional chegou' : nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO ? 'Finalização solicitada' : 'Atendimento concluído',
          mensagem: textoEvento,
          pedidoId,
          fromUid: meuId,
          toUid: outroId,
          lida: false,
          criadoEm: agora,
          action: { label: 'Abrir atendimento', screen: 'chat', id: pedidoId },
          autor: { id: meuId, nome: actorName },
        }
        updates[`notifications/${outroId}/${notificationId}`] = notification
        updates[`notificacoes/${outroId}/${notificationId}`] = notification
      }

      await update(ref(database), updates)
      if (outroId) {
        enviarPushParaUsuario(outroId, {
          type: evento,
          pedidoId,
          conversaId: pedidoId,
          titulo: nextStatus === ATENDIMENTO_STATUS.CHEGOU ? 'Profissional chegou' : nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO ? 'Finalização solicitada' : 'Atendimento concluído',
          mensagem: textoEvento,
          prioridade: 'alta',
          action: { label: 'Abrir atendimento', screen: 'chat', id: pedidoId },
          notificationId,
        })
      }
      if (nextStatus === ATENDIMENTO_STATUS.CHEGOU) {
        showCorreAquiTipOnce(CONTEXTUAL_TIP_IDS.cheguei, {
          id: CONTEXTUAL_TIP_IDS.cheguei,
          target: 'progresso',
        })
      } else if (nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO) {
        showCorreAquiTipOnce(CONTEXTUAL_TIP_IDS.solicitarConclusao, {
          id: CONTEXTUAL_TIP_IDS.solicitarConclusao,
          target: 'confirmacao-final',
        })
      } else if (nextStatus === ATENDIMENTO_STATUS.FINALIZADO) {
        showCorreAquiTipOnce(CONTEXTUAL_TIP_IDS.conclusaoConfirmada, {
          id: CONTEXTUAL_TIP_IDS.conclusaoConfirmada,
          evaluationActive: true,
        })
      }
      onToast?.({ type: 'success', title: 'Atendimento atualizado', message: textoEvento })
    } catch (error) {
      console.warn('Erro ao avançar atendimento no chat:', error)
      onToast?.({ type: 'error', title: 'Falha no atendimento', message: error?.message || 'Tente novamente.' })
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
    setDetalhesPedidoAberto(false)
    setAvisoAtendimentoVisivel(true)
  }, [pedidoId])

  if (fechado) return null

  const outroFoto = outroUser?.fotoURL || outroUser?.photoURL || ''
  const outroInicial = safeName(outroNome, 'C').slice(0, 1).toUpperCase()
  const outroOnline = outroUser?.online === true
  const outroLastSeen = outroUser?.lastSeen || outroUser?.presence?.lastSeen || outroUser?.presence?.updatedAt || 0
  const outroStatusLabel = outroOnline ? 'Online' : formatarUltimaPresenca(outroLastSeen)
  const outroStatusClass = outroOnline ? 'text-emerald-400' : 'text-slate-400'
  const outroDotClass = outroOnline
    ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.85)]'
    : 'bg-slate-500 shadow-none'
  const pedidoStatusMeta = statusAtendimentoMeta(pedido?.status)
  const pedidoStatus = normalizeAtendimentoStatus(pedido?.status)
  const souClienteAtendimento = String(pedido?.criador?.id || '') === String(meuId || '')
  const souTrabalhadorAtendimento = String(pedido?.aceite?.id || '') === String(meuId || '')
  const podeAvancarAtendimento = (
    (souTrabalhadorAtendimento && [ATENDIMENTO_STATUS.EM_ANDAMENTO, ATENDIMENTO_STATUS.CHEGOU].includes(pedidoStatus))
    || (souClienteAtendimento && pedidoStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO)
  )
  const pedidoTituloChat = pedido?.titulo || pedido?.servicoTitulo || pedidoTitulo || 'Atendimento Corre Aqui'
  const pedidoValorChat = formatarValorPedido(pedido?.valor)
  const pedidoDataChat = formatarDataPedido(pedido?.atendimentoIniciadoEm || pedido?.aceitoEm || pedido?.criadoEm || pedido?.createdAt)
  const categoriaMeta = getCategoryById(
    pedido?.categoriaId || pedido?.categoria || pedido?.category || pedido?.categoriaNome || pedido?.categoriaLabel
  )
  const categoriaLabel = categoriaMeta?.label || pedido?.categoriaNome || pedido?.categoriaLabel || ''
  const categoriaAccent = categoriaMeta?.accent || '#facc15'
  const categoriaSoft = categoriaMeta?.soft || '#fff7cc'
  const pedidoIcon = pedido?.categoriaIcon || pedido?.icone || '⚡'
  const guidedTimelineStep = getGuidedTimelineStep(pedido?.status)
  const sugestoesVisiveis = SUGESTOES.filter((sugestao) => {
    if (pedidoStatus === ATENDIMENTO_STATUS.CANCELADO) return false
    if (sugestao.label === 'Cheguei') return pedidoStatus === ATENDIMENTO_STATUS.EM_ANDAMENTO
    if (sugestao.label === 'Serviço concluído') return pedidoStatus === ATENDIMENTO_STATUS.FINALIZADO
    if (sugestao.label === 'Estou a caminho') {
      return [ATENDIMENTO_STATUS.ACEITO, ATENDIMENTO_STATUS.EM_ANDAMENTO].includes(pedidoStatus)
    }
    return true
  })
  const notaRelacionada = outroUser?.nota || outroUser?.notaMedia || outroUser?.avaliacao || outroUser?.rating || ''
  const distanciaRelacionada = pedido?.distanciaKm || pedido?.distancia || pedido?.localizacao?.distanciaKm || ''
  const distanciaLabel = typeof distanciaRelacionada === 'number'
    ? `${distanciaRelacionada.toFixed(1).replace('.', ',')} km`
    : String(distanciaRelacionada || '').trim()
  const tempoRelacionada = pedido?.tempoEstimado || pedido?.duracaoEstimada || ''
  const containerClass = modoPagina
    ? 'fixed inset-y-0 left-1/2 z-[100000] flex h-[100svh] min-h-0 w-full max-w-[900px] -translate-x-1/2 flex-col overflow-hidden border-x border-white/[0.06] bg-[#030b15] text-white shadow-[0_0_90px_rgba(0,0,0,0.42)] supports-[height:100dvh]:h-[100dvh]'
    : 'relative z-[9999] flex h-[min(92dvh,820px)] max-h-[calc(100dvh-0.75rem)] w-full max-w-[440px] flex-col overflow-hidden rounded-[24px] border border-emerald-400/15 bg-[#030b15] text-white shadow-[0_30px_100px_rgba(0,0,0,0.6)] sm:max-w-[560px] sm:rounded-[28px]'
  const nomeServicoCurto = pedidoTituloChat.length > 46 ? `${pedidoTituloChat.slice(0, 46).trim()}...` : pedidoTituloChat
  const acaoAtendimentoCurta = pedidoStatus === ATENDIMENTO_STATUS.EM_ANDAMENTO
    ? 'Cheguei'
    : pedidoStatus === ATENDIMENTO_STATUS.CHEGOU
      ? 'Finalizar'
      : 'Confirmar'

  return (
    <div className={containerClass} data-tutorial="chat">
      <div className="shrink-0 border-b border-white/[0.06] bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_38%),linear-gradient(180deg,#071625,#030b15)] px-3 pb-2 pt-[max(0.4rem,env(safe-area-inset-top))] sm:px-5 sm:pb-3 sm:pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex h-12 items-center gap-2 sm:h-16 sm:gap-3">
          <button
            type="button"
            onClick={fecharChat}
            aria-label={modoPagina ? 'Voltar' : 'Fechar conversa'}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-200 transition hover:bg-white/[0.08] active:scale-95 sm:h-11 sm:w-11"
          >
            {modoPagina ? <IconBack className="h-5 w-5 sm:h-6 sm:w-6" /> : <IconClose className="h-4 w-4 sm:h-5 sm:w-5" />}
          </button>

          <div className="relative h-10 w-10 shrink-0 overflow-visible rounded-full border border-cyan-300/30 bg-gradient-to-br from-blue-500 to-emerald-400 shadow-[0_10px_24px_rgba(14,165,233,0.22)] sm:h-12 sm:w-12">
            {outroFoto ? (
              <div
                className="h-full w-full overflow-hidden rounded-full bg-cover bg-center"
                style={{ backgroundImage: `url(${JSON.stringify(outroFoto)})` }}
                aria-hidden="true"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-sm font-black text-white sm:text-lg">{outroInicial}</div>
            )}
            <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#061322] sm:h-3.5 sm:w-3.5 ${outroDotClass}`} />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[17px] font-black tracking-tight text-white sm:text-xl">{outroNome}</div>
            <div className="hidden">
              <span>Você: <b className="text-slate-200">{nomeMeu}</b></span>
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <span>Outro: <b className="text-slate-200">{outroNome}</b></span>
            </div>
            <div className={`mt-0.5 flex items-center gap-1 text-[11px] font-bold sm:text-xs ${outroStatusClass}`}>
              <span className={`h-2 w-2 rounded-full ${outroDotClass}`} />
              {outroStatusLabel}
            </div>
            {(notaRelacionada || distanciaLabel || tempoRelacionada) ? (
              <div className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden text-[9px] font-bold text-slate-400 sm:text-[11px]">
                {notaRelacionada ? <span className="text-yellow-300">★ {notaRelacionada}</span> : null}
                {distanciaLabel ? <span>⌖ {distanciaLabel}</span> : null}
                {tempoRelacionada ? <span>◷ {tempoRelacionada}</span> : null}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
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
              className="grid h-9 w-9 place-items-center rounded-full border border-emerald-400/25 bg-emerald-500/[0.08] text-emerald-300 transition hover:bg-emerald-500/15 active:scale-95 sm:h-11 sm:w-11"
              aria-label="Ligar"
            >
              <IconPhone className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.09] active:scale-95 sm:h-11 sm:w-11"
              aria-label="Mais opcoes"
            >
              <IconMore className="h-4 w-4 sm:h-5 sm:w-5" />
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

      <div className="shrink-0 bg-[#030b15] px-3 pb-1 pt-2 sm:px-5 sm:pb-2 sm:pt-3">
        <div className="overflow-hidden rounded-[20px] border border-emerald-400/20 bg-[linear-gradient(145deg,#0a1b2a,#07111f)] shadow-[0_12px_30px_rgba(0,0,0,0.24)]">
          <div className="flex min-h-[66px] items-center gap-2.5 p-2.5 sm:min-h-[74px] sm:gap-3 sm:p-3">
            <div
              className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border text-xl shadow-[0_10px_22px_rgba(15,23,42,0.2)] sm:h-12 sm:w-12 sm:text-2xl"
              style={{ backgroundColor: categoriaSoft, borderColor: categoriaAccent, color: categoriaAccent }}
              aria-label={categoriaLabel || 'Categoria do serviço'}
              title={categoriaLabel || undefined}
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/75 shadow-sm">
                {categoriaMeta?.emoji || pedidoIcon}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              {categoriaLabel ? (
                <div className="truncate text-[8px] font-black uppercase tracking-[0.14em] sm:text-[9px]" style={{ color: categoriaAccent }}>
                  {categoriaLabel}
                </div>
              ) : null}
              <div className="truncate text-[14px] font-black leading-tight text-white sm:text-base">{nomeServicoCurto}</div>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] font-black text-slate-400 sm:text-[11px]">
                <span className="shrink-0 text-emerald-400">{pedidoValorChat || 'Combinar valor'}</span>
                <span className="text-slate-600">•</span>
                <span className="truncate">{pedidoStatusMeta.label}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDetalhesPedidoAberto((v) => !v)}
              className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2.5 text-[10px] font-black text-slate-200 transition hover:bg-white/[0.10] active:scale-[0.98] sm:h-9 sm:px-3 sm:text-[11px]"
            >
              Detalhes
              <IconChevronDown className={`h-4 w-4 transition ${detalhesPedidoAberto ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {detalhesPedidoAberto ? (
            <motion.div
              initial={reduzirMovimento ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="overflow-hidden border-t border-white/10 px-3 pb-3 pt-2 sm:px-4 sm:pb-3 sm:pt-3"
            >
              <div className="hidden flex items-center gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {TIMELINE_GUIADA.map((label, index) => {
                  const done = index <= guidedTimelineStep
                  const current = index === guidedTimelineStep
                  return (
                    <div key={label} className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={[
                          'grid h-6 w-6 place-items-center rounded-full border text-[10px] font-black',
                          done ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-slate-500/55 bg-white/[0.04] text-slate-400',
                          current ? 'ring-4 ring-emerald-500/20' : '',
                        ].join(' ')}
                      >
                        {done ? <IconCheck className="h-3.5 w-3.5" /> : index + 1}
                      </span>
                      <span className={`text-[11px] font-black ${current ? 'text-emerald-300' : done ? 'text-slate-200' : 'text-slate-500'}`}>{label}</span>
                      {index < TIMELINE_GUIADA.length - 1 ? <span className="h-px w-5 bg-white/15" /> : null}
                    </div>
                  )
                })}
              </div>
              <div className="grid gap-2 text-[11px] font-semibold leading-snug text-slate-300 sm:grid-cols-[1fr_auto] sm:text-xs">
                <p className="max-h-20 overflow-y-auto break-words pr-1">
                  {pedido?.descricao || pedido?.descricaoPedido || 'Combine os detalhes finais deste atendimento pelo chat.'}
                </p>
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-black text-slate-300">{pedidoDataChat}</span>
              </div>
            </motion.div>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 bg-[#030b15] px-3 pb-2 pt-1 sm:px-5 sm:pb-3" data-tutorial="progresso">
        <div className="mx-auto rounded-[18px] border border-white/[0.08] bg-white/[0.025] px-2 py-2.5 shadow-[0_12px_28px_rgba(0,0,0,0.18)] sm:px-4 sm:py-3">
          <div className="relative">
            <div className="absolute left-[10%] right-[10%] top-4 h-0.5 overflow-hidden rounded-full bg-white/10 sm:top-[18px]">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500"
                initial={false}
                animate={{ width: `${(Math.max(guidedTimelineStep, 0) / 4) * 100}%` }}
                transition={reduzirMovimento ? { duration: 0 } : { duration: 0.45, ease: 'easeOut' }}
              />
            </div>
            <div className="relative grid grid-cols-5 gap-0.5">
              {TIMELINE_GUIADA.map((label, index) => {
                const done = index < guidedTimelineStep
                const current = index === guidedTimelineStep
                return (
                  <div key={label} className="min-w-0 text-center">
                    <motion.span
                      key={`${label}-${current ? pedidoStatus : 'rest'}`}
                      initial={current && !reduzirMovimento ? { scale: 0.9 } : false}
                      animate={{ scale: 1 }}
                      transition={reduzirMovimento ? { duration: 0 } : { duration: 0.24, ease: 'easeOut' }}
                      aria-current={current ? 'step' : undefined}
                      className={[
                        'mx-auto grid h-8 w-8 place-items-center rounded-full border transition sm:h-9 sm:w-9',
                        done ? 'border-emerald-300 bg-emerald-500 text-white' : 'border-slate-600 bg-[#0d1a29] text-slate-500',
                        current ? 'border-cyan-300 bg-cyan-500 text-white ring-4 ring-cyan-400/15 shadow-[0_0_18px_rgba(34,211,238,0.34)]' : '',
                      ].join(' ')}
                    >
                      <TimelineIcon index={index} className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                    </motion.span>
                    <span className={`mt-1 block text-[8px] font-black leading-[1.05] sm:text-[10px] ${current ? 'text-cyan-300' : done ? 'text-slate-200' : 'text-slate-500'}`}>
                      {label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div
        ref={chatRef}
        onScroll={(event) => {
          const element = event.currentTarget
          shouldStickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 96
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_100%_8%,rgba(14,165,233,0.08),transparent_28%),radial-gradient(circle_at_0%_78%,rgba(16,185,129,0.07),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.012)_25%,transparent_25%)_0_0/28px_28px,#030b15] px-3 py-2 sm:px-5 sm:py-4"
      >
        {avisoAtendimentoVisivel ? (
          <div className="mb-2 flex justify-center sm:mb-3">
            <button
              type="button"
              onClick={() => setAvisoAtendimentoVisivel(false)}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/[0.09] px-2.5 py-1 text-[10px] font-bold text-emerald-100 shadow-[0_8px_20px_rgba(0,0,0,0.16)] transition hover:bg-emerald-500/15 sm:px-3 sm:py-1.5 sm:text-[11px]"
              aria-label="Fechar aviso de atendimento"
            >
              <IconShield className="h-4 w-4 shrink-0 text-emerald-300" />
              <span className="truncate">Atendimento iniciado. Tudo fica registrado no app.</span>
              <IconClose className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            </button>
          </div>
        ) : null}

        <div className="mb-2 flex items-center gap-2 sm:mb-4 sm:gap-4">
          <span className="h-px flex-1 bg-white/10" />
          <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-black text-slate-400 sm:px-3 sm:py-1 sm:text-[11px]">Hoje</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

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
            <div>
              {mensagens.map((msg, index) => {
                const minha =
                  (msg.userId && meuId && String(msg.userId) === String(meuId)) ||
                  (!msg.userId && msg.autor && meuNome && String(msg.autor) === String(meuNome))
                const sistema = msg.sistema || msg.autorId === 'sistema'
                const hora = formatarHoraMensagem(msg.hora || msg.criadoEm || msg.createdAt)
                const anterior = mensagens[index - 1]
                const proxima = mensagens[index + 1]
                const autorAtual = String(msg.userId || msg.autorId || msg.autor || '')
                const mesmoAutorAnterior = Boolean(
                  anterior
                  && !(anterior.sistema || anterior.autorId === 'sistema')
                  && String(anterior.userId || anterior.autorId || anterior.autor || '') === autorAtual
                )
                const mesmoAutorProximo = Boolean(
                  proxima
                  && !(proxima.sistema || proxima.autorId === 'sistema')
                  && String(proxima.userId || proxima.autorId || proxima.autor || '') === autorAtual
                )

              if (sistema) {
                const chip = compactSystemChip(msg)
                return (
                  <motion.div
                    key={msg.id}
                    initial={reduzirMovimento ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduzirMovimento ? { duration: 0 } : { duration: 0.2 }}
                    className={`${index === 0 ? '' : 'mt-2.5'} flex justify-center`}
                  >
                    <div className="inline-flex max-w-[94%] items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/[0.09] px-2.5 py-1 text-[10px] font-bold leading-tight text-emerald-100 shadow-[0_8px_18px_rgba(0,0,0,0.14)] sm:max-w-[72%] sm:px-3 sm:py-1.5 sm:text-[11px]">
                      <span className="shrink-0 text-emerald-300">{chip.icon}</span>
                      <span className="break-words text-center">{chip.label}</span>
                      {hora ? <span className="shrink-0 text-[10px] font-bold text-slate-500">{hora}</span> : null}
                    </div>
                  </motion.div>
                )
              }

              return (
                <motion.div
                  key={msg.id}
                  initial={reduzirMovimento ? false : { opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={reduzirMovimento ? { duration: 0 } : { duration: 0.22, delay: Math.min(index * 0.018, 0.14), ease: 'easeOut' }}
                  className={`flex items-end gap-2 ${index === 0 ? '' : mesmoAutorAnterior ? 'mt-1' : 'mt-2.5'} ${minha ? 'justify-end' : 'justify-start'}`}
                >
                  {!minha && !mesmoAutorProximo ? (
                    <div className="mb-1 grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-cyan-300/25 bg-gradient-to-br from-blue-500 to-emerald-400 text-[10px] font-black text-white sm:h-8 sm:w-8 sm:text-xs">
                      {outroFoto ? (
                        <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(outroFoto)})` }} aria-hidden="true" />
                      ) : outroInicial}
                    </div>
                  ) : !minha ? <div className="h-7 w-7 shrink-0 sm:h-8 sm:w-8" aria-hidden="true" /> : null}
                  <div className={`min-w-0 max-w-[82%] sm:max-w-[70%] ${minha ? 'text-right' : 'text-left'}`}>
                    <div className="hidden mb-0.5 px-1 text-[9px] font-bold uppercase tracking-wide text-slate-500 sm:mb-1 sm:text-[10px]">
                      {minha ? 'Você' : safeName(msg.autor, outroNome)}
                    </div>
                    <div
                      className={[
                        'rounded-[17px] px-3 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.2)] sm:rounded-[20px] sm:px-4 sm:py-2.5',
                         minha
                          ? `${mesmoAutorAnterior ? 'rounded-tr-[9px]' : ''} ${mesmoAutorProximo ? 'rounded-br-[9px]' : 'rounded-br-[5px]'} border border-emerald-400/25 bg-[linear-gradient(135deg,rgba(6,95,70,0.96),rgba(4,120,87,0.78))] text-white`
                          : `${mesmoAutorAnterior ? 'rounded-tl-[9px]' : ''} ${mesmoAutorProximo ? 'rounded-bl-[9px]' : 'rounded-bl-[5px]'} border border-cyan-300/[0.09] bg-[linear-gradient(135deg,#142235,#101a29)] text-white`,
                      ].join(' ')}
                    >
                      {msg.texto ? (
                        <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[14px] leading-snug sm:text-base">{msg.texto}</div>
                      ) : null}

                      <MensagemAnexo anexo={msg.anexo} audioLegacy={msg.audio} duracao={msg.duracao} />

                      <div className={`mt-0.5 flex items-center gap-1 text-[9px] text-white/60 sm:mt-1 sm:text-[10px] ${minha ? 'justify-end' : 'justify-start'}`}>
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

      <div className="shrink-0 border-t border-emerald-400/10 bg-[#030b15]/96 px-2.5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-14px_34px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:px-5 sm:py-3 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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

        <div className="mb-1.5 flex touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mb-2 sm:gap-2">
          <button
            type="button"
            onClick={() => enviar('Minha localização está disponível no pedido.')}
            disabled={enviando || anexando || gravando}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/[0.08] px-2.5 text-[10px] font-black text-white transition hover:bg-emerald-500/15 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 sm:h-10 sm:px-3 sm:text-[11px]"
          >
            <IconMapPin className="h-4 w-4 text-emerald-400" />
            Local
          </button>
          <button
            type="button"
            onClick={chamarAtencao}
            disabled={!outroId || enviando || anexando || gravando || chamandoAtencao}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-orange-400/25 bg-orange-500/10 px-2.5 text-[10px] font-black text-white transition hover:bg-orange-500/15 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 sm:h-10 sm:px-3 sm:text-[11px]"
          >
            <IconBell className="h-4 w-4 text-orange-300" />
            {chamandoAtencao ? 'Enviando' : 'Chamar'}
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={!pedidoId || enviando || anexando || gravando}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/[0.08] px-2.5 text-[10px] font-black text-white transition hover:bg-blue-500/15 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 sm:h-10 sm:px-3 sm:text-[11px]"
          >
            <IconCamera className="h-4 w-4 text-blue-400" />
            Foto
          </button>
          <button
            type="button"
            onClick={gravando ? solicitarParadaGravacao : iniciarGravacao}
            disabled={!pedidoId || enviando || anexando}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-purple-400/25 bg-purple-500/[0.08] px-2.5 text-[10px] font-black text-white transition hover:bg-purple-500/15 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 sm:h-10 sm:px-3 sm:text-[11px]"
          >
            <IconMic className="h-4 w-4 text-purple-400" />
            {gravando ? 'Parar áudio' : 'Áudio'}
          </button>
          <button
            type="button"
            onClick={() => onToast?.({ type: 'info', title: 'Valor', message: 'Alteracao de valor sera registrada com confirmacao do cliente.' })}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-yellow-400/25 bg-yellow-500/[0.08] px-2.5 text-[10px] font-black text-white transition hover:bg-yellow-500/15 active:scale-[0.97] sm:h-10 sm:px-3 sm:text-[11px]"
          >
            <IconDollar className="h-4 w-4 text-yellow-400" />
            Valor
          </button>
          <button
            type="button"
            onClick={finalizarAtendimento}
            disabled={!pedidoId || !podeAvancarAtendimento || enviando || anexando || gravando}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-black transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 sm:h-10 sm:px-3 sm:text-[11px] ${
              podeAvancarAtendimento
                ? 'border-emerald-300/35 bg-emerald-500/20 text-white shadow-[0_8px_18px_rgba(34,197,94,0.14)] hover:bg-emerald-400/25'
                : 'border-white/10 bg-white/[0.04] text-slate-500'
            }`}
          >
            <IconCheck className="h-4 w-4 text-emerald-300" />
            {acaoAtendimentoCurta}
          </button>
        </div>

        {!gravando ? (
          <div className="relative mb-1.5 sm:mb-2">
            <div className="flex touch-pan-x snap-x gap-1.5 overflow-x-auto overscroll-x-contain pr-7 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {sugestoesVisiveis.map((sugestao) => (
              <button
                key={sugestao.label}
                type="button"
                onClick={() => enviar(sugestao.texto)}
                disabled={enviando || anexando || !!anexoSelecionado}
                className="inline-flex h-7 shrink-0 snap-start items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.045] px-2.5 text-[10px] font-bold text-slate-200 transition hover:border-emerald-400/30 hover:bg-emerald-500/[0.08] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 sm:h-8 sm:px-3 sm:text-[11px]"
              >
                <span aria-hidden="true">{sugestao.icon}</span>
                {sugestao.label}
              </button>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#030b15] to-transparent" aria-hidden="true" />
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

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => arquivoInputRef.current?.click()}
            disabled={!pedidoId || enviando || anexando || gravando}
            className={[
              'grid h-10 w-10 shrink-0 place-items-center rounded-full border text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:w-11',
              gravando
                ? 'border-red-400/40 bg-red-500/20 text-red-100'
                : 'border-white/10 bg-white/[0.07] hover:bg-white/[0.12]',
            ].join(' ')}
            title="Anexar"
            aria-label="Anexar"
          >
            <IconPlus className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={!pedidoId || enviando || anexando || gravando}
            className="hidden"
            title="Abrir câmera"
            aria-label="Abrir câmera"
          >
            📷
          </button>

          <button
            type="button"
            onClick={() => arquivoInputRef.current?.click()}
            disabled={!pedidoId || enviando || anexando || gravando}
            className="hidden"
            title="Anexar arquivo"
            aria-label="Anexar arquivo"
          >
            📎
          </button>


          <div className="min-w-0 flex-1">
            {gravando ? (
              <div className="flex h-10 items-center rounded-full border border-red-500/30 bg-red-500/10 px-3 text-xs font-mono text-red-200 sm:h-11 sm:px-4 sm:text-sm">
                Gravando... {formatarTempo(tempo)}
              </div>
            ) : (
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value.slice(0, LIMITE_TEXTO))}
                onKeyDown={onKeyDown}
                placeholder={anexoSelecionado ? 'Adicionar legenda...' : 'Digite sua mensagem...'}
                rows={1}
                onFocus={() => {
                  requestAnimationFrame(() => {
                    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
                  })
                }}
                className="min-h-10 w-full max-h-20 resize-none overflow-y-auto rounded-[20px] border border-white/10 bg-white/[0.065] px-3 py-2.5 text-sm leading-tight text-white outline-none [field-sizing:content] placeholder:text-slate-500 focus:border-emerald-400/30 focus:ring-2 focus:ring-emerald-500/15 sm:min-h-11 sm:max-h-24 sm:rounded-[22px] sm:px-4 sm:py-3 sm:text-sm"
              />
            )}
          </div>

          <button
            type="button"
            className="hidden h-9 w-9 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-white/[0.07] min-[400px]:grid sm:h-10 sm:w-10"
            aria-label="Emoji"
          >
            <IconSmile className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={gravando ? solicitarParadaGravacao : iniciarGravacao}
            disabled={!pedidoId || enviando || anexando}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-white/[0.07] disabled:opacity-50 sm:h-10 sm:w-10"
            aria-label={gravando ? 'Parar audio' : 'Gravar audio'}
          >
            {gravando ? <IconStop className="h-5 w-5 text-red-300" /> : <IconMic className="h-5 w-5" />}
          </button>

          <button
            type="button"
            onClick={() => enviar()}
            disabled={enviando || anexando || (!texto.trim() && !anexoSelecionado) || gravando}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-500 text-white shadow-[0_10px_24px_rgba(34,197,94,0.26)] transition hover:bg-emerald-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:w-11 [&_span]:hidden"
          >
            {enviando || anexando ? (
              '...'
            ) : (
              <>
                <IconSend className="h-5 w-5 sm:h-6 sm:w-6" />
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
