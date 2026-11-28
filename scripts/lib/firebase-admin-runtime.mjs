import { cert, deleteApp, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

const normalizePrivateKey = (value) => String(value || '').replace(/\\n/g, '\n')

function readCredentials() {
  const raw = process.env.FIREBASE_ADMIN_CREDENTIALS
  if (raw) {
    const parsed = JSON.parse(raw)
    return {
      projectId: parsed.project_id || parsed.projectId,
      clientEmail: parsed.client_email || parsed.clientEmail,
      privateKey: normalizePrivateKey(parsed.private_key || parsed.privateKey),
    }
  }

  return {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY),
  }
}

export function createFirebaseAdminDatabase(label = 'public-request-audit') {
  const credentials = readCredentials()
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
  if (!credentials.projectId || !credentials.clientEmail || !credentials.privateKey || !databaseURL) {
    throw new Error('Firebase Admin não está configurado para a auditoria.')
  }

  const app = initializeApp({
    credential: cert(credentials),
    databaseURL,
  }, `${label}-${process.pid}-${Date.now()}`)

  return {
    database: getDatabase(app),
    close: () => deleteApp(app),
  }
}
