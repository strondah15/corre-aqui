'use client'

import { useRef } from 'react'
import { PROFESSIONAL_SERVICE_PHOTO_STATUS } from '@/lib/professionalPortfolioUiState'

const inputClass = 'mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-blue-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-blue-100 dark:focus:border-blue-500 dark:focus:ring-blue-950'

function Field({ label, children, hint }) {
  return (
    <label className="block text-xs font-black text-slate-600 dark:text-slate-300">
      {label}
      {children}
      {hint ? <span className="mt-1 block text-[10px] font-semibold text-slate-400">{hint}</span> : null}
    </label>
  )
}

function PhotoStatus({ photo }) {
  if (photo.status === PROFESSIONAL_SERVICE_PHOTO_STATUS.UPLOADING) {
    return `Enviando ${Math.max(1, Number(photo.progress || 0))}%`
  }
  if (photo.status === PROFESSIONAL_SERVICE_PHOTO_STATUS.FAILED) return 'Falhou'
  if (photo.status === PROFESSIONAL_SERVICE_PHOTO_STATUS.UPLOADED) return 'Pronta'
  return 'Prévia'
}

export default function ProfessionalServiceForm({
  mode = 'create',
  draft,
  photos = [],
  categories = [],
  submitting = false,
  photoBusy = false,
  errorMessage = '',
  successMessage = '',
  blockerMessage = '',
  onFieldChange,
  onSelectFiles,
  onRemovePhoto,
  onRetryPhoto,
  onSubmit,
  onCancel,
}) {
  const fileInputRef = useRef(null)
  const atPhotoLimit = photos.length >= 5

  return (
    <section className="rounded-[22px] border border-blue-100 bg-white p-3 shadow-[0_16px_40px_rgba(15,23,42,0.10)] dark:border-blue-950 dark:bg-slate-900 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-blue-950 dark:text-blue-100">
            {mode === 'edit' ? 'Editar serviço' : 'Novo serviço'}
          </h3>
          <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            As alterações só aparecem depois da confirmação do servidor.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-lg font-black text-slate-500 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
          aria-label="Fechar formulário"
        >
          ×
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome do serviço">
          <input
            value={draft.nome}
            onChange={(event) => onFieldChange('nome', event.target.value)}
            placeholder="Ex: Instalação elétrica"
            maxLength={140}
            autoComplete="off"
            className={inputClass}
          />
        </Field>

        <Field label="Categoria">
          <select
            value={draft.categoriaId}
            onChange={(event) => {
              const category = categories.find((item) => item.id === event.target.value)
              onFieldChange('categoriaId', event.target.value)
              onFieldChange('categoriaNome', category?.label || '')
            }}
            className={inputClass}
          >
            <option value="">Selecione</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Preço ou faixa de preço" hint="Ex: A partir de R$ 80">
          <input
            value={draft.faixaPreco}
            onChange={(event) => onFieldChange('faixaPreco', event.target.value)}
            placeholder="A combinar"
            maxLength={120}
            inputMode="decimal"
            className={inputClass}
          />
        </Field>

        <Field label="Descrição">
          <textarea
            value={draft.descricao}
            onChange={(event) => onFieldChange('descricao', event.target.value)}
            placeholder="Explique o que está incluído"
            maxLength={2000}
            rows={3}
            className={`${inputClass} resize-y py-3`}
          />
        </Field>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black text-blue-950 dark:text-blue-100">Fotos</div>
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Até 5 fotos da galeria</div>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={submitting || photoBusy || atPhotoLimit}
            className="min-h-10 rounded-xl bg-blue-700 px-4 text-xs font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {photoBusy ? 'Enviando foto...' : atPhotoLimit ? 'Limite atingido' : 'Escolher fotos'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
            className="sr-only"
            onChange={(event) => {
              const files = Array.from(event.target.files || [])
              event.target.value = ''
              if (files.length) onSelectFiles(files)
            }}
          />
        </div>

        {photos.length ? (
          <div className="mt-3 grid grid-cols-3 gap-2 min-[420px]:grid-cols-5">
            {photos.map((photo) => (
              <div key={photo.key} className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.previewUrl || photo.url} alt="" className="h-full w-full object-cover" />
                <span className={[
                  'absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[8px] font-black text-white',
                  photo.status === PROFESSIONAL_SERVICE_PHOTO_STATUS.FAILED
                    ? 'bg-rose-600'
                    : photo.status === PROFESSIONAL_SERVICE_PHOTO_STATUS.UPLOADED
                      ? 'bg-emerald-600'
                      : 'bg-blue-700',
                ].join(' ')}>
                  <PhotoStatus photo={photo} />
                </span>
                <button
                  type="button"
                  onClick={() => onRemovePhoto(photo.key)}
                  disabled={submitting || photo.status === PROFESSIONAL_SERVICE_PHOTO_STATUS.UPLOADING}
                  className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-full bg-slate-950/80 text-sm font-black text-white disabled:opacity-40"
                  aria-label="Remover foto"
                >
                  ×
                </button>
                {photo.status === PROFESSIONAL_SERVICE_PHOTO_STATUS.FAILED ? (
                  <button
                    type="button"
                    onClick={() => onRetryPhoto(photo.key)}
                    disabled={submitting || photoBusy}
                    className="absolute inset-x-1 top-1/2 min-h-8 -translate-y-1/2 rounded-lg bg-rose-600 px-1 text-[9px] font-black text-white disabled:opacity-50"
                  >
                    Tentar novamente
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-xs font-bold text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Nenhuma foto adicionada. Fotos são opcionais.
          </div>
        )}
      </div>

      <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <summary className="cursor-pointer text-xs font-black text-blue-800 dark:text-blue-200">Detalhes adicionais</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Duração média">
            <input
              value={draft.tempoMedio}
              onChange={(event) => onFieldChange('tempoMedio', event.target.value)}
              placeholder="Ex: 2 horas"
              maxLength={120}
              className={inputClass}
            />
          </Field>
          <Field label="Região de atendimento">
            <input
              value={draft.regiao}
              onChange={(event) => onFieldChange('regiao', event.target.value)}
              placeholder="Ex: Nova Iguaçu - RJ"
              maxLength={160}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            ['atendeDomicilio', 'Atendimento domiciliar'],
            ['urgente', 'Aceita urgência'],
            ['ativo', 'Serviço ativo'],
          ].map(([field, label]) => (
            <label key={field} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={draft[field] === true}
                onChange={(event) => onFieldChange(field, event.target.checked)}
                className="h-4 w-4 accent-blue-700"
              />
              {label}
            </label>
          ))}
        </div>
      </details>

      <div className="mt-3 min-h-5" aria-live="polite" aria-atomic="true">
        {errorMessage ? <p role="alert" className="text-xs font-black text-rose-600 dark:text-rose-300">{errorMessage}</p> : null}
        {!errorMessage && successMessage ? <p className="text-xs font-black text-emerald-700 dark:text-emerald-300">{successMessage}</p> : null}
        {!errorMessage && !successMessage && blockerMessage ? <p className="text-xs font-bold text-amber-700 dark:text-amber-300">{blockerMessage}</p> : null}
      </div>

      <div className="sticky bottom-0 z-10 mt-2 flex flex-col-reverse gap-2 border-t border-slate-100 bg-white/95 py-3 backdrop-blur sm:flex-row sm:justify-end dark:border-slate-800 dark:bg-slate-900/95">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="min-h-11 rounded-xl border border-slate-200 px-5 text-xs font-black text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || photoBusy || Boolean(blockerMessage)}
          className="min-h-11 rounded-xl bg-blue-700 px-5 text-xs font-black text-white shadow-[0_12px_26px_rgba(37,99,235,0.24)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {photoBusy ? 'Aguarde o envio da foto...' : submitting ? 'Salvando...' : 'Salvar serviço'}
        </button>
      </div>
    </section>
  )
}
