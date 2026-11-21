'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { auth } from '@/lib/firebase'
import { CATEGORIES } from '@/constants/categories'
import useProfessionalServices from '@/hooks/useProfessionalServices'
import {
  createProfessionalServiceOperationId,
  getProfessionalServicesErrorMessage,
} from '@/lib/professionalServicesClient'
import {
  buildProfessionalServicePayload,
  countLegacyPortfolioServices,
  createProfessionalServiceDraft,
  createUploadedPhotoEntries,
  getPortfolioPhotoUploadMessage,
  getProfessionalServiceFormIssue,
  getProfessionalServiceFormIssueMessage,
  PROFESSIONAL_SERVICE_PHOTO_STATUS,
  professionalServiceOperationFingerprint,
} from '@/lib/professionalPortfolioUiState'
import { isSafeProfessionalServicePhotoUrl } from '@/lib/professionalServiceModel'
import { optimizePortfolioPhoto, uploadPortfolioPhotoToImgBB } from '@/lib/imgbbClient'
import ProfessionalServiceCard from './ProfessionalServiceCard'
import ProfessionalServiceForm from './ProfessionalServiceForm'

function sanitizeCode(error, fallback) {
  const code = String(error?.code || error?.message || fallback || 'unknown')
  return /^[A-Za-z0-9_-]{1,96}$/.test(code) ? code : String(fallback || 'unknown')
}

function newPhotoKey() {
  return createProfessionalServiceOperationId('photo')
}

