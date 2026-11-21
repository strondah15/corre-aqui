import assert from 'node:assert/strict'
import { File } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import {
  PORTFOLIO_IMAGE_LIMITS,
  getPortfolioTargetDimensions,
  optimizePortfolioPhoto,
  uploadProfilePhotoToImgBB,
} from '../src/lib/imgbbClient.js'
import {
  resolveUserPortfolioMap,
  withoutPortfolioFields,
} from '../src/lib/portfolioPersistence.js'
import {
  buildProfessionalServicePayload,
  createProfessionalServiceDraft,
  getProfessionalServiceFormIssue,
  PROFESSIONAL_SERVICE_PHOTO_STATUS,
} from '../src/lib/professionalPortfolioUiState.js'

const componentSource = await readFile(new URL('../src/components/PerfilDrawer.jsx', import.meta.url), 'utf8')
const portfolioSectionSource = await readFile(new URL('../src/components/ProfessionalPortfolioSection.jsx', import.meta.url), 'utf8')
const portfolioFormSource = await readFile(new URL('../src/components/ProfessionalServiceForm.jsx', import.meta.url), 'utf8')
const portfolioClientSource = await readFile(new URL('../src/lib/professionalServicesClient.js', import.meta.url), 'utf8')
const chatSource = await readFile(new URL('../src/components/ChatMensagens.jsx', import.meta.url), 'utf8')
const uploadRouteSource = await readFile(new URL('../src/app/api/upload/profile-photo/route.js', import.meta.url), 'utf8')

function makeFile(bytes, name, type) {
  return new File([new Uint8Array(bytes)], name, { type, lastModified: 1 })
}

function installFakeBrowser({ width, height, hasTransparency = false, webpSupported = true, encodedBytes = 512, encodeFails = false, bitmapFails = false, imageElementFails = false } = {}) {
  const previous = {
    createImageBitmap: globalThis.createImageBitmap,
    document: globalThis.document,
    Image: globalThis.Image,
  }
  const state = {
    bitmapClosed: 0,
    canvasCleared: 0,
    decodeCalls: 0,
    encodeRequests: [],
    canvas: null,
    orientation: '',
    imageElementDecodeCalls: 0,
  }

  globalThis.createImageBitmap = async (_file, options = {}) => {
    state.decodeCalls += 1
    state.orientation = options.imageOrientation
    if (bitmapFails) throw new Error('bitmap_decode_failed')
    return {
      width,
      height,
      close: () => { state.bitmapClosed += 1 },
    }
  }
  globalThis.Image = class FakeImage {
    constructor() {
      this.naturalWidth = width
      this.naturalHeight = height
      this.width = width
      this.height = height
      this.onload = null
      this.onerror = null
    }

    set src(value) {
      if (!value) return
      state.imageElementDecodeCalls += 1
      queueMicrotask(() => {
        if (imageElementFails) this.onerror?.(new Error('image_element_decode_failed'))
        else this.onload?.()
      })
    }
  }
  globalThis.document = {
    createElement: (tagName) => {
      assert.equal(tagName, 'canvas')
      const context = {
        drawImage: () => {},
        getImageData: () => ({
          data: new Uint8ClampedArray([0, 0, 0, hasTransparency ? 80 : 255]),
        }),
        clearRect: () => { state.canvasCleared += 1 },
      }
      const canvas = {
        width: 1,
        height: 1,
        getContext: () => context,
        toBlob: (callback, requestedType, quality) => {
          state.encodeRequests.push({ requestedType, quality })
          if (encodeFails) {
            callback(null)
            return
          }
          const actualType = requestedType === 'image/webp' && !webpSupported ? 'image/png' : requestedType
          callback(new Blob([new Uint8Array(encodedBytes)], { type: actualType }))
        },
      }
      state.canvas = canvas
      return canvas
    },
  }

  return {
    state,
    restore() {
      if (previous.createImageBitmap === undefined) delete globalThis.createImageBitmap
      else globalThis.createImageBitmap = previous.createImageBitmap
      if (previous.document === undefined) delete globalThis.document
      else globalThis.document = previous.document
      if (previous.Image === undefined) delete globalThis.Image
      else globalThis.Image = previous.Image
    },
  }
}

