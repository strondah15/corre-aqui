import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildProfessionalServiceContractSnapshot,
  ensureProfessionalPortfolioSchemaV2,
  listPublicProfessionalServiceCatalog,
  listPublicProfessionalServices,
  resolveAuthoritativeProfessionalService,
} from '../src/lib/professionalServiceCatalog.js'

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

function getAt(root, path) {
  return String(path || '').split('/').filter(Boolean).reduce((current, key) => current?.[key], root)
}

function setAt(root, path, value) {
  const keys = String(path || '').split('/').filter(Boolean)
  let current = root
  keys.slice(0, -1).forEach((key) => {
    if (!current[key] || typeof current[key] !== 'object') current[key] = {}
    current = current[key]
  })
  if (value === null) delete current[keys.at(-1)]
  else current[keys.at(-1)] = clone(value)
}

class FakeSnapshot {
  constructor(value) {
    this.value = clone(value)
  }

  val() {
    return clone(this.value)
  }

  exists() {
    return this.value !== undefined && this.value !== null
  }
}

class FakeDatabase {
  constructor(value) {
    this.value = clone(value)
    this.updates = []
  }

  ref(path = '') {
    return {
      get: async () => new FakeSnapshot(path ? getAt(this.value, path) : this.value),
      update: async (updates) => {
        this.updates.push(clone(updates))
        Object.entries(updates || {}).forEach(([target, value]) => setAt(this.value, target, value))
      },
    }
  }
}

const now = 1_800_000_000_000
const canonicalService = (id, overrides = {}) => ({
  schemaVersion: 2,
  id,
  nome: 'Instalação elétrica',
  descricao: 'Serviço canônico validado.',
  categoriaId: 'reparos',
  categoriaNome: 'Reparos',
  faixaPreco: 'R$ 120',
  tempoMedio: '2 horas',
  regiao: 'São Paulo',
  atendeDomicilio: true,
  urgente: false,
  ativo: true,
  fotos: { 0: `https://images.example.test/${id}.webp` },
  createdAt: now - 2_000,
  updatedAt: now - 1_000,
  revision: 3,
  ...overrides,
})

const database = new FakeDatabase({
  users: {
    canonical: {
      nome: 'Profissional canônico',
      portfolioSchemaVersion: 2,
      portfolio: {
        old: { id: 'old', nome: 'Legado que não pode voltar', ativo: true },
      },
    },
    legacy: {
      nome: 'Profissional legado',
      portfolio: {
        'legacy-active': {
          id: 'legacy-active',
          nome: 'Pintura legada',
          categoriaId: 'reparos',
          categoriaNome: 'Reparos',
          valor: 'R$ 80',
          ativo: true,
        },
        'legacy-inactive': { id: 'legacy-inactive', nome: 'Inativo', ativo: false },
      },
    },
    marker: { nome: 'Conta a marcar' },
  },
  publicProfiles: {
    canonical: {
      uid: 'canonical',
      id: 'canonical',
      nome: 'Profissional canônico',
      isProfissional: true,
      portfolioSchemaVersion: 2,
      portfolio: { old: { id: 'old', nome: 'Não ressuscitar', ativo: true } },
    },
    legacy: {
      uid: 'legacy',
      id: 'legacy',
      nome: 'Profissional legado',
      isProfissional: true,
      profTitulo: 'Pintor',
      profCategorias: ['reparos'],
    },
    marker: {
      uid: 'marker',
      id: 'marker',
      nome: 'Conta a marcar',
      isProfissional: true,
    },
  },
  professionalServices: {
    canonical: {
      active: canonicalService('active'),
      inactive: canonicalService('inactive', { ativo: false }),
    },
    legacy: {
      stray: canonicalService('stray', { nome: 'Canônico sem marcador' }),
    },
  },
  publicPortfolio: {
    legacy: {
      'legacy-active': {
        id: 'legacy-active',
        nome: 'Pintura legada',
        categoriaId: 'reparos',
        categoriaNome: 'Reparos',
        valor: 'R$ 80',
        ativo: true,
      },
    },
  },
})

