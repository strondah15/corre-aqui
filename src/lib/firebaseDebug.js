'use client'

import { auth } from './firebase'
import {
  get as firebaseGet,
  limitToLast,
  onDisconnect as firebaseOnDisconnect,
  onValue as firebaseOnValue,
  push as firebasePush,
  query,
  ref as firebaseRef,
  remove as firebaseRemove,
  runTransaction as firebaseRunTransaction,
  serverTimestamp,
  set as firebaseSet,
  update as firebaseUpdate,
} from 'firebase/database'

// Temporary diagnostics for locating Realtime Database permission failures.
const DEBUG_DATABASE = true

function getPath(target) {
  const path = target?._path?.toString?.() || target?._query?._path?.toString?.()
  if (path) return path === '.' ? '/' : `/${String(path).replace(/^\/+/, '')}`

  const rawUrl = target?.toString?.()
  if (!rawUrl) return '<caminho-desconhecido>'

  try {
    const url = new URL(rawUrl)
    const pathname = decodeURIComponent(url.pathname || '/').replace(/\/+$/, '')
    return pathname || '/'
  } catch {
    return String(rawUrl)
  }
}

function joinPath(basePath, childPath) {
  const base = String(basePath || '/').replace(/\/+$/, '') || ''
  const child = String(childPath || '').replace(/^\/+/, '')
  return `/${[base.replace(/^\/+/, ''), child].filter(Boolean).join('/')}` || '/'
}

function getAuthState() {
  const user = auth.currentUser
  return {
    uid: user?.uid || null,
    authenticated: Boolean(user),
    authStatus: user ? 'authenticated' : 'not_authenticated',
  }
}

function getErrorDetails(error) {
  return {
    name: error?.name || null,
    code: error?.code || null,
    message: error?.message || String(error),
    stack: error?.stack || null,
    raw: error,
  }
}

function getCallSite() {
  return new Error().stack?.split('\n').slice(3).join('\n') || null
}

function logStart(operation, type, target, extra = {}) {
  if (!DEBUG_DATABASE) return
  console.info('[RTDB DEBUG] operation:start', {
    operation,
    type,
    path: getPath(target),
    callSite: getCallSite(),
    ...getAuthState(),
    ...extra,
  })
}

function logSuccess(operation, type, target, extra = {}) {
  if (!DEBUG_DATABASE) return
  console.info('[RTDB DEBUG] operation:success', {
    operation,
    type,
    path: getPath(target),
    callSite: getCallSite(),
    ...getAuthState(),
    ...extra,
  })
}

function logFailure(operation, type, target, error, extra = {}) {
  if (!DEBUG_DATABASE) return
  const authState = getAuthState()
  console.error('[RTDB DEBUG] operation:error', {
    operation,
    type,
    path: getPath(target),
    uid: authState.uid,
    authenticated: authState.authenticated,
    authStatus: authState.authStatus,
    code: error?.code || null,
    message: error?.message || String(error),
    name: error?.name || null,
    stack: error?.stack || null,
    extra,
    callSite: getCallSite(),
    error: getErrorDetails(error),
  })
}

function affectedPaths(target, payload) {
  const basePath = getPath(target)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [basePath]
  return Object.keys(payload).map((key) => joinPath(basePath, key))
}

function withLoggedPromise(operation, type, target, executor, extra = {}) {
  logStart(operation, type, target, extra)

  let promise
  try {
    promise = executor()
  } catch (error) {
    logFailure(operation, type, target, error, extra)
    throw error
  }

  return Promise.resolve(promise).then(
    (value) => {
      logSuccess(operation, type, target, extra)
      return value
    },
    (error) => {
      logFailure(operation, type, target, error, extra)
      throw error
    },
  )
}

export function ref(...args) {
  return firebaseRef(...args)
}

export function onValue(target, callback, cancelCallbackOrListenOptions, options) {
  const hasCancelCallback = typeof cancelCallbackOrListenOptions === 'function'
  const cancelCallback = hasCancelCallback ? cancelCallbackOrListenOptions : null
  const listenOptions = hasCancelCallback ? options : cancelCallbackOrListenOptions

  logStart('onValue', 'read', target, { listenOptions: listenOptions || null })

  return firebaseOnValue(
    target,
    (snapshot) => {
      logSuccess('onValue', 'read', target, {
        exists: snapshot.exists(),
        childCount: snapshot.exists() && typeof snapshot.numChildren === 'function' ? snapshot.numChildren() : null,
      })
      callback(snapshot)
    },
    (error) => {
      logFailure('onValue', 'read', target, error, { listenOptions: listenOptions || null })
      cancelCallback?.(error)
    },
    listenOptions,
  )
}

export function get(target) {
  return withLoggedPromise('get', 'read', target, () => firebaseGet(target))
}

export function set(target, value) {
  return withLoggedPromise('set', 'write', target, () => firebaseSet(target, value))
}

export function update(target, values) {
  return withLoggedPromise('update', 'write', target, () => firebaseUpdate(target, values), {
    affectedPaths: affectedPaths(target, values),
  })
}

export function remove(target) {
  return withLoggedPromise('remove', 'write', target, () => firebaseRemove(target))
}

export function push(target, value) {
  logStart('push', 'write', target, {
    valueProvided: value !== undefined,
  })

  let result
  try {
    result = firebasePush(target, value)
  } catch (error) {
    logFailure('push', 'write', target, error)
    throw error
  }

  logSuccess('push', 'write', result, {
    parentPath: getPath(target),
    generatedPath: getPath(result),
    valueProvided: value !== undefined,
  })

  if (value !== undefined && typeof result?.then === 'function') {
    Promise.resolve(result).catch((error) => {
      logFailure('push', 'write', result, error, {
        parentPath: getPath(target),
        generatedPath: getPath(result),
      })
    })
  }

  return result
}

export function runTransaction(target, transactionUpdate, options) {
  return withLoggedPromise(
    'runTransaction',
    'write',
    target,
    () => firebaseRunTransaction(target, transactionUpdate, options),
    { options: options || null },
  )
}

export function onDisconnect(target) {
  logStart('onDisconnect', 'write', target)
  const disconnectRef = firebaseOnDisconnect(target)

  return {
    set: (value) => withLoggedPromise('onDisconnect.set', 'write', target, () => disconnectRef.set(value)),
    update: (values) => withLoggedPromise('onDisconnect.update', 'write', target, () => disconnectRef.update(values), {
      affectedPaths: affectedPaths(target, values),
    }),
    remove: () => withLoggedPromise('onDisconnect.remove', 'write', target, () => disconnectRef.remove()),
    cancel: () => withLoggedPromise('onDisconnect.cancel', 'write', target, () => disconnectRef.cancel()),
  }
}

export { limitToLast, query, serverTimestamp }
