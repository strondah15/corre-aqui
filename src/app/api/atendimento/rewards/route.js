import { NextResponse } from 'next/server'
import {
  AttendanceRewardError,
  grantAttendanceRewards,
  isAttendanceGamificationEnabled,
  normalizeAttendanceRewardOrderId,
  parseAttendanceRewardsEnabledFrom,
} from '@/lib/attendanceRewardsServer'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDatabase,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

function jsonError(message, status, reason) {
  return NextResponse.json({ ok: false, error: message, reason }, { status })
}

function sanitizedFailureStage(error) {
  const stage = typeof error?.rewardStage === 'string' ? error.rewardStage : 'request'
  return /^[a-z][a-z0-9_]{0,63}$/.test(stage) ? stage : 'request'
}

function publicErrorFor(code) {
  if (code === 'reward_order_not_found') return 'Pedido não encontrado.'
  if (code === 'reward_actor_not_authorized') return 'Você não pode contabilizar este serviço.'
  if (code === 'reward_order_not_finalized') return 'O atendimento ainda não foi finalizado.'
  if (code === 'reward_completion_request_unverified' || code === 'reward_client_confirmation_unverified') {
    return 'A conclusão do atendimento não pôde ser confirmada.'
  }
  if (code === 'reward_legacy_state_ambiguous'
    || code === 'reward_legacy_ledger_partial'
    || code === 'reward_state_inconsistent') {
    return 'A contabilização anterior deste serviço precisa de verificação.'
  }
  if (code === 'reward_before_activation') return 'Este atendimento é anterior à ativação segura da contabilização.'
  if (code === 'reward_activation_pending') return 'A contabilização de serviços ainda não está ativada.'
  if (code === 'reward_timestamp_invalid') return 'Os horários deste atendimento não puderam ser validados.'
  if (code === 'reward_configuration_invalid') return 'Contabilização de serviços indisponível.'
  if (code === 'reward_professional_profile_required' || code === 'reward_order_mode_invalid') {
    return 'A modalidade deste atendimento não pôde ser validada.'
  }
  if (code === 'reward_request_invalid') return 'Pedido inválido.'
  return 'Não foi possível contabilizar o serviço agora.'
}

export async function POST(request) {
  try {
    if (!isFirebaseAdminConfigured()) {
      return jsonError('Contabilização de serviços indisponível.', 503, 'reward_service_unavailable')
    }

    const authorization = request.headers.get('authorization') || ''
    const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
    if (!idToken) return jsonError('Autenticação necessária.', 401, 'reward_auth_required')

    let decoded
    try {
      decoded = await getFirebaseAdminAuth().verifyIdToken(idToken)
    } catch {
      return jsonError('Sessão expirada.', 401, 'reward_auth_invalid')
    }

    const body = await request.json().catch(() => null)
    const bodyKeys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : []
    const pedidoId = normalizeAttendanceRewardOrderId(body?.pedidoId)
    if (bodyKeys.length !== 1 || bodyKeys[0] !== 'pedidoId' || !pedidoId) {
      return jsonError('Pedido inválido.', 400, 'reward_request_invalid')
    }

    const result = await grantAttendanceRewards({
      database: getFirebaseAdminDatabase(),
      pedidoId,
      actorUid: decoded.uid,
      rewardsEnabledFrom: parseAttendanceRewardsEnabledFrom(
        process.env.ATTENDANCE_REWARDS_ENABLED_FROM,
      ),
      gamificationEnabled: isAttendanceGamificationEnabled(
        process.env.ATTENDANCE_GAMIFICATION_ENABLED,
      ),
      gamificationEnabledFrom: parseAttendanceRewardsEnabledFrom(
        process.env.ATTENDANCE_GAMIFICATION_ENABLED_FROM,
      ),
    })

    return NextResponse.json({
      ok: true,
      pedidoId: result.pedidoId,
      contabilizado: result.contabilizado,
      alreadyGranted: result.alreadyGranted,
      mode: result.mode,
      serviceCounted: result.serviceCounted,
      gamificationStatus: result.gamificationStatus,
    })
  } catch (error) {
    const knownError = error instanceof AttendanceRewardError
    const reason = knownError ? error.code : 'reward_persistence_failed'
    const status = knownError ? error.status : 500
    const failure = {
      event: 'reward_failed',
      stage: sanitizedFailureStage(error),
      code: reason,
      category: knownError ? 'domain' : 'unexpected',
    }
    if (status >= 500) console.error('[ATTENDANCE_REWARD]', failure)
    else console.warn('[ATTENDANCE_REWARD]', failure)
    return jsonError(publicErrorFor(reason), status, reason)
  }
}
