export const BASIC_USER_SYNC_FIELDS = Object.freeze([
  'uid',
  'id',
  'email',
  'anonimo',
  'authProvider',
  'atualizadoEm',
  'updatedAt',
  'modoAtual',
  'criadoEm',
  'nome',
  'fotoURL',
  'photoURL',
  'avatarEmoji',
])

export function buildBasicUserSyncPayload(values = {}) {
  return Object.fromEntries(
    BASIC_USER_SYNC_FIELDS
      .filter((key) => values[key] !== undefined)
      .map((key) => [key, values[key]])
  )
}
