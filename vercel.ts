const isStagingPreview = process.env.VERCEL_ENV === 'preview'
  && (!process.env.VERCEL_TARGET_ENV || process.env.VERCEL_TARGET_ENV === 'preview')
  && process.env.VERCEL_GIT_COMMIT_REF === 'codex/staging/consolidated-2026-09-07'
  && process.env.VERCEL_PROJECT_ID === 'prj_M3gKqNx4UkEzAEgL4pcyoYG5kTUB'

export const config = isStagingPreview ? {
  schedules: {
    'subscription-reconciliation': {
      schedule: '*/30 * * * *',
      path: '/api/internal/subscription-reconciliation',
      requestMethod: 'POST',
    },
  },
} : {}
