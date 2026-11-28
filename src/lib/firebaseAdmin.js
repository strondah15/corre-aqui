import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDatabase } from 'firebase-admin/database'
import { getMessaging } from 'firebase-admin/messaging'
import {
  assessFirebaseEnvironment,
  normalizeFirebaseDatabaseUrl,
} from '@/lib/commercialRuntimeConfig'

function normalizePrivateKey(value) {
  return String(value || '').replace(/\\n/g, '\n')
}

function readAdminCredentials(env = process.env) {
  const rawJson = env.FIREBASE_ADMIN_CREDENTIALS

  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson)
      return {
        projectId: parsed.project_id || parsed.projectId,
        clientEmail: parsed.client_email || parsed.clientEmail,
        privateKey: normalizePrivateKey(parsed.private_key || parsed.privateKey),
      }
    } catch {
      return null
    }
  }

  const projectId = env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = normalizePrivateKey(env.FIREBASE_ADMIN_PRIVATE_KEY)

  if (!projectId || !clientEmail || !privateKey) return null

  return { projectId, clientEmail, privateKey }
}

function safeText(value) {
  return String(value || '').trim()
}

function getAdminDatabaseUrl(env = process.env) {
  return safeText(env.FIREBASE_ADMIN_DATABASE_URL || env.NEXT_PUBLIC_FIREBASE_DATABASE_URL)
}

export function getFirebaseAdminConfigurationStatus(env = process.env) {
  const credentials = readAdminCredentials(env)
  const databaseURL = getAdminDatabaseUrl(env)
  const assessment = assessFirebaseEnvironment(env, {
    requireEnvironment: true,
    requireExplicitAdminDatabase: true,
    requireClientConfiguration: true,
  })

  return Object.freeze({
    configured: !!credentials && !!databaseURL && assessment.valid,
    issues: assessment.issues,
    projectId: credentials?.projectId || '',
    databaseOrigin: normalizeFirebaseDatabaseUrl(databaseURL).origin,
  })
}

export function isFirebaseAdminConfigured() {
  return getFirebaseAdminConfigurationStatus().configured
}

function configurationError(issues = []) {
  const error = new Error('Firebase Admin nao configurado para o ambiente esperado.')
  error.code = 'firebase_admin_environment_invalid'
  error.configurationIssues = Array.from(issues)
  return error
}

function assertExistingAppMatches(existingApp, { projectId, databaseURL }) {
  const options = existingApp?.options || {}
  const existingProjectId = safeText(options.projectId || options.credential?.projectId)
  const existingDatabase = normalizeFirebaseDatabaseUrl(options.databaseURL)
  const configuredDatabase = normalizeFirebaseDatabaseUrl(databaseURL)
  const issues = []

  if (!existingProjectId) issues.push('firebase_admin_existing_app_project_unknown')
  else if (existingProjectId !== projectId) issues.push('firebase_admin_existing_app_project_mismatch')

  if (!existingDatabase.valid) issues.push('firebase_admin_existing_app_database_unknown')
  else if (!configuredDatabase.valid || existingDatabase.origin !== configuredDatabase.origin) {
    issues.push('firebase_admin_existing_app_database_mismatch')
  }

  if (issues.length) throw configurationError(issues)
}

export function getFirebaseAdminApp() {
  const status = getFirebaseAdminConfigurationStatus()
  const credentials = readAdminCredentials()
  const databaseURL = getAdminDatabaseUrl()

  if (!status.configured || !credentials || !databaseURL) throw configurationError(status.issues)

  const existingApp = getApps().find((candidate) => candidate.name === '[DEFAULT]')
  if (existingApp) {
    assertExistingAppMatches(existingApp, {
      projectId: credentials.projectId,
      databaseURL,
    })
    return existingApp
  }

  return initializeApp({
    credential: cert(credentials),
    projectId: credentials.projectId,
    databaseURL,
  })
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp())
}

export function getFirebaseAdminDatabase() {
  return getDatabase(getFirebaseAdminApp())
}

export function getFirebaseAdminMessaging() {
  return getMessaging(getFirebaseAdminApp())
}
