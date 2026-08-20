'use client'

import { useEffect, useRef, useState } from 'react'
import { database } from '@/lib/firebase'
import { enviarPushParaUsuario } from '@/lib/pushSender'
import { getCategoryById } from '@/constants/categories'
import { ATENDIMENTO_STATUS, normalizeAtendimentoStatus, transitionAtendimento } from '@/lib/atendimento'
import { ref, push, onValue, query, limitToLast, update, serverTimestamp, get, set } from '@/lib/firebaseDebug'
import { CONTEXTUAL_TIP_IDS } from '@/lib/tutorial/contextualTipsConfig'
import { showCorreAquiTipOnce } from '@/components/tutorial/TutorialProvider'
import { createEventNotificationId } from '@/lib/eventNotifications'
import { registrarMensagemSistemaConfiavel } from '@/lib/trustedSystemChat'
import { motion, useReducedMotion } from 'framer-motion'
import AvaliacaoAtendimentoModal from '@/components/AvaliacaoAtendimentoModal'
import { getAuthorizedPhoneHref, getPrimaryAttendanceAction } from '@/lib/serviceExperience'
import { saveCanonicalServiceRating } from '@/lib/serviceRatings'

const chatOpenTipSessionKeys = new Set()

function debugChatWarning(...args) {
  if (process.env.NODE_ENV !== 'production') console.warn(...args)
}

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

const SUGESTOES_CLIENTE = [
  { label: 'Olá', texto: 'Olá! Tudo bem?', icon: '👋' },
  { label: 'Pode vir agora?', texto: 'Pode vir agora?', icon: '🕐' },
  { label: 'Qual o valor?', texto: 'Qual o valor?', icon: '💰' },
  { label: 'Previsão', texto: 'Pode me passar uma previsão?', icon: '📍' },
  { label: 'Estou no local', texto: 'Estou no local.', icon: '📍' },
  { label: 'Obrigado', texto: 'Obrigado!', icon: '✨' },
  { label: 'Confirmar horário', texto: 'Pode confirmar o horário?', icon: '📅' },
  { label: 'Mais informações?', texto: 'Precisa de mais alguma informação?', icon: '💬' },
]