async function withFakeBrowser(options, callback) {
  const fake = installFakeBrowser(options)
  try {
    return await callback(fake.state)
  } finally {
    fake.restore()
  }
}

async function withFakeXhr(callback) {
  const previous = globalThis.XMLHttpRequest
  const instances = []

  class FakeXMLHttpRequest {
    constructor() {
      this.readyState = 1
      this.status = 0
      this.responseText = ''
      this.timeout = 0
      this.upload = {}
      this.abortCalls = 0
      instances.push(this)
    }

    open(method, url) {
      this.method = method
      this.url = url
    }

    setRequestHeader(name, value) {
      this.headers = { ...(this.headers || {}), [name]: value }
    }

    send(form) {
      this.form = form
    }

    abort() {
      this.abortCalls += 1
      this.readyState = 4
      this.onabort?.()
    }
  }

  globalThis.XMLHttpRequest = FakeXMLHttpRequest
  try {
    await callback(instances)
  } finally {
    if (previous === undefined) delete globalThis.XMLHttpRequest
    else globalThis.XMLHttpRequest = previous
  }
}

async function createFixture({ name, width, height, format, transparent = false, orientation = 1 }) {
  const background = transparent
    ? { r: 34, g: 128, b: 210, alpha: 0.42 }
    : { r: 34, g: 128, b: 210, alpha: 1 }
  let pipeline = sharp({ create: { width, height, channels: transparent ? 4 : 3, background } })
  if (orientation !== 1) pipeline = pipeline.withMetadata({ orientation })
  if (format === 'jpeg') pipeline = pipeline.jpeg({ quality: 95 })
  if (format === 'png') pipeline = pipeline.png({ compressionLevel: 6 })
  if (format === 'webp') pipeline = pipeline.webp({ quality: 92 })
  return { name, width, height, format, transparent, orientation, buffer: await pipeline.toBuffer() }
}

async function referenceOptimize(fixture) {
  const inputMetadata = await sharp(fixture.buffer).metadata()
  const { data, info } = await sharp(fixture.buffer)
    .rotate()
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true })
  const outputMetadata = await sharp(data).metadata()
  const sourceWidth = fixture.orientation >= 5 ? fixture.height : fixture.width
  const sourceHeight = fixture.orientation >= 5 ? fixture.width : fixture.height

  assert.ok(Math.max(info.width, info.height) <= PORTFOLIO_IMAGE_LIMITS.maxSide, `${fixture.name}: lado máximo`)
  assert.ok(info.width <= sourceWidth && info.height <= sourceHeight, `${fixture.name}: sem ampliação`)
  assert.ok(Math.abs(sourceWidth / sourceHeight - info.width / info.height) < 0.01, `${fixture.name}: proporção`)
  if (fixture.transparent) assert.equal(outputMetadata.hasAlpha, true, `${fixture.name}: transparência`)

  return {
    caso: fixture.name,
    original: `${inputMetadata.width}x${inputMetadata.height}`,
    bytesAntes: fixture.buffer.length,
    formatoAntes: inputMetadata.format,
    otimizada: `${info.width}x${info.height}`,
    bytesDepois: data.length,
    formatoDepois: outputMetadata.format,
    reducao: `${Math.round((1 - data.length / fixture.buffer.length) * 1000) / 10}%`,
  }
}

assert.deepEqual(getPortfolioTargetDimensions(4000, 3000), { width: 1280, height: 960, scale: 0.32 })
assert.deepEqual(getPortfolioTargetDimensions(3000, 4000), { width: 960, height: 1280, scale: 0.32 })
assert.deepEqual(getPortfolioTargetDimensions(640, 480), { width: 640, height: 480, scale: 1 })

