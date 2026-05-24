import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDatabase } from 'firebase-admin/database'
import { getMessaging } from 'firebase-admin/messaging'

function normalizePrivateKey(value) {
  return String(value || '').replace(/\\n/g, '\n')
}

function readAdminCredentials() {
  const rawJson = process.env.FIREBASE_ADMIN_CREDENTIALS

  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson)
      return {
        projectId: parsed.project_id || parsed.projectId,
        clientEmail: parsed.client_email || parsed.clientEmail,
        privateKey: normalizePrivateKey(parsed.private_key || parsed.privateKey),
      }
    } catch (error) {
      console.warn('Firebase Admin credentials JSON invalido:', error?.message || error)
      return null
    }
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY)

  if (!projectId || !clientEmail || !privateKey) return null

  return { projectId, clientEmail, privateKey }
}

export function isFirebaseAdminConfigured() {
  return !!readAdminCredentials() && !!process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
}

export function getFirebaseAdminApp() {
  if (getApps().length) return getApps()[0]

  const credentials = readAdminCredentials()

  if (!credentials) {
    throw new Error('Firebase Admin nao configurado.')
  }

  return initializeApp({
    credential: cert(credentials),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
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
