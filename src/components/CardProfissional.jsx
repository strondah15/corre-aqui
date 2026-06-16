'use client'

import { memo, useCallback, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { getCategoryById } from '@/constants/categories'

function safeUrl(u) {
  const s = String(u || '').trim()
  if (!s) return ''
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(s)) return s
  return ''
}

function getFotoPersonalizada(item) {
  return safeUrl(
    item?.fotoURL ||
      item?.avatarUrl ||
      item?.avatarURL ||
      item?.imagem ||
      item?.imageUrl ||
      item?.profile?.fotoURL ||
      item?.profile?.avatarUrl ||
      item?.profile?.avatarURL ||
      item?.profile?.imagem ||
      item?.profile?.imageUrl ||
      item?.perfil?.fotoURL ||
      item?.profissional?.fotoURL ||
      item?.corre?.fotoURL ||
      ''
  )
}

function getGoogleFoto(item) {
  return safeUrl(
    item?.photoURL ||
      item?.profile?.photoURL ||
      item?.perfil?.photoURL ||
      item?.profissional?.photoURL ||
      item?.corre?.photoURL ||
      ''
  )
}

function getFotoURL(item, usarGoogleFallback = true) {
  return getFotoPersonalizada(item) || (usarGoogleFallback ? getGoogleFoto(item) : '')
}

function pickText(...values) {
  return values.map((v) => String(v || '').trim()).find(Boolean) || ''
}

