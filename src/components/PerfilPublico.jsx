'use client'

import { useMemo, useState } from 'react'
import { getCategoryById } from '@/constants/categories'
import ModalAgenda from './ModalAgenda'

function pickText(...values) {
  return values.map((v) => String(v || '').trim()).find(Boolean) || ''
}

function safeUrl(value) {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(url)) return url
  return ''
}

function normalizePortfolioFotos(item = {}) {
  const raw = [
    ...(Array.isArray(item.fotos) ? item.fotos : []),
    ...(Array.isArray(item.photos) ? item.photos : []),
    ...(Array.isArray(item.imagens) ? item.imagens : []),
    item.fotoURL,
    item.imageURL,
    item.imagemURL,
    item.photoURL,
  ]

  return Array.from(new Set(raw.map((foto) => safeUrl(foto)).filter(Boolean))).slice(0, 5)
}

function normalizeList(...values) {
  return values
    .flatMap((value) => {
      if (!value) return []
      if (Array.isArray(value)) return value
      if (typeof value === 'object') return Object.values(value)
      return []
    })
    .filter(Boolean)
}

function normalizeCategoryIds(...values) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => {
          if (!value) return []
          if (Array.isArray(value)) return value
          if (typeof value === 'string') return value.split(',')
          return []
        })
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )
  )
}

function normalizeWhatsapp(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('55') ? digits : `55${digits}`
}

function formatMoney(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/r\$/i.test(raw)) return raw

  const number = Number(raw.replace(/[^\d,.]/g, '').replace(',', '.'))
  if (Number.isFinite(number) && number > 0) {
    return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  return `R$ ${raw}`
}

function formatOcupadoAte(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function getInitials(name) {
  const initials = String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')

  return initials.toUpperCase() || 'CA'
}

function MetricBox({ value, label }) {
  return (
    <div className="min-w-0 rounded-[14px] border border-slate-100 bg-white px-2 py-2 text-center shadow-[0_8px_22px_rgba(15,23,42,0.05)]">
      <div className="truncate text-base font-black leading-none text-slate-950">{value}</div>
      <div className="mt-1 truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</div>
    </div>
  )
}

function InfoRow({ icon, label, value, tone = 'blue' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    slate: 'bg-slate-100 text-slate-600',
  }

  return (
    <div className="flex items-center gap-3 rounded-[13px] border border-slate-100 bg-white px-3 py-2 shadow-[0_7px_18px_rgba(15,23,42,0.04)]">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm ${tones[tone] || tones.blue}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-bold text-slate-500">{label}</div>
        <div className="truncate text-xs font-black text-slate-900">{value || 'Não informado'}</div>
      </div>
    </div>
  )
}

function ActionLine({ icon, label, onClick, href, disabled }) {
  const className = [
    'flex h-10 w-full items-center justify-between rounded-[13px] border border-slate-100 bg-white px-3 text-left text-xs font-black text-slate-800 shadow-[0_7px_18px_rgba(15,23,42,0.04)] transition active:scale-[0.98]',
    disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-blue-50',
  ].join(' ')

  const content = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span className="text-slate-400">›</span>
    </>
  )

  if (href && !disabled) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {content}
      </a>
    )
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {content}
    </button>
  )
}

function RatingStars({ nota }) {
  const n = Number(nota || 0)
  return (
    <div className="flex items-center gap-0.5 text-amber-400" aria-label={`Nota ${n || 0}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= Math.round(n) ? 'text-amber-400' : 'text-slate-200'}>
          ★
        </span>
      ))}
    </div>
  )
}

function ServiceOfferCard({ item, user, dados, onPedirServico, abrirAgenda }) {
  const foto = item.fotoURL || item.fotos?.[0] || ''

  return (
    <article className="overflow-hidden rounded-[18px] border border-slate-100 bg-white p-2.5 shadow-[0_10px_28px_rgba(15,23,42,0.07)]">
      <div className="flex gap-3">
        <div
          className="grid h-24 w-24 shrink-0 place-items-center rounded-[16px] bg-gradient-to-br from-blue-50 to-amber-50 bg-cover bg-center text-2xl"
          style={foto ? { backgroundImage: `url(${JSON.stringify(foto)})` } : undefined}
          aria-label="Foto do serviço"
        >
          {!foto ? '⚡' : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-black leading-tight text-slate-950">{item.titulo}</div>
          {item.descricao ? (
            <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-snug text-slate-500">{item.descricao}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.valor ? <span className="rounded-full bg-[#ffd91a] px-2 py-1 text-[10px] font-black text-blue-950">{item.valor}</span> : null}
            {item.categoria ? <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">{item.categoria}</span> : null}
            {item.atendeDomicilio ? <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">Domicílio</span> : null}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onPedirServico?.(user)}
          className="h-9 rounded-[13px] bg-blue-700 px-3 text-xs font-black text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] transition active:scale-[0.98]"
        >
          Chamar
        </button>
        {dados.whatsappLimpo ? (
          <a
            href={`https://wa.me/${dados.whatsappLimpo}`}
            target="_blank"
            rel="noreferrer"
            className="grid h-9 place-items-center rounded-[13px] border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700 transition active:scale-[0.98]"
          >
            WhatsApp
          </a>
        ) : (
          <button
            type="button"
            onClick={abrirAgenda}
            disabled={!dados.agendaAberta}
            className="h-9 rounded-[13px] border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 disabled:opacity-50"
          >
            Agenda
          </button>
        )}
      </div>
    </article>
  )
}