assert.equal(
  getProfessionalServiceFormIssue({
    draft: createProfessionalServiceDraft({ nome: 'Reparo', categoriaId: 'reparos', categoriaNome: 'Reparos', faixaPreco: 'R$ 80' }),
    photos: [{ status: PROFESSIONAL_SERVICE_PHOTO_STATUS.PREVIEW, url: 'blob:https://preview/1' }],
  }),
  'professional_service_photo_uploading',
  'prévia local nunca pode ser persistida',
)
assert.equal(
  getProfessionalServiceFormIssue({
    draft: createProfessionalServiceDraft({ nome: 'Reparo', categoriaId: 'reparos', categoriaNome: 'Reparos', faixaPreco: 'R$ 80' }),
    photos: [{ status: PROFESSIONAL_SERVICE_PHOTO_STATUS.FAILED, url: '' }],
  }),
  'professional_service_photo_failed',
  'falha de upload exige retry ou remoção',
)
assert.equal(
  getProfessionalServiceFormIssue({
    draft: createProfessionalServiceDraft({ nome: 'Reparo', categoriaId: 'reparos', categoriaNome: 'Reparos', faixaPreco: 'R$ 80' }),
    submitting: true,
  }),
  'professional_service_submitting',
  'upload lento bloqueia salvamento',
)
assert.equal(
  getProfessionalServiceFormIssue({
    draft: createProfessionalServiceDraft({ nome: '  ', categoriaId: 'reparos', categoriaNome: 'Reparos', faixaPreco: 'R$ 80' }),
  }),
  'professional_service_name_required',
  'nome vazio falha fechado',
)
assert.equal(
  getProfessionalServiceFormIssue({
    draft: createProfessionalServiceDraft({ nome: 'Reparo', categoriaId: 'reparos', categoriaNome: 'Reparos', faixaPreco: 'R$ 80' }),
    photos: [{ status: PROFESSIONAL_SERVICE_PHOTO_STATUS.UPLOADED, url: 'https://i.ibb.co/foto.webp' }],
  }),
  '',
  'URL existente e nome válido mantêm compatibilidade',
)
assert.deepEqual(
  buildProfessionalServicePayload(
    createProfessionalServiceDraft({ nome: 'Reparo', categoriaId: 'reparos', categoriaNome: 'Reparos', faixaPreco: 'R$ 80' }),
    [
      { status: PROFESSIONAL_SERVICE_PHOTO_STATUS.PREVIEW, url: 'blob:https://preview/1' },
      { status: PROFESSIONAL_SERVICE_PHOTO_STATUS.UPLOADED, url: 'https://i.ibb.co/foto.webp' },
    ],
  ).fotos,
  { 0: 'https://i.ibb.co/foto.webp' },
  'serialização remove blob e preserva URLs existentes',
)

await withFakeXhr(async (instances) => {
  const pending = uploadProfilePhotoToImgBB(makeFile(128, 'lenta.jpg', 'image/jpeg'), {
    uid: 'uid-test',
    idToken: 'token-test',
    skipCompression: true,
  })
  let settled = false
  pending.then(() => { settled = true }, () => { settled = true })
  await Promise.resolve()
  assert.equal(settled, false, 'upload lento permanece pendente até resposta real')
  assert.equal(instances[0].timeout, 28_000, 'XHR encerra antes do timeout externo antigo')
  instances[0].status = 200
  instances[0].responseText = JSON.stringify({ ok: true, url: 'https://i.ibb.co/foto.webp' })
  instances[0].readyState = 4
  instances[0].onload()
  assert.equal((await pending).url, 'https://i.ibb.co/foto.webp')
})

await withFakeXhr(async (instances) => {
  const pending = uploadProfilePhotoToImgBB(makeFile(128, 'timeout.jpg', 'image/jpeg'), {
    uid: 'uid-test',
    idToken: 'token-test',
    skipCompression: true,
  })
  instances[0].ontimeout()
  await assert.rejects(pending, /imgbb_request_timeout/, 'timeout encerra a requisição pendente')
})

