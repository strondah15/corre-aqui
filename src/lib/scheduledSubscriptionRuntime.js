import { timingSafeEqual } from 'node:crypto'
import { assessFirebaseEnvironment } from './commercialRuntimeConfig.js'

const STAGING_BRANCH = 'codex/staging/consolidated-2026-09-07'
const VERCEL_PROJECT_ID = 'prj_M3gKqNx4UkEzAEgL4pcyoYG5kTUB'
const FIREBASE_PROJECT_ID = 'corre-aqui-staging'
const FIREBASE_DATABASE_ORIGIN = 'https://corre-aqui-staging-default-rtdb.firebaseio.com'

export function isScheduledSubscriptionStaging(env = process.env) {
  if (env.CORRE_AQUI_ENV !== 'staging'
    || env.VERCEL_ENV !== 'preview'
    || (env.VERCEL_TARGET_ENV && env.VERCEL_TARGET_ENV !== 'preview')
    || env.VERCEL_GIT_COMMIT_REF !== STAGING_BRANCH
    || env.VERCEL_PROJECT_ID !== VERCEL_PROJECT_ID
    || env.MERCADO_PAGO_CREDENTIAL_ENV !== 'test'
    || !env.MERCADO_PAGO_ACCESS_TOKEN?.trim()
    || env.FIREBASE_DATABASE_EMULATOR_HOST
    || env.FIREBASE_AUTH_EMULATOR_HOST) return false

  const firebase = assessFirebaseEnvironment(env)
  return firebase.valid
    && firebase.adminProjectId === FIREBASE_PROJECT_ID
    && firebase.clientProjectId === FIREBASE_PROJECT_ID
    && firebase.adminDatabaseOrigin === FIREBASE_DATABASE_ORIGIN
    && firebase.clientDatabaseOrigin === FIREBASE_DATABASE_ORIGIN
}

export function isAuthorizedSubscriptionSchedule(authorization, secret) {
  if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(secret)) return false
  if (typeof authorization !== 'string') return false

  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(authorization)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
