import { NextResponse } from 'next/server'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDatabase,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin'
import { AI_USAGE_LIMITS, reserveAiUsage } from '@/lib/aiUsagePolicy'

export const runtime = 'nodejs'

const responseHeaders = { 'Cache-Control': 'private, no-store' }

function json(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { ...responseHeaders, ...(init.headers || {}) },
  })
}

async function requireAuthenticatedUser(request) {
  if (!isFirebaseAdminConfigured()) {
    const error = new Error('Firebase Admin nao configurado.')
    error.status = 503
    throw error
  }

  const authorization = request.headers.get('authorization') || ''
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!idToken) {
    const error = new Error('missing_auth_token')
    error.status = 401
    throw error
  }

  try {
    return await getFirebaseAdminAuth().verifyIdToken(idToken)
  } catch {
    const error = new Error('invalid_auth_token')
    error.status = 401
    throw error
  }
}

export async function POST(req) {
  try {
    const decoded = await requireAuthenticatedUser(req)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return json({ error: 'Requisição inválida.' }, { status: 400 })
    }
    const { mensagem } = body
    const texto = String(mensagem || '').trim().slice(0, 2000)

    if (!texto) {
      return json(
        { error: 'Mensagem vazia.' },
        { status: 400 }
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      return json(
        { error: 'Assistente indisponível no momento.' },
        { status: 503 }
      )
    }

    const database = getFirebaseAdminDatabase()
    const usage = await reserveAiUsage({ database, uid: decoded.uid })
    if (!usage.allowed) {
      const retryAfter = Math.max(1, Math.ceil(Number(usage.retryAfterMs || 1_000) / 1_000))
      return json(
        { error: 'Limite de uso do assistente atingido. Tente novamente mais tarde.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      )
    }

    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), AI_USAGE_LIMITS.requestTimeoutMs)
    let resposta
    let data
    try {
      resposta = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'Você é um assistente objetivo dentro do aplicativo Corre Aqui.',
            },
            {
              role: 'user',
              content: texto,
            },
          ],
          temperature: 0.7,
          max_tokens: 600,
        }),
      })
      data = await resposta.json().catch(() => null)
    } finally {
      clearTimeout(timeoutHandle)
    }

    if (!resposta.ok) {
      return json(
        { error: 'Falha ao consultar o assistente.' },
        { status: resposta.status === 429 ? 503 : 502 }
      )
    }

    if (!data || typeof data !== 'object') {
      return json({ error: 'Resposta inválida do assistente.' }, { status: 502 })
    }

    return json(data)
  } catch (error) {
    const timedOut = error?.name === 'AbortError'
    const status = timedOut ? 504 : error?.status || 500
    if (process.env.NODE_ENV !== 'production') {
      console.error('Erro na rota /api/chatgpt:', { name: error?.name, code: error?.code, status })
    }
    return json(
      {
        error: error?.status === 401
          ? 'Autenticação necessária.'
          : timedOut
            ? 'O assistente demorou para responder. Tente novamente.'
            : 'Erro ao processar a mensagem.',
      },
      { status }
    )
  }
}