export default function ProfessionalPortfolioSection({
  uid,
  user,
  legacyServices,
  legacyReadStatus,
  professionalDetails,
  onProfessionalDetailChange,
  onSaveProfessionalDetails,
  profileSaving = false,
}) {
  const {
    services,
    status,
    featureEnabled,
    errorMessage,
    mutationPending,
    reload,
    createService,
    editService,
    deleteService,
  } = useProfessionalServices({ user, expectedUid: uid, enabled: Boolean(uid) })

  const [formMode, setFormMode] = useState('')
  const [draft, setDraft] = useState(() => createProfessionalServiceDraft())
  const [photos, setPhotos] = useState([])
  const [photoBusy, setPhotoBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [sectionNotice, setSectionNotice] = useState('')
  const [detailsNotice, setDetailsNotice] = useState('')
  const ownerUidRef = useRef(String(uid || ''))
  const photoControllersRef = useRef(new Map())
  const previewUrlsRef = useRef(new Set())
  const operationRef = useRef(null)
  const deleteOperationsRef = useRef(new Map())
  const uploadCountRef = useRef(0)

  const legacyCount = countLegacyPortfolioServices(legacyServices)
  const formIssue = useMemo(() => getProfessionalServiceFormIssue({
    draft,
    photos,
    submitting: mutationPending,
  }), [draft, mutationPending, photos])
  const formBlockerMessage = getProfessionalServiceFormIssueMessage(formIssue)

  function revokePreview(url) {
    if (!String(url || '').startsWith('blob:') || !previewUrlsRef.current.has(url)) return
    URL.revokeObjectURL(url)
    previewUrlsRef.current.delete(url)
  }

  function cancelPhotoRequests() {
    photoControllersRef.current.forEach((controller) => controller.abort())
    photoControllersRef.current.clear()
    uploadCountRef.current = 0
    setPhotoBusy(false)
  }

  function releaseLocalPhotos() {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrlsRef.current.clear()
  }

  function resetForm() {
    cancelPhotoRequests()
    releaseLocalPhotos()
    operationRef.current = null
    setFormMode('')
    setDraft(createProfessionalServiceDraft())
    setPhotos([])
    setFormError('')
    setFormSuccess('')
  }

  useEffect(() => {
    const nextUid = String(uid || '')
    if (ownerUidRef.current !== nextUid) {
      ownerUidRef.current = nextUid
      resetForm()
      setSectionNotice('')
      deleteOperationsRef.current.clear()
    }
    return () => {
      cancelPhotoRequests()
      releaseLocalPhotos()
    }
    // uid is the account boundary; helpers intentionally use refs owned by this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  function openCreateForm() {
    if (!featureEnabled) {
      setSectionNotice('O Portfólio 2.0 está em preparação. Seus serviços atuais continuam preservados.')
      return
    }
    resetForm()
    setDraft(createProfessionalServiceDraft({}, { regiao: professionalDetails?.regiao || '' }))
    setFormMode('create')
    setSectionNotice('')
  }

  function openEditForm(service) {
    if (!featureEnabled) {
      setSectionNotice('O Portfólio 2.0 está em preparação e ainda não aceita alterações.')
      return
    }
    resetForm()
    setDraft(createProfessionalServiceDraft(service, { regiao: professionalDetails?.regiao || '' }))
    setPhotos(createUploadedPhotoEntries(service))
    setFormMode('edit')
    setSectionNotice('')
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
    setFormError('')
    setFormSuccess('')
  }

  function updatePhoto(key, updater) {
    setPhotos((current) => current.map((photo) => (
      photo.key === key ? updater(photo) : photo
    )))
  }

  async function uploadPhoto(key, file) {
    const expectedUid = String(ownerUidRef.current || '')
    let stage = 'validation'
    uploadCountRef.current += 1
    setPhotoBusy(true)
    updatePhoto(key, (photo) => ({ ...photo, status: PROFESSIONAL_SERVICE_PHOTO_STATUS.UPLOADING, progress: 1, errorCode: '' }))

    try {
      const currentUser = auth.currentUser
      if (!expectedUid || String(currentUser?.uid || '') !== expectedUid) {
        const error = new Error('professional_service_auth_mismatch')
        error.code = 'professional_service_auth_mismatch'
        throw error
      }

      stage = 'optimization'
      const prepared = await optimizePortfolioPhoto(file)
      if (ownerUidRef.current !== expectedUid || String(auth.currentUser?.uid || '') !== expectedUid) {
        const error = new Error('professional_service_auth_mismatch')
        error.code = 'professional_service_auth_mismatch'
        throw error
      }

      stage = 'authentication'
      const idToken = await currentUser.getIdToken()
      const controller = new AbortController()
      photoControllersRef.current.set(key, controller)
      stage = 'upload'
      const uploaded = await uploadPortfolioPhotoToImgBB(prepared.file, {
        uid: expectedUid,
        idToken,
        signal: controller.signal,
        onProgress: (progress) => updatePhoto(key, (photo) => ({ ...photo, progress })),
      })

      if (
        ownerUidRef.current !== expectedUid
        || String(auth.currentUser?.uid || '') !== expectedUid
        || !isSafeProfessionalServicePhotoUrl(uploaded?.url)
      ) {
        const error = new Error('professional_service_photo_invalid')
        error.code = 'professional_service_photo_invalid'
        throw error
      }

      updatePhoto(key, (photo) => {
        revokePreview(photo.previewUrl)
        return {
          ...photo,
          previewUrl: uploaded.url,
          url: uploaded.url,
          status: PROFESSIONAL_SERVICE_PHOTO_STATUS.UPLOADED,
          progress: 100,
          errorCode: '',
        }
      })
      setFormError('')
      setFormSuccess('Foto pronta. Salve o serviço para vinculá-la ao portfólio.')
    } catch (error) {
      console.warn('[PROFESSIONAL_PORTFOLIO]', {
        event: 'photo_upload_failed',
        stage,
        code: sanitizeCode(error, 'professional_service_photo_upload_failed'),
      })
      updatePhoto(key, (photo) => ({
        ...photo,
        status: PROFESSIONAL_SERVICE_PHOTO_STATUS.FAILED,
        progress: 0,
        errorCode: sanitizeCode(error, 'professional_service_photo_upload_failed'),
      }))
      setFormSuccess('')
      setFormError(getPortfolioPhotoUploadMessage(error))
    } finally {
      photoControllersRef.current.delete(key)
      uploadCountRef.current = Math.max(0, uploadCountRef.current - 1)
      setPhotoBusy(uploadCountRef.current > 0)
    }
  }

  function selectPhotos(files) {
    const available = Math.max(0, 5 - photos.length)
    if (!available) {
      setFormError('Você pode adicionar no máximo cinco fotos.')
      return
    }

    const selected = files.slice(0, available)
    const entries = selected.map((file) => {
      const key = newPhotoKey()
      const previewUrl = URL.createObjectURL(file)
      previewUrlsRef.current.add(previewUrl)
      return {
        key,
        previewUrl,
        url: '',
        status: PROFESSIONAL_SERVICE_PHOTO_STATUS.PREVIEW,
        progress: 0,
        errorCode: '',
        file,
        local: true,
      }
    })
    setPhotos((current) => [...current, ...entries].slice(0, 5))
    setFormError('')
    setFormSuccess('')
    entries.forEach((entry) => void uploadPhoto(entry.key, entry.file))
  }

  function removePhoto(key) {
    photoControllersRef.current.get(key)?.abort()
    photoControllersRef.current.delete(key)
    setPhotos((current) => {
      const removed = current.find((photo) => photo.key === key)
      if (removed) revokePreview(removed.previewUrl)
      return current.filter((photo) => photo.key !== key)
    })
    setFormError('')
    setFormSuccess('')
  }

  function retryPhoto(key) {
    const photo = photos.find((entry) => entry.key === key)
    if (!photo?.file || photoBusy) {
      setFormError('Selecione a foto novamente para tentar outro envio.')
      return
    }
    setFormError('')
    setFormSuccess('')
    void uploadPhoto(key, photo.file)
  }

  function operationIdFor(fingerprint, prefix) {
    if (operationRef.current?.fingerprint === fingerprint) return operationRef.current.operationId
    const operationId = createProfessionalServiceOperationId(prefix)
    operationRef.current = { fingerprint, operationId }
    return operationId
  }

  async function submitService() {
    if (!featureEnabled) {
      setFormError('O Portfólio 2.0 está em preparação e ainda não aceita alterações.')
      return
    }
    const issue = getProfessionalServiceFormIssue({ draft, photos, submitting: mutationPending })
    if (issue) {
      setFormError(getProfessionalServiceFormIssueMessage(issue))
      return
    }

    const payload = buildProfessionalServicePayload(draft, photos)
    const action = formMode === 'edit' ? 'edit' : 'create'
    const fingerprint = professionalServiceOperationFingerprint({
      action,
      serviceId: draft.id,
      revision: draft.revision,
      payload,
    })
    const operationId = operationIdFor(fingerprint, action)
    setFormError('')
    setFormSuccess('')

    try {
      if (action === 'edit') {
        await editService({
          operationId,
          serviceId: draft.id,
          expectedRevision: draft.revision,
          service: payload,
        })
      } else {
        await createService({ operationId, service: payload })
      }
      releaseLocalPhotos()
      operationRef.current = null
      setFormMode('')
      setDraft(createProfessionalServiceDraft())
      setPhotos([])
      setSectionNotice(action === 'edit' ? 'Serviço atualizado com sucesso.' : 'Serviço cadastrado com sucesso.')
    } catch (error) {
      console.warn('[PROFESSIONAL_PORTFOLIO]', {
        event: 'service_mutation_failed',
        stage: action,
        code: sanitizeCode(error, 'professional_service_mutation_failed'),
      })
      setFormError(getProfessionalServicesErrorMessage(error))
      if (error?.code === 'professional_service_stale_revision') reload({ quiet: true }).catch(() => {})
    }
  }

  async function removeService(service) {
    if (!featureEnabled) {
      setSectionNotice('O Portfólio 2.0 está em preparação e ainda não aceita alterações.')
      return
    }
    if (mutationPending || !service?.id || !Number.isSafeInteger(Number(service?.revision))) return
    if (!window.confirm(`Excluir “${service.nome || 'este serviço'}”? Esta ação não apaga serviços do portfólio antigo.`)) return

    const fingerprint = professionalServiceOperationFingerprint({
      action: 'delete',
      serviceId: service.id,
      revision: service.revision,
    })
    let operation = deleteOperationsRef.current.get(service.id)
    if (!operation || operation.fingerprint !== fingerprint) {
      operation = { fingerprint, operationId: createProfessionalServiceOperationId('delete') }
      deleteOperationsRef.current.set(service.id, operation)
    }

    setSectionNotice('')
    try {
      await deleteService({
        operationId: operation.operationId,
        serviceId: service.id,
        expectedRevision: service.revision,
      })
      deleteOperationsRef.current.delete(service.id)
      if (draft.id === service.id) resetForm()
      setSectionNotice('Serviço excluído com sucesso.')
    } catch (error) {
      console.warn('[PROFESSIONAL_PORTFOLIO]', {
        event: 'service_delete_failed',
        stage: 'delete',
        code: sanitizeCode(error, 'professional_service_delete_failed'),
      })
      setSectionNotice(getProfessionalServicesErrorMessage(error))
      if (error?.code === 'professional_service_stale_revision') reload({ quiet: true }).catch(() => {})
    }
  }

  async function saveProfessionalDetails() {
    setDetailsNotice('')
    try {
      await onSaveProfessionalDetails?.()
      setDetailsNotice('Dados profissionais salvos.')
    } catch {
      setDetailsNotice('Não foi possível salvar os dados profissionais agora.')
    }
  }

  const loading = status === 'idle' || status === 'loading'
  const readFailed = status === 'error' || status === 'auth_error'

  return (
    <section data-tutorial="portfolio" className="rounded-[24px] border border-blue-950/10 bg-slate-50 p-3 shadow-[0_22px_70px_rgba(15,23,42,0.10)] dark:border-slate-700 dark:bg-slate-950 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-blue-950 dark:text-blue-100">Meu portfólio</h2>
          <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {readFailed
              ? 'Não foi possível confirmar a quantidade de serviços.'
              : featureEnabled
                ? `${services.length} de 12 serviços cadastrados`
                : 'Portfólio 2.0 ainda não ativado'}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          disabled={!featureEnabled || mutationPending || readFailed || loading || services.length >= 12}
          className="min-h-11 shrink-0 rounded-xl bg-[#ffd91a] px-4 text-xs font-black text-blue-950 shadow-[0_12px_24px_rgba(250,204,21,0.25)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Novo serviço
        </button>
      </div>

      <details className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <summary className="cursor-pointer text-xs font-black text-blue-800 dark:text-blue-200">Dados profissionais</summary>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            ['preco', 'Preço base', 'R$ 50,00', 'decimal'],
            ['whatsapp', 'WhatsApp', '(21) 99999-9999', 'tel'],
            ['regiao', 'Região', 'Nova Iguaçu - RJ', 'text'],
            ['experiencia', 'Experiência', '5 anos', 'text'],
          ].map(([field, label, placeholder, inputMode]) => (
            <label key={field} className="text-[11px] font-black text-slate-500 dark:text-slate-300">
              {label}
              <input
                value={professionalDetails?.[field] || ''}
                onChange={(event) => onProfessionalDetailChange?.(field, event.target.value)}
                placeholder={placeholder}
                inputMode={inputMode}
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-blue-950 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-blue-100 dark:focus:ring-blue-950"
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {detailsNotice ? <span className="text-xs font-bold text-slate-500 dark:text-slate-300">{detailsNotice}</span> : null}
          <button
            type="button"
            onClick={() => void saveProfessionalDetails()}
            disabled={profileSaving}
            className="min-h-10 rounded-xl bg-blue-700 px-4 text-xs font-black text-white disabled:opacity-50"
          >
            {profileSaving ? 'Salvando...' : 'Salvar dados profissionais'}
          </button>
        </div>
      </details>

      {formMode ? (
        <div className="mt-3">
          <ProfessionalServiceForm
            mode={formMode}
            draft={draft}
            photos={photos}
            categories={CATEGORIES}
            submitting={mutationPending}
            photoBusy={photoBusy}
            errorMessage={formError}
            successMessage={formSuccess}
            blockerMessage={formBlockerMessage}
            onFieldChange={updateDraft}
            onSelectFiles={selectPhotos}
            onRemovePhoto={removePhoto}
            onRetryPhoto={retryPhoto}
            onSubmit={() => void submitService()}
            onCancel={resetForm}
          />
        </div>
      ) : null}

      {sectionNotice ? (
        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800 dark:border-blue-950 dark:bg-blue-950 dark:text-blue-200" aria-live="polite">
          {sectionNotice}
        </div>
      ) : null}

      {legacyCount > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-bold leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          Há {legacyCount} {legacyCount === 1 ? 'serviço antigo preservado' : 'serviços antigos preservados'} aguardando migração. Eles não são alterados por esta tela.
        </div>
      ) : legacyReadStatus?.error ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-bold text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          Não foi possível verificar o portfólio antigo. Nenhum dado legado foi alterado.
        </div>
      ) : null}

      <div className="mt-3">
        {loading ? (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-5 text-center text-sm font-bold text-blue-700 dark:border-blue-950 dark:bg-blue-950 dark:text-blue-200">
            Carregando seus serviços...
          </div>
        ) : readFailed ? (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-950 dark:bg-rose-950/50">
            <p className="text-sm font-black text-rose-700 dark:text-rose-200">{errorMessage}</p>
            <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-300">A lista não foi interpretada como vazia.</p>
            <button
              type="button"
              onClick={() => reload().catch(() => {})}
              className="mt-3 min-h-10 rounded-xl bg-rose-600 px-4 text-xs font-black text-white"
            >
              Tentar novamente
            </button>
          </div>
        ) : !featureEnabled ? (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-5 text-center dark:border-blue-950 dark:bg-blue-950/50">
            <div className="text-sm font-black text-blue-900 dark:text-blue-100">Portfólio 2.0 em preparação</div>
            <p className="mt-1 text-xs font-semibold text-blue-700 dark:text-blue-200">Nenhum serviço antigo foi apagado. Novas alterações serão liberadas somente após a publicação coordenada das Rules.</p>
          </div>
        ) : services.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <div className="text-sm font-black text-blue-950 dark:text-blue-100">Nenhum serviço cadastrado no Portfólio 2.0</div>
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Use “Novo serviço” para começar.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {services.map((service) => (
              <ProfessionalServiceCard
                key={service.id}
                service={service}
                pending={mutationPending || !featureEnabled}
                onEdit={openEditForm}
                onDelete={(item) => void removeService(item)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