const SUGESTOES_TRABALHADOR = [
  { label: 'Vi seu pedido', texto: 'Olá! Vi seu pedido.', icon: '👋' },
  { label: 'Posso atender', texto: 'Posso atender.', icon: '✅' },
  { label: 'Estou a caminho', texto: 'Estou a caminho.', icon: '🚗' },
  { label: 'Cheguei', texto: 'Cheguei!', icon: '📍' },
  { label: 'Mais detalhes', texto: 'Pode me passar mais detalhes?', icon: '💬' },
  { label: 'Melhor horário', texto: 'Qual o melhor horário?', icon: '📅' },
  { label: 'Combinar valor', texto: 'Podemos combinar o valor?', icon: '💰' },
  { label: 'Serviço concluído', texto: 'Serviço concluído.', icon: '✅' },
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
const MIME_ANEXOS_CHAT = new Set(['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/mp4'])
const ACCEPT_ANEXOS = 'image/jpeg,image/png,image/webp,audio/webm,audio/mp4'

function normalizarMimeAnexoChat(value) {
  const mime = String(value || '').split(';')[0].trim().toLowerCase()
  return MIME_ANEXOS_CHAT.has(mime) ? mime : ''
}

function isUrlAnexoChatSeguro(url, tipo) {
  const match = String(url || '').match(/^data:([^;,]+)(?:;[^,]*)?;base64,[A-Za-z0-9+/=]+$/)
  const mime = normalizarMimeAnexoChat(match?.[1])
  if (!mime) return false
  return (tipo === 'imagem' && mime.startsWith('image/')) || (tipo === 'audio' && mime.startsWith('audio/'))
}

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
  const mime = normalizarMimeAnexoChat(file?.type)
  if (mime.startsWith('image/')) return 'imagem'
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
  if (!item?.url || !isUrlAnexoChatSeguro(item.url, item.tipo)) return null

  if (item.tipo === 'imagem') {
    return (
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-2 block overflow-hidden rounded-2xl bg-black/20">
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

  return null
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
  const [confirmacaoFinalizacaoAberta, setConfirmacaoFinalizacaoAberta] = useState(false)
  const [conclusaoAnimando, setConclusaoAnimando] = useState(false)
  const [avaliacaoAberta, setAvaliacaoAberta] = useState(false)
  const [avaliacaoNota, setAvaliacaoNota] = useState(5)
  const [avaliacaoComentario, setAvaliacaoComentario] = useState('')
  const [salvandoAvaliacao, setSalvandoAvaliacao] = useState(false)
  const [agradecimentoAvaliacao, setAgradecimentoAvaliacao] = useState(false)

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
  const conclusaoTimerRef = useRef(null)
  const agradecimentoTimerRef = useRef(null)

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
        await registrarMensagemSistemaConfiavel({ pedidoId, eventType: 'atendimento_intro' })
      } catch (error) {
        if (!cancelado) debugChatWarning('Não foi possível criar a mensagem inicial do atendimento:', error)
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
    if (!pedidoId || typeof window === 'undefined') return undefined

    window.dispatchEvent(new CustomEvent('correaqui:active-chat', {
      detail: { pedidoId, active: true },
    }))
    window.dispatchEvent(new CustomEvent('correaqui:push-context', {
      detail: { context: 'primeiro_atendimento' },
    }))

    return () => {
      window.dispatchEvent(new CustomEvent('correaqui:active-chat', {
        detail: { pedidoId, active: false },
      }))
    }
  }, [pedidoId])

  useEffect(() => {
    if (!pedidoId || !meuId) return undefined
    let cancelled = false

    const markMessageNotificationsRead = async () => {
      const roots = ['notifications', 'notificacoes']
      const results = await Promise.allSettled(roots.map(async (rootName) => {
        const rootRef = ref(database, `${rootName}/${meuId}`)
        const snapshot = await get(rootRef)
        if (cancelled || !snapshot.exists()) return

        const updates = {}
        Object.entries(snapshot.val() || {}).forEach(([notificationId, notification]) => {
          const type = String(notification?.tipo || notification?.type || '').toLowerCase()
          const sameChat = String(notification?.pedidoId || notification?.conversaId || '') === String(pedidoId)
          if (sameChat && ['mensagem_chat', 'nova_mensagem'].includes(type) && notification?.lida !== true && notification?.read !== true) {
            updates[`${notificationId}/lida`] = true
            updates[`${notificationId}/read`] = true
            updates[`${notificationId}/lidaEm`] = Date.now()
          }
        })
        if (Object.keys(updates).length) await update(rootRef, updates)
      }))

      if (results.every((result) => result.status === 'rejected')) {
        debugChatWarning('[NOTIFICATIONS] não foi possível marcar as mensagens da conversa como lidas')
      }
    }

    void markMessageNotificationsRead()
    return () => {
      cancelled = true
    }
  }, [meuId, pedidoId])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (conclusaoTimerRef.current) clearTimeout(conclusaoTimerRef.current)
      if (agradecimentoTimerRef.current) clearTimeout(agradecimentoTimerRef.current)
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

    const mime = normalizarMimeAnexoChat(file.type)
    const tipoDetectado = tipoAnexoPorArquivo(file)
    const tipo = tipoForcado || tipoDetectado
    if (!mime || (tipo !== 'imagem' && tipo !== 'audio') || tipo !== tipoDetectado) {
      onToast?.({
        type: 'error',
        title: 'Tipo de arquivo não aceito',
        message: 'Envie somente imagem JPG, PNG, WEBP ou áudio WEBM/MP4.',
      })
      return
    }

    const previewUrl = tipo === 'imagem' ? URL.createObjectURL(file) : ''
    limparAnexoSelecionado()
    setAnexoSelecionado({
      file,
      tipo,
      previewUrl,
      nome: file.name || (tipo === 'imagem' ? 'foto.jpg' : 'arquivo'),
      mime,
      tamanho: file.size || 0,
    })
  }

  async function subirArquivoChat(file, tipoForcado = '') {
    if (!file || !pedidoId || !meuId) return null
    if (file.size > LIMITE_FALLBACK_DATABASE_BYTES) {
      throw new Error('arquivo_grande')
    }

    const mime = normalizarMimeAnexoChat(file.type)
    const tipoDetectado = tipoAnexoPorArquivo(file)
    const tipo = tipoForcado || tipoDetectado
    if (!mime || (tipo !== 'imagem' && tipo !== 'audio') || tipo !== tipoDetectado) {
      throw new Error('tipo_arquivo_invalido')
    }
    const agora = Date.now()
    const nomeSeguro = limparNomeArquivo(file.name || `${tipo}-${agora}`)
    const url = await fileToDataUrl(file)
    if (!isUrlAnexoChatSeguro(url, tipo)) throw new Error('url_anexo_invalida')

    return {
      tipo,
      url,
      nome: nomeSeguro,
      mime,
      tamanho: file.size || 0,
      storage: 'database_mvp',
    }
  }

  async function registrarMensagem({ texto: textoMsg = '', anexo = null, duracao = 0, skipNotification = false }) {
    if (!pedidoId || !meuId) return

    const agora = Date.now()
    const textoSeguro = String(textoMsg || '').slice(0, LIMITE_TEXTO)
    const preview = (textoSeguro || previewAnexo(anexo, duracao) || 'Nova mensagem').slice(0, 96)
    const payload = {
      tipo: anexo?.tipo || 'texto',
      texto: textoSeguro,
      autor: nomeMeu,
      autorNome: nomeMeu,
      userId: meuId,
      hora: agora,
      criadoEm: agora,
      criadoEmServer: serverTimestamp(),
      ...(anexo ? { anexo } : {}),
      ...(anexo?.tipo === 'audio' ? { duracao: Math.min(Math.max(Number(duracao || 0), 0), 900) } : {}),
    }

    const messageRef = await push(ref(database, `chats/${pedidoId}`), payload)
    const messageId = messageRef.key || `message_${agora}`

    const baseConversa = {
      pedidoId,
      titulo: pedidoTitulo || 'Corre aqui',
      lastText: preview,
      mensagemPreview: preview,
      lastAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
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

      if (skipNotification) return

      const notificationId = createEventNotificationId({
        type: 'NOVA_MENSAGEM',
        sourceId: `${pedidoId}_${messageId}`,
        toUid: outroId,
        state: 'enviada',
      })
      const notificationPayload = {
        id: notificationId,
        eventId: notificationId,
        tipo: 'mensagem_chat',
        pedidoId,
        conversaId: pedidoId,
        titulo: `Nova mensagem de ${nomeMeu}`,
        mensagem: preview,
        prioridade: 'normal',
        acao: 'abrir_chat',
        lida: false,
        read: false,
        criadoEm: agora,
        action: { label: 'Abrir conversa', screen: 'chat', id: pedidoId },
        autor: { id: meuId, nome: nomeMeu },
      }
      const mirrorResults = await Promise.allSettled([
        set(ref(database, `notifications/${outroId}/${notificationId}`), notificationPayload),
        set(ref(database, `notificacoes/${outroId}/${notificationId}`), notificationPayload),
      ])
      if (mirrorResults.every((result) => result.status === 'rejected')) {
        debugChatWarning('[NOTIFICATIONS] não foi possível registrar a nova mensagem nos espelhos in-app')
      }

      enviarPushParaUsuario(outroId, {
        type: 'nova_mensagem',
        pedidoId,
        conversaId: pedidoId,
        titulo: `Nova mensagem de ${nomeMeu}`,
        mensagem: preview,
        prioridade: 'normal',
        action: { label: 'Abrir conversa', screen: 'chat', id: pedidoId },
        notificationId,
        eventId: notificationId,
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
      debugChatWarning('Erro ao iniciar gravação:', error)
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
        const mime = normalizarMimeAnexoChat(mediaRef.current?.mimeType) || 'audio/webm'
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
        debugChatWarning('Erro ao salvar áudio:', error)
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
      debugChatWarning('Erro ao enviar mensagem:', error)
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
        [`conversas/${outroId}/${pedidoId}/lastAt`]: serverTimestamp(),
        [`conversas/${outroId}/${pedidoId}/updatedAt`]: serverTimestamp(),
        [`conversas/${outroId}/${pedidoId}/status`]: 'ativa',
        [`conversas/${meuId}/${pedidoId}/pedidoId`]: pedidoId,
        [`conversas/${meuId}/${pedidoId}/lastText`]: systemMessage,
        [`conversas/${meuId}/${pedidoId}/mensagemPreview`]: systemMessage,
        [`conversas/${meuId}/${pedidoId}/lastAt`]: serverTimestamp(),
        [`conversas/${meuId}/${pedidoId}/updatedAt`]: serverTimestamp(),
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

      await registrarMensagem({ texto: systemMessage, skipNotification: true })

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
      debugChatWarning('Erro ao chamar atencao:', error)
      onToast?.({ type: 'error', title: 'Nao foi possivel avisar', message: 'Tente novamente em instantes.' })
    } finally {
      setChamandoAtencao(false)
    }
  }

  async function finalizarAtendimento({ confirmado = false } = {}) {
    if (!pedido) return
    if (!pedidoId || !meuId || enviando || anexando) return

    const status = normalizeAtendimentoStatus(pedido.status)
    const souCliente = String(pedido?.criador?.id || '') === String(meuId)
    const souTrabalhador = String(pedido?.aceite?.id || '') === String(meuId)
    const nextStatus = souTrabalhador && status === ATENDIMENTO_STATUS.ACEITO
      ? ATENDIMENTO_STATUS.EM_ANDAMENTO
      : souTrabalhador && status === ATENDIMENTO_STATUS.EM_ANDAMENTO
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

    if (nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO && !confirmado) {
      setConfirmacaoFinalizacaoAberta(true)
      return
    }

    try {
      setEnviando(true)
      const agora = Date.now()
      const profissionalNome = pedido?.aceite?.nome || 'Profissional'
      const clienteNome = pedido?.criador?.nome || 'Cliente'
      const actorName = souCliente ? clienteNome : profissionalNome
      const evento = nextStatus === ATENDIMENTO_STATUS.EM_ANDAMENTO
        ? 'atendimento_iniciado'
        : nextStatus === ATENDIMENTO_STATUS.CHEGOU
          ? 'atendimento_chegou'
          : nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
            ? 'finalizacao_solicitada'
            : 'atendimento_finalizado'
      const textoEvento = nextStatus === ATENDIMENTO_STATUS.EM_ANDAMENTO
        ? `✓ ${profissionalNome} iniciou o atendimento.`
        : nextStatus === ATENDIMENTO_STATUS.CHEGOU
          ? `✓ ${profissionalNome} informou que chegou ao local.`
          : nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
            ? `✓ ${profissionalNome} solicitou a finalização do atendimento.`
            : '✓ Atendimento finalizado com sucesso.'
      const patch = nextStatus === ATENDIMENTO_STATUS.EM_ANDAMENTO
        ? { iniciadoEm: agora, iniciadoPor: { id: meuId, nome: actorName } }
        : nextStatus === ATENDIMENTO_STATUS.CHEGOU
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

      await registrarMensagemSistemaConfiavel({ pedidoId, eventType: evento })
      const updates = {}
      for (const uid of [meuId, outroId]) {
        if (!uid) continue
        updates[`conversas/${uid}/${pedidoId}/pedidoStatus`] = nextStatus
        updates[`conversas/${uid}/${pedidoId}/lastText`] = textoEvento
        updates[`conversas/${uid}/${pedidoId}/mensagemPreview`] = textoEvento
        updates[`conversas/${uid}/${pedidoId}/lastAt`] = serverTimestamp()
        updates[`conversas/${uid}/${pedidoId}/updatedAt`] = serverTimestamp()
        updates[`conversas/${uid}/${pedidoId}/lastById`] = meuId
        updates[`conversas/${uid}/${pedidoId}/lastByNome`] = actorName
        updates[`conversas/${uid}/${pedidoId}/unread`] = uid !== meuId
        updates[`conversas/${uid}/${pedidoId}/status`] = nextStatus === ATENDIMENTO_STATUS.FINALIZADO ? 'arquivavel' : 'ativa'
      }

      if (outroId) {
        const notificationId = createEventNotificationId({
          type: evento,
          sourceId: pedidoId,
          toUid: outroId,
          state: nextStatus,
        })
        const notificationTitle = nextStatus === ATENDIMENTO_STATUS.EM_ANDAMENTO
          ? 'Atendimento iniciado'
          : nextStatus === ATENDIMENTO_STATUS.CHEGOU
            ? 'Seu profissional chegou'
            : nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
              ? 'Confirme a conclusão'
              : 'Serviço concluído ✅'
        const notificationMessage = nextStatus === ATENDIMENTO_STATUS.EM_ANDAMENTO
          ? `${profissionalNome} iniciou seu atendimento.`
          : nextStatus === ATENDIMENTO_STATUS.CHEGOU
            ? `${profissionalNome} informou que chegou ao local.`
            : nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
              ? `${profissionalNome} solicitou a finalização do atendimento.`
              : 'O cliente confirmou a conclusão do atendimento.'
        const notificationAction = nextStatus === ATENDIMENTO_STATUS.FINALIZADO
          ? { label: 'Ver histórico', screen: 'ver_historico', id: pedidoId }
          : { label: 'Abrir atendimento', screen: 'chat', id: pedidoId }
        const notification = {
          id: notificationId,
          eventId: notificationId,
          tipo: evento,
          titulo: notificationTitle,
          mensagem: notificationMessage,
          pedidoId,
          fromUid: meuId,
          toUid: outroId,
          lida: false,
          read: false,
          criadoEm: agora,
          action: notificationAction,
          autor: { id: meuId, nome: actorName },
        }
        updates[`notifications/${outroId}/${notificationId}`] = notification
        updates[`notificacoes/${outroId}/${notificationId}`] = notification
      }

      await update(ref(database), updates)
      if (outroId) {
        const notificationId = createEventNotificationId({
          type: evento,
          sourceId: pedidoId,
          toUid: outroId,
          state: nextStatus,
        })
        const notificationTitle = nextStatus === ATENDIMENTO_STATUS.EM_ANDAMENTO
          ? 'Atendimento iniciado'
          : nextStatus === ATENDIMENTO_STATUS.CHEGOU
            ? 'Seu profissional chegou'
            : nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
              ? 'Confirme a conclusão'
              : 'Serviço concluído ✅'
        const notificationMessage = nextStatus === ATENDIMENTO_STATUS.EM_ANDAMENTO
          ? `${profissionalNome} iniciou seu atendimento.`
          : nextStatus === ATENDIMENTO_STATUS.CHEGOU
            ? `${profissionalNome} informou que chegou ao local.`
            : nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
              ? `${profissionalNome} solicitou a finalização do atendimento.`
              : 'O cliente confirmou a conclusão do atendimento.'
        const notificationAction = nextStatus === ATENDIMENTO_STATUS.FINALIZADO
          ? { label: 'Ver histórico', screen: 'ver_historico', id: pedidoId }
          : { label: 'Abrir atendimento', screen: 'chat', id: pedidoId }
        enviarPushParaUsuario(outroId, {
          type: evento,
          pedidoId,
          conversaId: pedidoId,
          titulo: notificationTitle,
          mensagem: notificationMessage,
          prioridade: 'alta',
          action: notificationAction,
          notificationId,
          eventId: notificationId,
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
        setConclusaoAnimando(true)
        if (conclusaoTimerRef.current) clearTimeout(conclusaoTimerRef.current)
        conclusaoTimerRef.current = setTimeout(() => {
          setConclusaoAnimando(false)
          setAvaliacaoAberta(true)
        }, reduzirMovimento ? 0 : 900)
      }
      onToast?.({ type: 'success', title: 'Atendimento atualizado', message: textoEvento })
    } catch (error) {
      debugChatWarning('Erro ao avançar atendimento no chat:', error)
      onToast?.({ type: 'error', title: 'Falha no atendimento', message: error?.message || 'Tente novamente.' })
    } finally {
      setEnviando(false)
    }
  }

  async function informarAindaNaoConcluido() {
    if (enviando || anexando || gravando) return
    try {
      setEnviando(true)
      await registrarMensagem({
        texto: 'O serviço ainda não foi concluído. Vamos alinhar o que falta por aqui.',
      })
      onToast?.({
        type: 'info',
        title: 'Conclusão ainda pendente',
        message: 'O profissional foi avisado. O atendimento continua aguardando sua confirmação.',
      })
    } catch (error) {
      debugChatWarning('Erro ao informar conclusão pendente:', error)
      onToast?.({ type: 'error', title: 'Não foi possível avisar', message: 'Tente novamente.' })
    } finally {
      setEnviando(false)
    }
  }

  async function salvarAvaliacaoNoChat() {
    if (!pedido?.id || salvandoAvaliacao || pedido?.avaliacao) return
    const criadorId = String(pedido?.criador?.id || '')
    const avaliadoId = String(pedido?.aceite?.id || '')
    if (!meuId || criadorId !== String(meuId) || !avaliadoId) return

    try {
      setSalvandoAvaliacao(true)
      const payload = await saveCanonicalServiceRating({
        database,
        pedido,
        clienteId: meuId,
        clienteNome: nomeMeu,
        nota: avaliacaoNota,
        comentario: avaliacaoComentario,
      })

      const notificationId = createEventNotificationId({
        type: 'avaliacao_recebida',
        sourceId: pedido.id,
        toUid: avaliadoId,
        state: 'recebida',
      })
      const notification = {
        id: notificationId,
        eventId: notificationId,
        tipo: 'avaliacao_recebida',
        pedidoId: pedido.id,
        conversaId: pedido?.conversaId || pedido.id,
        titulo: 'Você recebeu uma avaliação ⭐',
        mensagem: 'Veja como foi seu atendimento.',
        prioridade: 'media',
        lida: false,
        read: false,
        criadoEm: payload.criadoEm,
        fromUid: meuId,
        toUid: avaliadoId,
        action: { label: 'Ver avaliações', screen: 'avaliacoes', id: pedido.id },
        autor: { id: meuId, nome: nomeMeu },
      }
      await Promise.allSettled([
        set(ref(database, `notifications/${avaliadoId}/${notificationId}`), notification),
        set(ref(database, `notificacoes/${avaliadoId}/${notificationId}`), notification),
      ])
      enviarPushParaUsuario(avaliadoId, {
        type: 'avaliacao_recebida',
        pedidoId: pedido.id,
        conversaId: pedido?.conversaId || pedido.id,
        titulo: notification.titulo,
        mensagem: notification.mensagem,
        prioridade: 'media',
        action: notification.action,
        notificationId,
        eventId: notificationId,
      })

      setAvaliacaoAberta(false)
      setAvaliacaoComentario('')
      setAgradecimentoAvaliacao(true)
      if (agradecimentoTimerRef.current) clearTimeout(agradecimentoTimerRef.current)
      agradecimentoTimerRef.current = setTimeout(() => setAgradecimentoAvaliacao(false), 2400)
    } catch (error) {
      debugChatWarning('Erro ao avaliar pelo chat:', error)
      onToast?.({ type: 'error', title: 'Falha ao avaliar', message: error?.message || 'Tente novamente.' })
    } finally {
      setSalvandoAvaliacao(false)
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
    setConfirmacaoFinalizacaoAberta(false)
    setConclusaoAnimando(false)
    setAvaliacaoAberta(false)
    setAvaliacaoNota(5)
    setAvaliacaoComentario('')
    setAgradecimentoAvaliacao(false)
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
  const acaoAtendimento = getPrimaryAttendanceAction({
    status: pedidoStatus,
    isClient: souClienteAtendimento,
    isWorker: souTrabalhadorAtendimento,
    hasRating: Boolean(pedido?.avaliacao),
  })
  const telefoneHref = getAuthorizedPhoneHref({
    publicProfile: outroUser?.publicProfile,
    pedidoStatus: pedido?.status || outroUser?.requestStatus,
    isParticipant: souClienteAtendimento || souTrabalhadorAtendimento || outroUser?.privateRequestParticipant === true,
  })
  const mostrarPainelAtendimento = Boolean(pedido && (
    acaoAtendimento
    || pedidoStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
    || pedidoStatus === ATENDIMENTO_STATUS.FINALIZADO
    || pedidoStatus === ATENDIMENTO_STATUS.CANCELADO
  ))
  const pedidoTituloChat = pedido?.titulo || pedido?.servicoTitulo || pedidoTitulo || 'Atendimento Corre Aqui'
  const pedidoValorChat = formatarValorPedido(pedido?.valor)
  const pedidoDataChat = formatarDataPedido(pedido?.atendimentoIniciadoEm || pedido?.aceitoEm || pedido?.criadoEm || pedido?.createdAt)
  const pedidoFinalizadoEm = pedido?.finalizadoEm || pedido?.atendimento?.finalizadoEm || pedido?.concluidoEm
  const pedidoFinalizadoLabel = getMsgMs(pedidoFinalizadoEm) ? formatarDataPedido(pedidoFinalizadoEm) : ''
  const categoriaMeta = getCategoryById(
    pedido?.categoriaId || pedido?.categoria || pedido?.category || pedido?.categoriaNome || pedido?.categoriaLabel
  )
  const categoriaLabel = categoriaMeta?.label || pedido?.categoriaNome || pedido?.categoriaLabel || ''
  const categoriaAccent = categoriaMeta?.accent || '#facc15'
  const categoriaSoft = categoriaMeta?.soft || '#fff7cc'
  const pedidoIcon = pedido?.categoriaIcon || pedido?.icone || '⚡'
  const guidedTimelineStep = getGuidedTimelineStep(pedido?.status)
  const sugestoesVisiveis = (souClienteAtendimento ? SUGESTOES_CLIENTE : SUGESTOES_TRABALHADOR).filter((sugestao) => {
    if (pedidoStatus === ATENDIMENTO_STATUS.CANCELADO) return false
    if (souClienteAtendimento) return true
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
            {telefoneHref ? (
              <a
                href={telefoneHref}
                className="grid h-9 w-9 place-items-center rounded-full border border-emerald-400/25 bg-emerald-500/[0.08] text-emerald-300 transition hover:bg-emerald-500/15 active:scale-95 sm:h-11 sm:w-11"
                aria-label={`Ligar para ${outroNome}`}
                title="Abrir telefone"
              >
                <IconPhone className="h-4 w-4 sm:h-5 sm:w-5" />
              </a>
            ) : null}
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

        {mostrarPainelAtendimento ? (
          <div
            className="mb-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.07] p-2.5 sm:p-3"
            data-tutorial="confirmacao-final"
          >
            <div className="flex items-start gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500/18 text-emerald-300">
                <IconCheck className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black text-white sm:text-sm">
                  {pedidoStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
                    ? souClienteAtendimento ? 'O serviço foi finalizado?' : 'Aguardando confirmação do cliente'
                    : pedidoStatus === ATENDIMENTO_STATUS.FINALIZADO
                      ? 'Atendimento concluído'
                      : pedidoStatus === ATENDIMENTO_STATUS.CANCELADO
                        ? 'Atendimento cancelado'
                        : acaoAtendimento?.label}
                </div>
                <p className="mt-0.5 text-[10px] font-semibold leading-snug text-slate-400 sm:text-xs">
                  {pedidoStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
                    ? souClienteAtendimento
                      ? 'Confirme somente se tudo combinado foi entregue.'
                      : 'O cliente recebeu o pedido e decidirá quando o serviço estiver realmente concluído.'
                    : pedidoStatus === ATENDIMENTO_STATUS.FINALIZADO
                      ? pedido?.avaliacao
                        ? `${pedidoFinalizadoLabel ? `Concluído em ${pedidoFinalizadoLabel}. ` : ''}Avaliação enviada. Esta conversa permanece disponível no histórico.`
                        : `${pedidoFinalizadoLabel ? `Concluído em ${pedidoFinalizadoLabel}. ` : ''}A conversa permanece disponível no histórico, sem novas ações operacionais.`
                      : pedidoStatus === ATENDIMENTO_STATUS.CANCELADO
                        ? 'Esta conversa permanece apenas como histórico do atendimento.'
                        : 'Avance somente quando esta etapa tiver acontecido de verdade.'}
                </p>
              </div>
            </div>

            {acaoAtendimento?.clientDecision ? (
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={informarAindaNaoConcluido}
                  disabled={enviando || anexando || gravando}
                  className="min-h-10 rounded-xl border border-white/10 bg-white/[0.06] px-2 text-xs font-black text-slate-200 hover:bg-white/10 disabled:opacity-50"
                >
                  Ainda não
                </button>
                <button
                  type="button"
                  onClick={() => finalizarAtendimento()}
                  disabled={enviando || anexando || gravando}
                  className="min-h-10 rounded-xl bg-emerald-500 px-2 text-xs font-black text-white shadow-[0_8px_20px_rgba(34,197,94,0.20)] hover:bg-emerald-400 disabled:opacity-50"
                >
                  Confirmar conclusão
                </button>
              </div>
            ) : acaoAtendimento ? (
              <button
                type="button"
                onClick={() => {
                  if (acaoAtendimento.id === 'rate') {
                    setAvaliacaoNota(5)
                    setAvaliacaoComentario('')
                    setAvaliacaoAberta(true)
                    return
                  }
                  if (acaoAtendimento.confirm) {
                    setConfirmacaoFinalizacaoAberta(true)
                    return
                  }
                  finalizarAtendimento()
                }}
                disabled={enviando || anexando || gravando || salvandoAvaliacao}
                className="mt-2.5 min-h-10 w-full rounded-xl bg-emerald-500 px-3 text-xs font-black text-white shadow-[0_8px_20px_rgba(34,197,94,0.20)] hover:bg-emerald-400 disabled:opacity-50 sm:text-sm"
              >
                {acaoAtendimento.label}
              </button>
            ) : null}
          </div>
        ) : null}

        {!pedido ? (
          <div className="mb-1.5 flex touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mb-2 sm:gap-2">
            <button
              type="button"
              onClick={chamarAtencao}
              disabled={!outroId || enviando || anexando || gravando || chamandoAtencao}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-orange-400/25 bg-orange-500/10 px-2.5 text-[10px] font-black text-white transition hover:bg-orange-500/15 active:scale-[0.97] disabled:opacity-50"
            >
              <IconBell className="h-4 w-4 text-orange-300" />
              {chamandoAtencao ? 'Enviando' : 'Chamar'}
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={!pedidoId || enviando || anexando || gravando}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/[0.08] px-2.5 text-[10px] font-black text-white transition hover:bg-blue-500/15 disabled:opacity-50"
            >
              <IconCamera className="h-4 w-4 text-blue-400" />
              Foto
            </button>
            <button
              type="button"
              onClick={gravando ? solicitarParadaGravacao : iniciarGravacao}
              disabled={!pedidoId || enviando || anexando}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-purple-400/25 bg-purple-500/[0.08] px-2.5 text-[10px] font-black text-white transition hover:bg-purple-500/15 disabled:opacity-50"
            >
              <IconMic className="h-4 w-4 text-purple-400" />
              {gravando ? 'Parar áudio' : 'Áudio'}
            </button>
          </div>
        ) : null}

        {!pedido && !gravando ? (
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

      {confirmacaoFinalizacaoAberta ? (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center bg-slate-950/82 p-4 backdrop-blur-sm">
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmar-finalizacao-titulo"
            initial={reduzirMovimento ? false : { opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduzirMovimento ? { duration: 0 } : { duration: 0.2 }}
            className="w-full max-w-sm rounded-[22px] border border-emerald-300/20 bg-[#07111f] p-4 text-white shadow-[0_28px_90px_rgba(0,0,0,0.62)]"
          >
            <div className="grid h-11 w-11 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
              <IconCheck className="h-6 w-6" />
            </div>
            <h2 id="confirmar-finalizacao-titulo" className="mt-3 text-lg font-black">
              O serviço foi concluído?
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
              Ao continuar, o cliente receberá o pedido para confirmar se tudo combinado foi entregue.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmacaoFinalizacaoAberta(false)}
                disabled={enviando}
                className="min-h-11 rounded-xl border border-white/10 bg-white/[0.06] text-sm font-black text-slate-200 hover:bg-white/10 disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmacaoFinalizacaoAberta(false)
                  finalizarAtendimento({ confirmado: true })
                }}
                disabled={enviando}
                className="min-h-11 rounded-xl bg-emerald-500 px-2 text-sm font-black text-white hover:bg-emerald-400 disabled:opacity-50"
              >
                Pedir confirmação
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}

      {conclusaoAnimando ? (
        <div className="pointer-events-none fixed inset-0 z-[100003] grid place-items-center bg-[#03101b]/88 p-4 backdrop-blur-sm">
          <motion.div
            initial={reduzirMovimento ? false : { opacity: 0, scale: 0.78 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduzirMovimento ? { duration: 0 } : { duration: 0.28, ease: 'easeOut' }}
            className="text-center"
          >
            <motion.div
              initial={reduzirMovimento ? false : { rotate: -12, scale: 0.7 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={reduzirMovimento ? { duration: 0 } : { duration: 0.42, type: 'spring', bounce: 0.3 }}
              className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-500 text-white shadow-[0_0_55px_rgba(52,211,153,0.42)]"
            >
              <IconCheck className="h-11 w-11" />
            </motion.div>
            <div className="mt-4 text-xl font-black text-white">Serviço concluído</div>
            <div className="mt-1 text-sm font-semibold text-emerald-200">Confirmação registrada com segurança.</div>
          </motion.div>
        </div>
      ) : null}

      <AvaliacaoAtendimentoModal
        pedido={avaliacaoAberta && pedido && !pedido?.avaliacao ? { ...pedido, status: ATENDIMENTO_STATUS.FINALIZADO } : null}
        nota={avaliacaoNota}
        comentario={avaliacaoComentario}
        salvando={salvandoAvaliacao}
        onNotaChange={setAvaliacaoNota}
        onComentarioChange={setAvaliacaoComentario}
        onEnviar={salvarAvaliacaoNoChat}
        onAgoraNao={() => setAvaliacaoAberta(false)}
      />

      {agradecimentoAvaliacao ? (
        <motion.div
          initial={reduzirMovimento ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[100004] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-amber-300/25 bg-slate-950 px-4 py-3 text-center shadow-[0_20px_65px_rgba(0,0,0,0.52)]"
          role="status"
        >
          <div className="font-black text-amber-300">Obrigado pela avaliação!</div>
          <div className="mt-0.5 text-xs font-semibold text-slate-300">Ela já faz parte do histórico deste atendimento.</div>
        </motion.div>
      ) : null}
    </div>
  )
}
