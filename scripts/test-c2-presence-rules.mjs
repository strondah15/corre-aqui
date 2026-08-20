import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const availabilityHelperSource = await readFile(
  new URL('../src/lib/publicAvailability.js', import.meta.url),
  'utf8'
)
const availabilityHelper = await import(
  `data:text/javascript;base64,${Buffer.from(availabilityHelperSource).toString('base64')}`
)
const { canPublishPublicAvailability, getPublicAvailabilityLocation, toPublicAvailabilityGrid } = availabilityHelper

const rules = JSON.parse(
  await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')
).rules

const presence = rules.presence
const legacyPresence = rules.usuariosOnline
const availability = rules.publicAvailability

assert.equal(presence['.read'], undefined, 'presence nao pode ser enumeravel')
assert.equal(presence.$uid['.read'], 'auth != null && auth.uid === $uid')
assert.equal(presence.$uid['.write'], 'auth != null && auth.uid === $uid')
assert.equal(legacyPresence.$uid['.read'], 'auth != null && auth.uid === $uid')
assert.equal(availability['.read'], 'auth != null')
assert.equal(availability.$uid['.write'], 'auth != null && auth.uid === $uid')
assert.equal(availability.$uid.$other['.validate'], false)
for (const locationField of ['local', 'location', 'localizacao', 'geo', 'coordenadas', 'lat', 'lng', 'latitude', 'longitude']) {
  assert.match(rules.publicProfiles.$uid['.validate'], new RegExp(`!newData\\.child\\('${locationField}'\\)\\.exists`))
}

const ownsPath = (authUid, targetUid) => Boolean(authUid) && authUid === targetUid
assert.equal(ownsPath('A', 'A'), true, 'A escreve sua presenca')
assert.equal(ownsPath('A', 'B'), false, 'A nao escreve presenca de B')
assert.equal(ownsPath('B', 'A'), false, 'B nao escreve presenca de A')
assert.equal(ownsPath(null, 'A'), false, 'nao autenticado nao escreve presenca')
assert.equal(ownsPath('A', 'B'), false, 'A nao le presenca privada de B')
assert.equal(Boolean('A') && availability['.read'] === 'auth != null', true, 'A enumera apenas disponibilidade publica')

const precise = { lat: -23.5505199, lng: -46.6333094 }
assert.deepEqual(toPublicAvailabilityGrid(precise), { gridLat: -2355, gridLng: -4663 })
assert.deepEqual(getPublicAvailabilityLocation({ gridLat: -2355, gridLng: -4663 }), { lat: -23.55, lng: -46.63 })
assert.equal(canPublishPublicAvailability({ mode: 'cliente', available: true, onlinePreference: true, publicProfileReady: true }), false)
assert.equal(canPublishPublicAvailability({ mode: 'corre', available: true, onlinePreference: true, publicProfileReady: true }), true)
assert.equal(canPublishPublicAvailability({ mode: 'corre', available: false, onlinePreference: true, publicProfileReady: true }), false)
assert.equal(canPublishPublicAvailability({ mode: 'corre', available: true, onlinePreference: true, showOnlineStatus: false, publicProfileReady: true }), false)

const mapSource = await readFile(new URL('../src/components/Mapadinamico.jsx', import.meta.url), 'utf8')
const onlineSource = await readFile(new URL('../src/components/UsuariosOnline.js', import.meta.url), 'utf8')
assert.doesNotMatch(mapSource, /ref\(database, ['"]presence['"]\)/)
assert.doesNotMatch(onlineSource, /ref\(database, ['"]presence['"]\)/)
assert.match(mapSource, /ref\(database, 'publicAvailability'\)/)
assert.match(onlineSource, /ref\(database, 'publicAvailability'\)/)

console.log('C2 estatico: matriz A/B/C, enumeracao e grade publica aproximada OK')