await withFakeXhr(async (instances) => {
  const controller = new AbortController()
  const pending = uploadProfilePhotoToImgBB(makeFile(128, 'cancelada.jpg', 'image/jpeg'), {
    uid: 'uid-test',
    idToken: 'token-test',
    skipCompression: true,
    signal: controller.signal,
  })
  controller.abort()
  await assert.rejects(pending, /imgbb_request_aborted/, 'AbortSignal cancela o XHR real')
  assert.equal(instances[0].abortCalls, 1)
})

await withFakeBrowser({ width: 4000, height: 3000, encodedBytes: 700 }, async (state) => {
  const result = await optimizePortfolioPhoto(makeFile(5000, 'horizontal.jpg', 'image/jpeg'))
  assert.equal(result.file.type, 'image/webp')
  assert.match(result.file.name, /\.webp$/)
  assert.equal(state.canvas.width, 1, 'canvas é reduzido depois do uso')
  assert.equal(state.canvas.height, 1, 'canvas é reduzido depois do uso')
  assert.equal(result.metrics.optimized.width, 1280)
  assert.equal(result.metrics.optimized.height, 960)
  assert.equal(result.metrics.metadataRemoved, true)
  assert.equal(state.orientation, 'from-image')
  assert.equal(state.encodeRequests[0].quality, PORTFOLIO_IMAGE_LIMITS.quality)
  assert.equal(state.bitmapClosed, 1)
  assert.equal(state.canvasCleared, 1)
})

await withFakeBrowser({ width: 3000, height: 4000, encodedBytes: 700 }, async (state) => {
  const result = await optimizePortfolioPhoto(makeFile(5000, 'vertical.jpg', 'image/jpeg'))
  assert.equal(result.metrics.optimized.width, 960)
  assert.equal(result.metrics.optimized.height, 1280)
  assert.equal(state.orientation, 'from-image', 'orientação EXIF é solicitada no decode')
})

await withFakeBrowser({ width: 640, height: 480, encodedBytes: 900 }, async () => {
  const result = await optimizePortfolioPhoto(makeFile(800, 'pequena.jpg', 'image/jpeg'))
  assert.equal(result.file.type, 'image/jpeg', 'original menor é mantido')
  assert.equal(result.metrics.usedOriginal, true)
  assert.equal(result.metrics.reason, 'original_smaller')
})

await withFakeBrowser({ width: 1600, height: 1000, hasTransparency: true, encodedBytes: 700 }, async () => {
  const result = await optimizePortfolioPhoto(makeFile(5000, 'alpha.png', 'image/png'))
  assert.equal(result.file.type, 'image/webp', 'WebP mantém alpha quando suportado')
})

await withFakeBrowser({ width: 1600, height: 1000, hasTransparency: true, webpSupported: false, encodedBytes: 700 }, async (state) => {
  const result = await optimizePortfolioPhoto(makeFile(5000, 'alpha.png', 'image/png'))
  assert.equal(result.file.type, 'image/png', 'PNG transparente nunca cai para JPEG')
  assert.match(result.file.name, /\.png$/)
  assert.deepEqual(state.encodeRequests.map(({ requestedType }) => requestedType), ['image/webp', 'image/png'])
})

await withFakeBrowser({ width: 2000, height: 1400, encodedBytes: 700 }, async () => {
  const result = await optimizePortfolioPhoto(makeFile(5000, 'entrada.webp', 'image/webp'))
  assert.equal(result.file.type, 'image/webp')
})

await withFakeBrowser({ width: 6000, height: 5000, encodedBytes: 700 }, async (state) => {
  await assert.rejects(
    () => optimizePortfolioPhoto(makeFile(5000, 'pixels-demais.jpg', 'image/jpeg')),
    /portfolio_dimensions_too_large/,
  )
  assert.equal(state.bitmapClosed, 1, 'bitmap extremo é fechado mesmo no erro')
  assert.equal(state.canvas, null, 'dimensões são validadas antes de alocar canvas')
})

await withFakeBrowser({ width: 2000, height: 1400, encodedBytes: 700 }, async (state) => {
  const gif = makeFile(5000, 'animado.gif', 'image/gif')
  const result = await optimizePortfolioPhoto(gif)
  assert.equal(result.file, gif, 'GIF não é achatado pelo canvas')
  assert.equal(result.metrics.reason, 'animated_original')
  assert.equal(state.decodeCalls, 0)
})