function formatOcupadoAte(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function formatMoney(v) {
  const s = String(v || '').trim()
  if (!s) return ''
  if (/r\$/i.test(s)) return s
  const n = Number(s.replace(/[^\d,.]/g, '').replace(',', '.'))
  if (Number.isFinite(n) && n > 0) {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  return `R$ ${s}`
}

function normalizeCategoryIds(...values) {
  const ids = values.flatMap((value) => {
    if (!value) return []
    if (Array.isArray(value)) return value
    if (typeof value === 'string') return value.split(',')
    return []
  })

  return Array.from(
    new Set(
      ids
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )
  )
}

function getAgendaStatus(item) {
  const status =
    item?.statusProfissional ||
    item?.profile?.statusProfissional ||
    item?.profissional?.statusProfissional ||
    'disponivel'
  const ocupadoAte = item?.ocupadoAte || item?.profile?.ocupadoAte || item?.profissional?.ocupadoAte || null
  const agendaAberta = item?.agendaAberta ?? item?.profile?.agendaAberta ?? item?.profissional?.agendaAberta ?? true
  const emServico = status === 'em_servico' || (!!ocupadoAte && Date.now() < Number(ocupadoAte))
  return { status, ocupadoAte, agendaAberta, emServico }
}

function CardProfissional({ item, onAbrir, onWhatsapp, onAgendar }) {
  const shouldReduceMotion = useReducedMotion()
  const profile = item?.profile || {}
  const prof = item?.profissional || profile?.profissional || {}
  const corre = item?.corre || profile?.corre || {}

  const nome = pickText(item?.nome, profile?.nome, 'Profissional')
  const emojiSalvo = pickText(item?.avatarEmoji, profile?.avatarEmoji, item?.perfil?.avatarEmoji)
  const fotoURL = getFotoURL(item, !emojiSalvo)
  const emoji = emojiSalvo || '🙂'
  const cidade = pickText(item?.profCidadeAtende, prof?.regiao, corre?.regiao, item?.cidade, profile?.cidade, 'Cidade não informada')

  const isProf = !!(item?.isProfissional || profile?.isProfissional || prof?.ativo || item?.profissional)
  const isCorre = !!(item?.isCorre || profile?.isCorre || corre?.ativo || item?.corre)
  const agendaStatus = getAgendaStatus(item)

  const tituloProf = pickText(prof?.titulo, item?.profTitulo, profile?.titulo, item?.titulo, 'Profissional local')
  const resumoProf = pickText(item?.profResumo, prof?.descricao, profile?.descricao, prof?.especialidade)
  const profExperiencia = pickText(item?.profExperiencia, prof?.experiencia)
  const preco = pickText(item?.profPrecoBase, prof?.preco, profile?.preco)

  const tituloCorre = pickText(item?.correTitulo, corre?.titulo, 'Corre rápido')
  const resumoCorre = pickText(item?.correResumo, corre?.bio, profile?.bio)
  const transporte = pickText(item?.correTransporte, corre?.transporte)
  const dispCorre = pickText(item?.correDisponibilidade, corre?.disponibilidade)
  const expCorre = pickText(item?.correExperiencia, corre?.experiencia)
  const whats = pickText(item?.profWhats, prof?.whatsapp, profile?.whatsapp)

  const servicosFeitos = Number(
    item?.servicosCorre ||
      item?.['serviçosCorre'] ||
      item?.servicosProf ||
      item?.['serviçosProf'] ||
      profile?.servicosCorre ||
      profile?.['serviçosCorre'] ||
      0
  )
  const notaMedia = Number(
    item?.avaliacaoMedia ||
      item?.notaMedia ||
      item?.trustStats?.notaMedia ||
      profile?.avaliacaoMedia ||
      profile?.notaMedia ||
      0
  )
  const perfilVerificado = !!(
    item?.verificado ||
    item?.verified ||
    item?.perfilVerificado ||
    item?.trust?.verificado ||
    profile?.verificado ||
    profile?.verified ||
    (nome && cidade && (fotoURL || emoji) && (servicosFeitos > 0 || isProf || isCorre))
  )

  const servicos = useMemo(() => {
    const out = []

    if (isCorre) {
      out.push({
        id: 'corre',
        label: 'Corre',
        title: tituloCorre,
        body: resumoCorre || transporte || dispCorre || 'Disponível para bicos, entregas e serviços rápidos.',
        accent: 'amber',
      })
    }

    if (isProf) {
      out.push({
        id: 'profissional',
        label: 'Profissional',
        title: tituloProf,
        body: resumoProf || profExperiencia || 'Atendimento profissional na região.',
        accent: 'blue',
      })
    }

    if (!out.length) {
      out.push({
        id: 'geral',
        label: 'Atendimento',
        title: tituloProf,
        body: resumoProf || resumoCorre || 'Perfil disponível para atendimento local.',
        accent: 'slate',
      })
    }

    return out
  }, [isCorre, isProf, tituloCorre, resumoCorre, transporte, dispCorre, tituloProf, resumoProf, profExperiencia])

  const categorias = useMemo(() => {
    const ids = normalizeCategoryIds(
      item?.profCategorias,
      profile?.profCategorias,
      prof?.profCategorias,
      prof?.categorias,
      item?.correCategorias,
      profile?.correCategorias,
      corre?.categorias,
      item?.servicos,
      profile?.servicos
    )

    return ids
      .map((id) => getCategoryById(id) || { id, label: id.replace(/_/g, ' '), emoji: '' })
      .slice(0, 3)
  }, [corre?.categorias, item?.correCategorias, item?.profCategorias, item?.servicos, prof?.categorias, prof?.profCategorias, profile?.correCategorias, profile?.profCategorias, profile?.servicos])

  const detalhes = [
    preco ? { label: 'Preço', value: formatMoney(preco) } : null,
    transporte ? { label: 'Transporte', value: transporte } : null,
    dispCorre ? { label: 'Disponibilidade', value: dispCorre } : null,
    profExperiencia || expCorre ? { label: 'Experiência', value: profExperiencia || expCorre } : null,
  ].filter(Boolean)

  const statusLabel = agendaStatus.emServico ? 'Em serviço' : agendaStatus.agendaAberta ? 'Disponível' : 'Agenda fechada'
  const statusTone = agendaStatus.emServico ? 'amber' : agendaStatus.agendaAberta ? 'emerald' : 'slate'
  const avatarStyle = useMemo(
    () => (fotoURL ? { backgroundImage: `url(${JSON.stringify(fotoURL)})` } : undefined),
    [fotoURL]
  )
  const handleAbrir = useCallback(() => onAbrir?.(item), [item, onAbrir])
  const handleAgendar = useCallback(() => onAgendar?.(item), [item, onAgendar])
  const handleWhatsapp = useCallback(() => onWhatsapp?.(item), [item, onWhatsapp])

  return (
    <motion.article
      initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? undefined : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      whileHover={shouldReduceMotion ? undefined : { y: -4 }}
      className="group relative flex h-full min-h-[248px] flex-col overflow-hidden rounded-[18px] border border-slate-200 bg-white p-2.5 text-slate-950 shadow-[0_12px_30px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/[0.03] [content-visibility:auto] [contain-intrinsic-size:360px] md:min-h-[360px] md:rounded-[28px] md:p-4 md:shadow-[0_18px_48px_rgba(15,23,42,0.14)]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-slate-50 via-emerald-50/70 to-transparent md:h-24" />

      <div className="relative flex items-start gap-2.5 md:gap-3">
        <div
          className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white bg-slate-100 bg-cover bg-center text-xl shadow-[0_10px_22px_rgba(15,23,42,0.14)] ring-[3px] ring-slate-100 md:h-16 md:w-16 md:rounded-[22px] md:text-3xl md:shadow-[0_14px_34px_rgba(15,23,42,0.16)] md:ring-4"
          style={avatarStyle}
          aria-label={nome}
        >
          {fotoURL ? <span className="sr-only">{nome}</span> : emoji}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div
                className={[
                  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ring-1 md:px-2.5 md:py-1 md:text-[10px] md:tracking-[0.14em]',
                  statusTone === 'emerald' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : '',
                  statusTone === 'amber' ? 'bg-amber-50 text-amber-800 ring-amber-200' : '',
                  statusTone === 'slate' ? 'bg-slate-100 text-slate-600 ring-slate-200' : '',
                ].join(' ')}
              >
                <span className={statusTone === 'emerald' ? 'h-1.5 w-1.5 rounded-full bg-emerald-500' : statusTone === 'amber' ? 'h-1.5 w-1.5 rounded-full bg-amber-500' : 'h-1.5 w-1.5 rounded-full bg-slate-400'} />
                {statusLabel}
              </div>
              <h3 className="mt-1.5 truncate text-base font-black leading-tight text-slate-950 md:mt-2 md:text-lg">{nome}</h3>
              <p className="mt-1 truncate text-xs font-semibold text-slate-500">{cidade}</p>
            </div>

            {perfilVerificado ? (
              <span className="shrink-0 rounded-full bg-cyan-50 px-2 py-0.5 text-[9px] font-black text-cyan-800 ring-1 ring-cyan-200 md:px-2.5 md:py-1 md:text-[10px]">
                ✓ Verificado
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative mt-2 grid grid-cols-3 gap-1.5 md:mt-4 md:gap-2">
        <div className="rounded-xl bg-slate-50 px-2 py-2 text-center ring-1 ring-slate-200 md:rounded-2xl md:py-2.5">
          <div className="text-sm font-black md:text-base">{Number.isFinite(notaMedia) && notaMedia > 0 ? notaMedia.toFixed(1) : '--'}</div>
          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Nota</div>
        </div>
        <div className="rounded-xl bg-slate-50 px-2 py-2 text-center ring-1 ring-slate-200 md:rounded-2xl md:py-2.5">
          <div className="text-sm font-black md:text-base">{servicosFeitos || 0}</div>
          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Serviços</div>
        </div>
        <div className="rounded-xl bg-slate-50 px-2 py-2 text-center ring-1 ring-slate-200 md:rounded-2xl md:py-2.5">
          <div className="truncate text-sm font-black md:text-base">{agendaStatus.agendaAberta ? 'Aberta' : 'Fechada'}</div>
          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Agenda</div>
        </div>
      </div>

      {categorias.length ? (
        <div className="relative mt-2.5 flex flex-wrap gap-1.5 md:mt-3">
          {categorias.map((cat) => (
            <span
              key={cat.id}
              className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-black text-slate-600 md:px-2.5 md:py-1 md:text-[10px]"
            >
              {cat.emoji ? `${cat.emoji} ` : ''}{cat.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="relative mt-2 space-y-1.5 md:mt-4 md:space-y-2">
        {servicos.map((servico, idx) => (
          <div
            key={servico.id}
            className={[
              idx > 0 ? 'hidden md:block' : '',
              'rounded-xl border p-2 md:rounded-2xl md:p-3',
              servico.accent === 'amber' ? 'border-amber-200 bg-amber-50/85' : '',
              servico.accent === 'blue' ? 'border-blue-200 bg-blue-50/85' : '',
              servico.accent === 'slate' ? 'border-slate-200 bg-slate-50' : '',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-2">
              <div
                className={[
                  'text-xs font-black uppercase tracking-[0.08em]',
                  servico.accent === 'amber' ? 'text-amber-800' : '',
                  servico.accent === 'blue' ? 'text-blue-800' : '',
                  servico.accent === 'slate' ? 'text-slate-600' : '',
                ].join(' ')}
              >
                {servico.label}
              </div>
              {servico.id === 'profissional' && preco ? (
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-blue-800 ring-1 ring-blue-200">
                  {formatMoney(preco)}
                </span>
              ) : null}
            </div>
            <div className="mt-1 truncate text-xs font-black text-slate-950 md:text-sm">{servico.title}</div>
            <p className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-snug text-slate-600 md:mt-1 md:text-xs md:leading-relaxed">{servico.body}</p>
          </div>
        ))}
      </div>

      {detalhes.length ? (
        <div className="relative mt-2.5 hidden gap-1.5 md:mt-3 md:grid">
          {detalhes.slice(0, 3).map((d) => (
            <div key={`${d.label}-${d.value}`} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] md:gap-3 md:rounded-2xl md:px-3 md:py-2 md:text-[11px]">
              <span className="font-bold text-slate-400">{d.label}</span>
              <span className="truncate font-black text-slate-800">{d.value}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="relative mt-auto flex flex-col gap-1.5 pt-2.5 md:gap-2 md:pt-4">
        {agendaStatus.emServico ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-black text-amber-800 md:rounded-2xl md:px-3 md:py-2 md:text-xs">
            Em serviço {agendaStatus.ocupadoAte ? `até ${formatOcupadoAte(agendaStatus.ocupadoAte)}` : ''}
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleAbrir}
          className="h-10 rounded-xl bg-slate-950 px-3 text-xs font-black text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)] transition hover:bg-black active:scale-[0.98] md:h-11 md:rounded-2xl md:px-4 md:text-sm md:shadow-[0_12px_28px_rgba(15,23,42,0.18)]"
        >
          Ver ficha técnica
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleAgendar}
            disabled={!agendaStatus.agendaAberta}
            className="h-9 rounded-xl border border-violet-200 bg-violet-50 px-2.5 text-[11px] font-black text-violet-700 transition hover:bg-violet-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 md:h-10 md:rounded-2xl md:px-3 md:text-xs"
            title={agendaStatus.agendaAberta ? 'Agendar serviço' : 'Agenda fechada'}
          >
            Agendar
          </button>
          <button
            type="button"
            onClick={handleWhatsapp}
            disabled={!whats}
            className="h-9 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-black text-emerald-700 transition hover:bg-emerald-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 md:h-10 md:rounded-2xl md:px-3 md:text-xs"
            title={whats ? 'Chamar no WhatsApp' : 'WhatsApp não informado'}
          >
            WhatsApp
          </button>
        </div>
      </div>
    </motion.article>
  )
}

export default memo(CardProfissional)
