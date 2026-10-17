import { getFirebaseAdminConfigurationStatus } from '@/lib/firebaseAdmin'
import { assessFirebaseClientConfiguration } from '@/lib/firebaseClientConfig'

export async function GET(request) {
  const vapidKey = process.env.FIREBASE_VAPID_KEY || process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || ''
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  }
  const hostname = (() => {
    try {
      return new URL(request.url).hostname
    } catch {
      return ''
    }
  })()
  const clientStatus = assessFirebaseClientConfiguration(config, { hostname })
  const adminStatus = getFirebaseAdminConfigurationStatus()

  if (!clientStatus.valid || !adminStatus.configured) {
    return Response.json(
      { error: 'firebase_environment_invalid' },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  }

  return Response.json(
    {
      config,
      vapidKey,
      vapidKeyConfigured: Boolean(vapidKey),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