await withFakeBrowser({ width: 2000, height: 1400, encodedBytes: 700 }, async (state) => {
  const gif = makeFile(PORTFOLIO_IMAGE_LIMITS.maxUploadBytes + 1, 'animado-grande.gif', 'image/gif')
  await assert.rejects(() => optimizePortfolioPhoto(gif), /portfolio_original_too_large/)
  assert.equal(state.decodeCalls, 0, 'GIF acima do limite de upload não é decodificado')
})

await withFakeBrowser({ width: 2000, height: 1400, encodedBytes: 700 }, async (state) => {
  const heic = makeFile(5000, 'camera.heic', '')
  const result = await optimizePortfolioPhoto(heic)
  assert.equal(result.file.type, 'image/webp', 'HEIC decodificável é convertido antes do upload')
  assert.match(result.file.name, /camera\.webp$/)
  assert.equal(state.decodeCalls, 1)
  assert.equal(result.metrics.metadataRemoved, true)
})

await withFakeBrowser({ width: 2000, height: 1400, encodedBytes: 700, bitmapFails: true }, async (state) => {
  const result = await optimizePortfolioPhoto(makeFile(5000, 'fallback-decoder.jpg', 'image/jpeg'))
  assert.equal(result.file.type, 'image/webp')
  assert.equal(state.decodeCalls, 1, 'createImageBitmap foi tentado uma vez')
  assert.equal(state.imageElementDecodeCalls, 1, 'elemento img assume quando createImageBitmap falha')
})

await withFakeBrowser({ width: 2000, height: 1400, bitmapFails: true, imageElementFails: true }, async () => {
  const smallHeic = makeFile(5000, 'camera-original.heic', 'image/heic')
  const result = await optimizePortfolioPhoto(smallHeic)
  assert.equal(result.file, smallHeic, 'HEIC pequeno mantém compatibilidade quando o navegador não decodifica')
  assert.equal(result.metrics.reason, 'optimization_failed')
})

await withFakeBrowser({ width: 2000, height: 1400, bitmapFails: true, imageElementFails: true }, async () => {
  const largeHeic = makeFile(PORTFOLIO_IMAGE_LIMITS.maxUploadBytes + 1, 'camera-grande.heic', 'image/heic')
  await assert.rejects(
    () => optimizePortfolioPhoto(largeHeic),
    /portfolio_format_not_supported/,
    'HEIC grande não é enviado cru quando o navegador não consegue convertê-lo',
  )
})

await withFakeBrowser({ width: 4000, height: 3000, encodedBytes: 700 }, async (state) => {
  const oversized = makeFile(PORTFOLIO_IMAGE_LIMITS.maxSourceBytes + 1, 'bytes-demais.jpg', 'image/jpeg')
  await assert.rejects(() => optimizePortfolioPhoto(oversized), /portfolio_source_too_large/)
  assert.equal(state.decodeCalls, 0, 'limite bruto é aplicado antes do decode')
})

await withFakeBrowser({ width: 1600, height: 1000, encodeFails: true }, async () => {
  const small = makeFile(1000, 'fallback.jpg', 'image/jpeg')
  const result = await optimizePortfolioPhoto(small)
  assert.equal(result.file, small, 'falha de compressão usa original permitido')
  assert.equal(result.metrics.reason, 'optimization_failed')
})

await withFakeBrowser({ width: 1600, height: 1000, encodeFails: true }, async () => {
  const large = makeFile(PORTFOLIO_IMAGE_LIMITS.maxUploadBytes + 1, 'fallback-grande.jpg', 'image/jpeg')
  await assert.rejects(() => optimizePortfolioPhoto(large), /portfolio_original_too_large/)
})