const canonical = await listPublicProfessionalServices({ database, professionalId: 'canonical', now })
assert.equal(canonical.source, 'canonical')
assert.equal(canonical.portfolioSchemaVersion, 2)
assert.deepEqual(canonical.services.map(({ id }) => id), ['active'], 'serviço inativo fica oculto')
assert.equal(canonical.services[0].fotos[0], 'https://images.example.test/active.webp')
assert.equal(canonical.services.some(({ id }) => id === 'old'), false, 'legado não ressuscita em schema v2')

const legacy = await listPublicProfessionalServices({ database, professionalId: 'legacy', now })
assert.equal(legacy.source, 'legacy')
assert.deepEqual(legacy.services.map(({ id }) => id), ['legacy-active'])
assert.equal(legacy.services.some(({ id }) => id === 'stray'), false, 'coleção v2 sem marcador não ativa o schema')
const authoritative = await resolveAuthoritativeProfessionalService({
  database,
  professionalId: 'legacy',
  serviceId: 'legacy-active',
  now,
})
assert.equal(authoritative.source, 'legacy')
await assert.rejects(
  resolveAuthoritativeProfessionalService({ database, professionalId: 'canonical', serviceId: 'inactive', now }),
  (error) => error?.code === 'professional_service_not_found',
)

const snapshot = buildProfessionalServiceContractSnapshot(canonical.services[0], {
  professionalId: 'canonical',
  capturedAt: now,
})
database.value.professionalServices.canonical.active.nome = 'Nome editado depois da contratação'
database.value.professionalServices.canonical.active.faixaPreco = 'R$ 999'
assert.equal(snapshot.nome, 'Instalação elétrica')
assert.equal(snapshot.valor, 'R$ 120')
assert.equal(snapshot.sourceRevision, 3)
assert.equal(snapshot.professionalId, 'canonical')

const catalog = await listPublicProfessionalServiceCatalog({
  database,
  professionalIds: ['canonical', 'legacy'],
  now,
})
assert.deepEqual(Object.keys(catalog).sort(), ['canonical', 'legacy'])

await ensureProfessionalPortfolioSchemaV2({ database, uid: 'marker' })
assert.equal(database.value.users.marker.portfolioSchemaVersion, 2)
assert.equal(database.value.publicProfiles.marker.portfolioSchemaVersion, 2)
assert.equal(database.updates.length, 1, 'marcador privado e público usa update único')
await ensureProfessionalPortfolioSchemaV2({ database, uid: 'marker' })
assert.equal(database.updates.length, 1, 'marcação repetida é idempotente')

const [mapSource, profileSource, homeSource, privateRouteSource, featuredRouteSource, rulesSource] = await Promise.all([
  readFile(new URL('../src/components/Mapadinamico.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/PerfilPublico.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/ClienteHome.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/private-requests/create/route.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/featured-professionals/route.js', import.meta.url), 'utf8'),
  readFile(new URL('../database.rules.json', import.meta.url), 'utf8'),
])
assert.doesNotMatch(mapSource, /ref\(database, ['"]publicPortfolio['"]\)/, 'vitrine não enumera listener legado global')
assert.match(mapSource, /listPublicProfessionalServiceCatalog/)
assert.match(profileSource, /usePublicProfessionalServices/)
assert.match(homeSource, /portfolioCatalogResolved/)
assert.match(privateRouteSource, /resolveAuthoritativeProfessionalService/)
assert.match(privateRouteSource, /buildProfessionalServiceContractSnapshot/)
assert.ok(
  privateRouteSource.indexOf('resolveAuthoritativeProfessionalService') < privateRouteSource.indexOf('database.ref().update({'),
  'serviço autoritativo é validado antes da criação da solicitação',
)
assert.doesNotMatch(privateRouteSource, /service_\$\{now\}/, 'backend não inventa serviceId')
assert.match(featuredRouteSource, /listPublicProfessionalServices/)
assert.match(rulesSource, /portfolioSchemaVersion/)

console.log('Professional Service consumers v2: catálogo, legado, snapshots, contratação e vitrine OK')
