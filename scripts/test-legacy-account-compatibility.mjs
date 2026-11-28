import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/lib/legacyAccountState.js', import.meta.url), 'utf8')
const account = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const map = await readFile(new URL('../src/components/Mapadinamico.jsx', import.meta.url), 'utf8')
const modal = await readFile(new URL('../src/components/ModalIA.jsx', import.meta.url), 'utf8')
const modeGate = await readFile(new URL('../src/components/ModoGate.jsx', import.meta.url), 'utf8')

const canonicalB = account.resolveLegacyAccountState({
  uid: 'B',
  sources: [{
    isCorre: true,
    isProfissional: true,
    visivel: true,
    profileVisible: true,
    showOnlineStatus: true,
    profileType: 'professional',
  }],
})
assert.equal(canonicalB.uid, 'B')
assert.equal(canonicalB.isCorre, true)
assert.equal(canonicalB.isProfissional, true)
assert.equal(canonicalB.workProfileType, 'professional', 'estrutura saudável mantém tipo canônico declarado')

const aliases = [
  [{ profileType: 'professional' }, true, true],
  [{ workProfileType: 'corre' }, true, false],
  [{ tipoPerfilPublico: 'ambos' }, true, true],
  [{ tipoTrabalho: 'corre' }, true, false],
  [{ tipoConta: 'profissional' }, true, true],
  [{ tipoContaInicial: 'corre' }, true, false],
  [{ isProf: true }, false, true],
  [{ corre: { ativo: true } }, true, false],
  [{ profissional: { ativo: true } }, false, true],
  [{ profissional: { isCorre: true, isProfissional: true } }, true, true],
]
for (const [legacy, expectedCorre, expectedProfessional] of aliases) {
  const resolved = account.resolveLegacyAccountState({ uid: 'A', sources: [legacy] })
  assert.equal(resolved.isCorre, expectedCorre)
  assert.equal(resolved.isProfissional, expectedProfessional)
}

const explicitFalse = account.resolveLegacyAccountState({
  uid: 'A',
  sources: [{
    isCorre: false,
    isProfissional: false,
    tipoContaInicial: 'profissional',
    corre: { ativo: true },
    profissional: { ativo: true },
  }],
})
assert.equal(explicitFalse.isCorre, false, 'false canônico vence alias Corre')
assert.equal(explicitFalse.isProfissional, false, 'false canônico vence alias profissional')
assert.equal('admin' in explicitFalse, false, 'adaptador não produz privilégio de admin')
assert.equal('verificado' in explicitFalse, false, 'adaptador não produz verificação')
assert.equal('reputacao' in explicitFalse, false, 'adaptador não produz reputação')

assert.match(map, /resolveLegacyAccountState/)
assert.match(map, /\[LEGACY_ONLINE\]/, 'trace A/B possui marcador dedicado')
for (const field of ['legacyRoleDetected', 'canonicalRole', 'publicProfileExists', 'normalizationResult', 'eligible', 'setAttempted', 'setSucceeded', 'heartbeatStarted']) {
  assert.match(map, new RegExp(field), `trace online inclui ${field}`)
}
assert.match(modeGate, /resolveLegacyAccountState/)
assert.match(map, /uid:\s*meuId[\s\S]*sessionStorage\.setItem/, 'estado de lista é associado à conta atual')
assert.match(map, /String\(saved\.uid \|\| ''\) !== String\(meuId\)/, 'filtro salvo de outra conta não é restaurado')
assert.match(map, /<ModalIA[\s\S]*meuId=\{meuId\}[\s\S]*meuNome=\{meuNome\}/, 'writer recebe identidade reativa da autenticação')
assert.match(modal, /auth\.currentUser\?\.uid/)
assert.match(modal, /authenticatedUid !== meuId/)
assert.doesNotMatch(modal, /localStorage\.getItem\('meuId'\)/, 'writer não captura UID legado do aparelho')
assert.doesNotMatch(modal, /criador:\s*\{[^}]*id:\s*meuId\s*\|\|\s*null/, 'writer não publica criador nulo')

console.log('Compatibilidade legada: aliases A, false explícito, B canônica, filtros por UID e writer autenticado OK')