const legacyPortfolio = [{ id: 'legacy-1', nome: 'Serviço legado', ativo: true }]
const canonicalPortfolio = { 'canonical-1': { id: 'canonical-1', nome: 'Serviço canônico', ativo: true } }
assert.deepEqual(
  Object.keys(resolveUserPortfolioMap({ profPortfolio: legacyPortfolio })).sort(),
  ['legacy-1'],
  'dados legados continuam apenas legíveis e preservados',
)
assert.deepEqual(
  Object.keys(resolveUserPortfolioMap({
    profPortfolio: legacyPortfolio,
    portfolio: canonicalPortfolio,
    portfolioCanonicalVersion: 1,
  })).sort(),
  ['canonical-1'],
  'compatibilidade de leitura antiga permanece determinística',
)

const strippedProfile = withoutPortfolioFields({
  nome: 'Profissional',
  profPortfolio: legacyPortfolio,
  portfolio: canonicalPortfolio,
  profissional: { titulo: 'Reparos', profPortfolio: legacyPortfolio, portfolio: canonicalPortfolio },
})
assert.equal(strippedProfile.nome, 'Profissional')
assert.equal(strippedProfile.profissional.titulo, 'Reparos')
assert.equal('profPortfolio' in strippedProfile, false, 'salvamento geral não recebe profPortfolio')
assert.equal('portfolio' in strippedProfile, false, 'salvamento geral não recebe portfolio')
assert.equal('profPortfolio' in strippedProfile.profissional, false, 'perfil profissional geral não recebe profPortfolio')
assert.equal('portfolio' in strippedProfile.profissional, false, 'perfil profissional geral não recebe portfolio')

assert.match(componentSource, /<ProfessionalPortfolioSection/, 'PerfilDrawer usa a interface 2.0')
assert.match(componentSource, /withoutPortfolioFields\(profileToSave\)/, 'salvamento geral remove campos legados do portfólio')
assert.doesNotMatch(componentSource, /async function salvarPortfolio|adicionarPortfolioItem|removerPortfolioItem/, 'escritor direto antigo não permanece na interface')
assert.match(componentSource, /currentProfSection !== "perfilProfissional" && currentProfSection !== "portfolio"/, 'botão global Salvar não aparece na seção de portfólio')
assert.match(componentSource, /profPortfolio: portfolioSalvo,/, 'dados legados continuam disponíveis somente para indicação segura')
assert.match(
  componentSource,
  /const dataWithoutPortfolio = withoutPortfolioFields\(data\);[\s\S]*?\.\.\.dataWithoutPortfolio/,
  'listener de perfil não reintroduz arrays legados no salvamento geral',
)