export default function PerfilPublico({ user, onClose, onPedirServico, onAgendar }) {
  const [openAgenda, setOpenAgenda] = useState(false)

  const dados = useMemo(() => {
    if (!user) return null

    const profile = user.profile || {}
    const prof = user.profissional || profile.profissional || {}
    const corre = user.corre || profile.corre || {}
    const trustStats = user.trustStats || profile.trustStats || {}

    const profissionalId = user.uid || user.id || user.profissionalId
    const nome = pickText(user.nome, profile.nome, user.profissionalNome, 'Usuário')
    const cidade = pickText(user.profCidadeAtende, user.cidade, profile.cidade, prof.regiao, corre.regiao, 'Local não informado')
    const fotoPersonalizada = safeUrl(user.fotoURL || profile.fotoURL || user.avatarURL || profile.avatarURL || '')
    const avatarEmojiSalvo = pickText(user.avatarEmoji, profile.avatarEmoji)
    const fotoGoogle = safeUrl(user.photoURL || profile.photoURL || '')
    const fotoURL = fotoPersonalizada || (!avatarEmojiSalvo ? fotoGoogle : '')
    const avatarEmoji = avatarEmojiSalvo || getInitials(nome)
    const bio = pickText(user.bio, profile.bio, user.profResumo, prof.descricao, corre.bio)

    const isCorre = !!(user.isCorre || profile.isCorre || corre?.ativo || user.corre)
    const isProfissional = !!(user.isProfissional || profile.isProfissional || prof?.ativo || user.profissional)
    const servicosFeitos = Number(
      user.servicosCorre ||
        user.serviçosCorre ||
        user.servicosProf ||
        user.serviçosProf ||
        profile.servicosCorre ||
        profile.serviçosCorre ||
        trustStats.servicos ||
        0
    )
    const notaMedia = Number(user.avaliacaoMedia || user.notaMedia || profile.avaliacaoMedia || profile.notaMedia || trustStats.notaMedia || 0)
    const avaliacoes = normalizeList(user.avaliacoes, profile.avaliacoes, user.reviews, profile.reviews, trustStats.avaliacoes)
      .map((a) => ({
        nota: Number(a?.nota || a?.rating || a?.stars || 0),
        comentario: pickText(a?.comentario, a?.comentarioCliente, a?.texto, a?.message),
        autor: pickText(a?.autor?.nome, a?.clienteNome, a?.nome, 'Cliente'),
      }))
      .filter((a) => a.nota || a.comentario)
      .slice(0, 3)
    const totalAvaliacoes = Number(user.totalAvaliacoes || profile.totalAvaliacoes || trustStats.totalAvaliacoes || avaliacoes.length || 0)
    const perfilVerificado = !!(
      user.verificado ||
      user.verified ||
      profile.verificado ||
      profile.verified ||
      user.perfilVerificado ||
      profile.perfilVerificado ||
      trustStats.verificado ||
      (nome && cidade && (fotoURL || avatarEmoji) && (servicosFeitos > 0 || isCorre || isProfissional))
    )

    const agendaAberta = user.agendaAberta ?? profile.agendaAberta ?? prof.agendaAberta ?? true
    const statusProfissional = user.statusProfissional || profile.statusProfissional || prof.statusProfissional || 'disponivel'
    const ocupadoAte = user.ocupadoAte || profile.ocupadoAte || prof.ocupadoAte || null
    const emServico = statusProfissional === 'em_servico' || (!!ocupadoAte && Date.now() < Number(ocupadoAte))

    const whatsapp = pickText(prof?.whatsapp, user.profWhats, profile.whatsapp, user.whatsapp)
    const whatsappLimpo = normalizeWhatsapp(whatsapp)

    const profTitulo = pickText(prof?.titulo, user.profTitulo, profile.titulo, 'Profissional local')
    const profPreco = pickText(user.profPrecoBase, prof?.preco, profile.preco)
    const profExperiencia = pickText(user.profExperiencia, prof?.experiencia)
    const profCategoriasRaw = user.profCategorias || prof.categorias || profile.profCategorias || []
    const profCategorias = Array.isArray(profCategoriasRaw)
      ? profCategoriasRaw.filter(Boolean).join(', ')
      : String(profCategoriasRaw || '').trim()

    const portfolioRaw = normalizeList(
      user.profPortfolio,
      profile.profPortfolio,
      user.portfolio,
      profile.portfolio,
      prof.portfolio,
      prof.profPortfolio
    )
      .map((item, index) => {
        const categoriaId = pickText(item?.categoriaId, item?.categoryId)
        const categoriaMeta = getCategoryById(categoriaId)
        const categoriaNome = pickText(item?.categoriaNome, item?.categoryName, item?.categoria, item?.category, categoriaMeta?.label)
        const nomeServico = pickText(item?.nome, item?.titulo, item?.title, 'Trabalho cadastrado')
        const preco = pickText(item?.preco, item?.valor, item?.price)
        const faixaPreco = pickText(item?.faixaPreco, item?.valor, item?.priceRange, preco)
        const fotos = normalizePortfolioFotos(item)

        return {
          id: String(item?.id || item?.key || `portfolio_${index}`),
          nome: nomeServico,
          titulo: nomeServico,
          descricao: pickText(item?.descricao, item?.description),
          preco,
          faixaPreco,
          valor: faixaPreco || preco,
          categoriaId,
          categoriaNome,
          categoria: categoriaNome,
          tempoMedio: pickText(item?.tempoMedio, item?.tempo, item?.duration),
          regiao: pickText(item?.regiao, item?.regiaoAtendimento, item?.region, cidade),
          atendeDomicilio: item?.atendeDomicilio ?? item?.domicilio ?? true,
          urgente: item?.urgente ?? item?.urgent ?? false,
          ativo: item?.ativo ?? item?.active ?? true,
          fotos,
          fotoURL: fotos[0] || '',
        }
      })
      .filter((item) => item.ativo !== false && (item.titulo || item.descricao || item.valor || item.categoria || item.fotos.length))

    const portfolio = Array.from(
      portfolioRaw.reduce((acc, item) => {
        const key = item.id || `${item.titulo}_${item.categoria}_${item.valor}_${item.fotoURL}`
        const current = acc.get(key)

        if (!current) {
          acc.set(key, item)
          return acc
        }

        const fotos = Array.from(new Set([...(current.fotos || []), ...(item.fotos || [])])).slice(0, 5)
        acc.set(key, {
          ...current,
          ...item,
          descricao: item.descricao || current.descricao,
          valor: item.valor || current.valor,
          preco: item.preco || current.preco,
          faixaPreco: item.faixaPreco || current.faixaPreco,
          categoria: item.categoria || current.categoria,
          categoriaNome: item.categoriaNome || current.categoriaNome,
          tempoMedio: item.tempoMedio || current.tempoMedio,
          regiao: item.regiao || current.regiao,
          fotos,
          fotoURL: fotos[0] || item.fotoURL || current.fotoURL || '',
        })
        return acc
      }, new Map()).values()
    ).slice(0, 8)

    const correTitulo = pickText(user.correTitulo, corre?.titulo, 'Corre rápido')
    const correTransporte = pickText(user.correTransporte, corre?.transporte)
    const correDisponibilidade = pickText(user.correDisponibilidade, corre?.disponibilidade)
    const correExperiencia = pickText(user.correExperiencia, corre?.experiencia)

    const categorias = normalizeCategoryIds(
      user.profCategorias,
      profile.profCategorias,
      prof.categorias,
      user.correCategorias,
      profile.correCategorias,
      corre.categorias,
      user.servicos,
      profile.servicos
    )
      .map((id) => getCategoryById(id) || { id, label: id.replace(/_/g, ' '), emoji: '' })
      .slice(0, 6)

    return {
      profissionalId,
      nome,
      cidade,
      fotoURL,
      avatarEmoji,
      bio,
      isCorre,
      isProfissional,
      servicosFeitos,
      notaMedia,
      avaliacoes,
      totalAvaliacoes,
      perfilVerificado,
      agendaAberta,
      ocupadoAte,
      emServico,
      whatsappLimpo,
      profTitulo,
      profPreco,
      profExperiencia,
      profCategorias,
      portfolio,
      correTitulo,
      correTransporte,
      correDisponibilidade,
      correExperiencia,
      categorias,
    }
  }, [user])

  if (!user || !dados) return null

  const abrirAgenda = () => {
    if (onAgendar) {
      onAgendar(user)
      return
    }
    setOpenAgenda(true)
  }

  const irParaServicos = () => {
    if (typeof document === 'undefined') return
    document.getElementById('perfil-servicos-oferecidos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const compartilharPerfil = () => {
    if (typeof window === 'undefined') return
    const text = `${dados.nome} no Corre Aqui`

    if (navigator.share) {
      navigator.share({ title: text, text, url: window.location.href }).catch(() => {})
      return
    }

    navigator.clipboard?.writeText(window.location.href).catch(() => {})
  }

  const notaLabel = Number.isFinite(dados.notaMedia) && dados.notaMedia > 0 ? dados.notaMedia.toFixed(1) : '--'
  const statusLabel = dados.emServico
    ? `Em serviço ${dados.ocupadoAte ? `até ${formatOcupadoAte(dados.ocupadoAte)}` : ''}`.trim()
    : 'Disponível agora'
  const tituloAtuacao = dados.isCorre && !dados.isProfissional ? dados.correTitulo : dados.profTitulo
  const tipoLabel = dados.isCorre && dados.isProfissional ? 'Corre rápido / Profissional' : dados.isCorre ? 'Corre rápido' : 'Profissional'
  const sobre = dados.bio || `${dados.nome} atende como ${tituloAtuacao || tipoLabel}. Combine detalhes, horário e valor pelo Corre Aqui.`
  const whatsappHref = dados.whatsappLimpo ? `https://wa.me/${dados.whatsappLimpo}` : ''

  return (
    <div className="fixed inset-0 z-[99999]">
      <div className="absolute inset-0 bg-slate-950/82 backdrop-blur-sm" onClick={onClose} />

      <div className="absolute inset-x-3 bottom-3 mx-auto max-h-[94dvh] max-w-[430px] overflow-y-auto rounded-[28px] bg-slate-50 text-slate-950 shadow-[0_30px_100px_rgba(2,6,23,0.55)] md:bottom-auto md:top-1/2 md:-translate-y-1/2">
        <section className="rounded-[28px] bg-white p-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-full text-xl font-black text-slate-900 transition hover:bg-slate-100 active:scale-95"
              aria-label="Voltar"
            >
              ←
            </button>
            <div className="text-sm font-black text-slate-950">{dados.isCorre && !dados.isProfissional ? 'Ficha do corre' : 'Ficha do profissional'}</div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={compartilharPerfil}
                className="grid h-9 w-9 place-items-center rounded-full text-base font-black text-slate-700 transition hover:bg-slate-100 active:scale-95"
                aria-label="Compartilhar perfil"
              >
                ↗
              </button>
              <button
                type="button"
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full text-xl font-black text-slate-700 transition hover:bg-slate-100 active:scale-95"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-[20px] border border-slate-100 bg-white p-3 shadow-[0_12px_32px_rgba(15,23,42,0.07)]">
            <div className="flex items-center gap-3">
              <div
                className="grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-full bg-blue-50 bg-cover bg-center text-lg font-black text-blue-700 ring-4 ring-slate-100"
                style={dados.fotoURL ? { backgroundImage: `url(${JSON.stringify(dados.fotoURL)})` } : undefined}
                aria-label={dados.nome}
              >
                {dados.fotoURL ? <span className="sr-only">{dados.nome}</span> : dados.avatarEmoji}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h2 className="truncate text-base font-black text-slate-950">{dados.nome}</h2>
                  {dados.perfilVerificado ? <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-blue-600 text-[10px] font-black text-white">✓</span> : null}
                </div>
                <div className="mt-0.5 truncate text-xs font-semibold text-slate-500">{tituloAtuacao}</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs font-black text-emerald-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]" />
                  {statusLabel}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <RatingStars nota={dados.notaMedia} />
                  <span className="text-xs font-bold text-slate-600">{notaLabel}</span>
                  {dados.totalAvaliacoes > 0 ? <span className="text-xs font-semibold text-slate-400">({dados.totalAvaliacoes})</span> : null}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <MetricBox value={notaLabel} label="Nota" />
            <MetricBox value={dados.portfolio.length || dados.servicosFeitos || 0} label="Serviços" />
            <MetricBox value={dados.totalAvaliacoes || 0} label="Avaliações" />
          </div>

          <section className="mt-4">
            <div className="text-xs font-black text-slate-950">Sobre</div>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{sobre}</p>
          </section>

          <div className="mt-3 space-y-2">
            <InfoRow icon="📍" label="Região" value={dados.cidade} tone="blue" />
            <InfoRow icon={dados.emServico ? '⚡' : '✓'} label="Status" value={statusLabel} tone={dados.emServico ? 'amber' : 'emerald'} />
            <InfoRow icon="📅" label="Agenda" value={dados.agendaAberta ? 'Aberta para pedidos' : 'Fechada no momento'} tone="slate" />
            <InfoRow icon="🛡" label="Perfil" value={dados.perfilVerificado ? 'Verificado' : 'Em validação'} tone="blue" />
          </div>

          {(dados.correTransporte || dados.correDisponibilidade || dados.profCategorias || dados.profPreco || dados.profExperiencia || dados.categorias.length) ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-[10px] font-black text-yellow-800">{tipoLabel}</span>
              {dados.profPreco ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">{formatMoney(dados.profPreco)}</span> : null}
              {dados.profExperiencia ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{dados.profExperiencia}</span> : null}
              {dados.correTransporte ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700">{dados.correTransporte}</span> : null}
              {dados.categorias.slice(0, 3).map((cat) => (
                <span key={cat.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
                  {cat.emoji ? `${cat.emoji} ` : ''}{cat.label}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={irParaServicos}
              disabled={!dados.portfolio.length}
              className="h-11 rounded-[15px] border border-blue-100 bg-blue-50 px-3 text-xs font-black text-blue-700 transition active:scale-[0.98] disabled:opacity-50"
            >
              Ver serviços
            </button>
            <button
              type="button"
              onClick={abrirAgenda}
              disabled={!dados.agendaAberta}
              className="h-11 rounded-[15px] bg-blue-700 px-3 text-xs font-black text-white shadow-[0_12px_28px_rgba(37,99,235,0.24)] transition active:scale-[0.98] disabled:opacity-50"
            >
              Solicitar agendamento
            </button>
          </div>
        </section>

        <section id="perfil-servicos-oferecidos" className="mt-3 rounded-[28px] bg-white p-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-full text-xl font-black text-slate-900 transition hover:bg-slate-100 active:scale-95"
              aria-label="Voltar"
            >
              ←
            </button>
            <div className="text-sm font-black text-slate-950">Serviços oferecidos</div>
            <span className="grid h-8 min-w-8 place-items-center rounded-full bg-[#ffd91a] px-2 text-xs font-black text-blue-950">
              {dados.portfolio.length}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {dados.portfolio.length ? (
              dados.portfolio.map((item) => (
                <ServiceOfferCard
                  key={item.id}
                  item={item}
                  user={user}
                  dados={dados}
                  onPedirServico={onPedirServico}
                  abrirAgenda={abrirAgenda}
                />
              ))
            ) : (
              <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs font-bold text-slate-500">
                Este perfil ainda não publicou serviços no portfólio.
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2">
            <div className="text-xs font-black text-slate-950">Ações</div>
            <ActionLine icon="🧾" label="Criar pedido para este perfil" onClick={() => onPedirServico?.(user)} />
            <ActionLine icon="📅" label="Solicitar agendamento" onClick={abrirAgenda} disabled={!dados.agendaAberta} />
            <ActionLine icon="☘" label="Chamar no WhatsApp" href={whatsappHref} disabled={!whatsappHref} />
          </div>
        </section>

        <ModalAgenda
          open={openAgenda}
          profissional={user}
          onClose={() => setOpenAgenda(false)}
        />
      </div>
    </div>
  )
}