assert.match(portfolioSectionSource, /optimizePortfolioPhoto\(file\)/, 'foto usa o otimizador móvel existente')
assert.match(portfolioSectionSource, /uploadPortfolioPhotoToImgBB\(prepared\.file/, 'arquivo otimizado segue para o ImgBB')
assert.match(portfolioSectionSource, /auth\.currentUser[\s\S]*currentUser\?\.uid/, 'UID é validado imediatamente antes do upload')
assert.match(portfolioSectionSource, /new AbortController\(\)/, 'upload e requisições podem ser cancelados')
assert.match(portfolioSectionSource, /URL\.revokeObjectURL/, 'previews locais são liberados')
assert.match(portfolioSectionSource, /professionalServiceOperationFingerprint/, 'retry compara o conteúdo da operação')
assert.match(portfolioSectionSource, /operationRef\.current\?\.fingerprint === fingerprint/, 'retry idêntico reutiliza o operationId')
assert.match(portfolioSectionSource, /createService\(\{ operationId, service: payload \}\)/, 'criação usa somente a API autenticada')
assert.match(portfolioSectionSource, /editService\([\s\S]*expectedRevision: draft\.revision/, 'edição envia revision autoritativa')
assert.match(portfolioSectionSource, /deleteService\([\s\S]*expectedRevision: service\.revision/, 'exclusão envia revision autoritativa')
assert.doesNotMatch(portfolioSectionSource, /firebaseDebug|runTransaction\(|\bupdate\(|\bset\(ref|database/, 'interface 2.0 não escreve diretamente no RTDB')
assert.match(portfolioSectionSource, /A lista não foi interpretada como vazia/, 'falha de leitura não aparece como zero serviços')
assert.match(portfolioSectionSource, /aguardando migração[\s\S]*não são alterados/, 'serviços legados recebem indicação sem sincronização')
assert.match(portfolioSectionSource, /ownerUidRef[\s\S]*cancelPhotoRequests[\s\S]*releaseLocalPhotos/, 'troca de conta invalida uploads e previews')
assert.match(portfolioSectionSource, /PROFESSIONAL_SERVICE_PHOTO_STATUS\.PREVIEW/, 'foto possui estado preview')
assert.match(portfolioSectionSource, /PROFESSIONAL_SERVICE_PHOTO_STATUS\.UPLOADING/, 'foto possui estado uploading')
assert.match(portfolioSectionSource, /PROFESSIONAL_SERVICE_PHOTO_STATUS\.UPLOADED/, 'foto possui estado uploaded')
assert.match(portfolioSectionSource, /PROFESSIONAL_SERVICE_PHOTO_STATUS\.FAILED/, 'foto possui estado failed')

assert.match(portfolioFormSource, /accept="image\/jpeg,image\/png,image\/webp,image\/gif,image\/heic,image\/heif,\.heic,\.heif"/, 'seletor móvel inclui HEIC e HEIF')
assert.match(portfolioFormSource, /Aguarde o envio da foto\.\.\./, 'salvamento explica upload pendente')
assert.match(portfolioFormSource, /Tentar novamente/, 'falha de foto oferece retry explícito')
assert.match(portfolioFormSource, /aria-live="polite"/, 'erros e confirmações são anunciados')
assert.match(portfolioClientSource, /Authorization: `Bearer \$\{token\}`/, 'API usa ID token Firebase')
assert.match(portfolioClientSource, /credentials: 'same-origin'/, 'cliente limita credenciais à mesma origem')
assert.match(portfolioClientSource, /professional_service_request_aborted/, 'cliente distingue cancelamento por logout/troca de conta')

assert.match(componentSource, /uploadProfilePhotoToImgBB\(file, \{/, 'foto de perfil continua no pipeline anterior')
assert.doesNotMatch(chatSource, /professionalServices|uploadPortfolioPhotoToImgBB/, 'Chat permanece fora do Portfólio 2.0')
assert.match(uploadRouteSource, /verifyIdToken\(idToken\)/, 'endpoint de imagem continua autenticado')
assert.match(uploadRouteSource, /decoded\.uid[^\n]+!== uid/, 'endpoint de imagem mantém ownership do UID')
assert.match(uploadRouteSource, /api\.imgbb\.com\/1\/upload/, 'provider permanece ImgBB')
assert.match(uploadRouteSource, /AbortController/, 'endpoint limita espera do provider')
assert.doesNotMatch(uploadRouteSource, /data\?\.error\?\.message\s*\|\|/, 'mensagem bruta do provider não volta ao navegador')

const fixtureSpecs = [
  { name: 'jpeg-horizontal-4000x3000', width: 4000, height: 3000, format: 'jpeg' },
  { name: 'jpeg-vertical-3000x4000', width: 3000, height: 4000, format: 'jpeg' },
  { name: 'imagem-pequena', width: 640, height: 480, format: 'jpeg' },
  { name: 'png-opaco', width: 1600, height: 1000, format: 'png' },
  { name: 'png-transparente', width: 1600, height: 1000, format: 'png', transparent: true },
  { name: 'webp-grande', width: 2000, height: 1400, format: 'webp' },
  { name: 'jpeg-orientacao-exif-6', width: 1200, height: 2000, format: 'jpeg', orientation: 6 },
]
const metrics = []
for (const spec of fixtureSpecs) {
  const fixture = await createFixture(spec)
  metrics.push(await referenceOptimize(fixture))
}

console.log('Otimização de portfólio: dimensões, MIME, alpha, EXIF, GIF/HEIC, fallback, memória, locks e provider OK')
console.table(metrics)
