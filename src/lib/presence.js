// src/lib/presence.js
import { onDisconnect, onValue, ref, update } from './firebaseDebug';
import { getAuth } from 'firebase/auth';
import { PUBLIC_AVAILABILITY_TTL_MS } from './publicAvailability';
import { subscribeSessionEnding } from './sessionLogout';

const HEARTBEAT_MS = 15_000;
export const ONLINE_TTL_MS = PUBLIC_AVAILABILITY_TTL_MS;
export const USER_ONLINE_PREFERENCE_KEY = "correAqui.userOnlinePreference.v1";
const DEBUG_PREFIX = "[PRESENCE]";
const endingPresenceUids = new Set();
const pendingPresenceWritesByUid = new Map();
export const DEBUG_PRESENCE_ENABLED =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_PRESENCE === "true";

function isBrowser() {
  return typeof window !== "undefined";
}

function debugPresence(message, data) {
  if (!isBrowser() || !DEBUG_PRESENCE_ENABLED) return;
  if (data === undefined) {
    console.log(`${DEBUG_PREFIX} ${message}`);
    return;
  }
  console.log(`${DEBUG_PREFIX} ${message}`, data);
}

function errorPresence(message, data) {
  if (!isBrowser()) return;
  console.error(`${DEBUG_PREFIX} ${message}`, data);
}

function compactPatch(patch = {}) {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}

function trackPresenceWrite(uid, operation) {
  const targetUid = String(uid || '').trim();
  if (!pendingPresenceWritesByUid.has(targetUid)) pendingPresenceWritesByUid.set(targetUid, new Set());
  const writes = pendingPresenceWritesByUid.get(targetUid);
  const tracked = Promise.resolve(operation);
  writes.add(tracked);
  tracked.then(
    () => {
      writes.delete(tracked);
      if (!writes.size) pendingPresenceWritesByUid.delete(targetUid);
    },
    () => {
      writes.delete(tracked);
      if (!writes.size) pendingPresenceWritesByUid.delete(targetUid);
    },
  );
  return tracked;
}

async function waitForPresenceWrites(uid) {
  const targetUid = String(uid || '').trim();
  let writes = pendingPresenceWritesByUid.get(targetUid);
  while (writes?.size) {
    await Promise.allSettled(Array.from(writes));
    writes = pendingPresenceWritesByUid.get(targetUid);
  }
}

export async function updateOwnPresence(database, uid, patch = {}) {
  const targetUid = String(uid || '').trim();
  const authenticatedUid = String(getAuth(database.app).currentUser?.uid || '').trim();
  if (!targetUid || authenticatedUid !== targetUid || endingPresenceUids.has(targetUid)) {
    debugPresence('escrita de presença ignorada sem sessão autenticada correspondente', {
      targetUid: targetUid || null,
      authenticated: !!authenticatedUid,
      sessionEnding: endingPresenceUids.has(targetUid),
    });
    return false;
  }

  await trackPresenceWrite(
    targetUid,
    update(ref(database, `presence/${targetUid}`), compactPatch(patch)),
  );
  return true;
}

function cleanText(value, fallback = "") {
  return String(value || fallback).trim();
}

function getModoAtual() {
  if (!isBrowser()) return "";

  try {
    const modo = String(window.localStorage.getItem("modoApp") || "").toLowerCase();
    return modo === "cliente" || modo === "corre" ? modo : "";
  } catch {
    return "";
  }
}

export function getUserOnlinePreference() {
  if (!isBrowser()) return true;

  try {
    return window.localStorage.getItem(USER_ONLINE_PREFERENCE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setUserOnlinePreference(value) {
  if (!isBrowser()) return;

  try {
    window.localStorage.setItem(USER_ONLINE_PREFERENCE_KEY, value ? "true" : "false");
  } catch {}
}

function buildIdentityPatch(user, extras = {}) {
  const modoAtual = cleanText(extras.modoAtual || getModoAtual());
  const now = Date.now();

  const patch = {
    uid: user.uid,
    id: user.uid,
    online: true,
    disponivel: true,
    lastSeen: now,
    updatedAt: now,
  };

  if (modoAtual) patch.modoAtual = modoAtual;
  return patch;
}

export function startPresence(database, user, extras = {}) {
  if (!database || !user?.uid || !isBrowser()) return () => {};

  const uid = user.uid;
  endingPresenceUids.delete(uid);
  const connectedRef = ref(database, ".info/connected");
  let cancelled = false;
  let presenceDisconnectOperation = null;
  const pendingWrites = new Set();

  const trackWrite = (operation) => {
    const tracked = Promise.resolve(operation);
    pendingWrites.add(tracked);
    tracked.then(
      () => pendingWrites.delete(tracked),
      () => pendingWrites.delete(tracked),
    );
    return tracked;
  };

  const writePresence = (patch, { allowWhenStopped = false } = {}) => {
    if (cancelled && !allowWhenStopped) return Promise.resolve(false);
    return trackWrite(updateOwnPresence(database, uid, patch));
  };

  debugPresence("uid atual", uid);
  debugPresence("usando caminho correto", `presence/${uid}`);
  debugPresence("firebase databaseURL", database?.app?.options?.databaseURL || "databaseURL vazio");

  const saveOnline = async (extraPatch = {}) => {
    if (cancelled) return;

    if (!getUserOnlinePreference()) {
      debugPresence("preferencia offline ativa; mantendo presence offline", uid);
      await writePresence({
        ...buildIdentityPatch(user, extras),
        ...extraPatch,
        online: false,
        disponivel: false,
        lastSeen: Date.now(),
        updatedAt: Date.now(),
        local: null,
        latitude: null,
        longitude: null,
      });
      return;
    }

    debugPresence(`salvando online true em presence/${uid}`, {
      extraKeys: Object.keys(extraPatch || {}),
    });

    try {
      const now = Date.now();
      await writePresence({
        ...buildIdentityPatch(user, extras),
        ...extraPatch,
        online: true,
        disponivel: true,
        lastSeen: now,
        updatedAt: now,
        local: null,
        latitude: null,
        longitude: null,
      });
      debugPresence("salvou online com sucesso", uid);
    } catch (error) {
      errorPresence("erro ao salvar presença", error);
      throw error;
    }
  };

  const saveOffline = () => {
    const now = Date.now();
    return writePresence({
      online: false,
      lastSeen: now,
      updatedAt: now,
      local: null,
      latitude: null,
      longitude: null,
    }, { allowWhenStopped: true }).catch((error) => {
      errorPresence("erro ao salvar presença", error);
    });
  };

  const unsubscribeConnected = onValue(connectedRef, async (snap) => {
    const connected = snap.val() === true;
    debugPresence("conectado .info/connected", { uid, connected });
    if (!connected || cancelled) return;

    try {
      const now = Date.now();
      presenceDisconnectOperation = onDisconnect(ref(database, `presence/${uid}`));
      await trackWrite(presenceDisconnectOperation.update({
        online: false,
        lastSeen: now,
        updatedAt: now,
        local: null,
        latitude: null,
        longitude: null,
      }));
    } catch {}

    try {
      await saveOnline();
    } catch (error) {
      errorPresence("erro ao salvar presença", error);
    }
  });

  const heartbeat = window.setInterval(() => {
    saveOnline().catch((error) => {
      errorPresence("erro ao salvar presença", error);
    });
  }, HEARTBEAT_MS);

  const onExit = () => saveOffline();
  window.addEventListener("pagehide", onExit);
  window.addEventListener("beforeunload", onExit);

  saveOnline().catch((error) => {
      errorPresence("erro ao salvar presença", error);
    });

  let stopped = false;
  let stopPromise = null;
  const stopPresenceRuntime = ({ saveOfflineState = true } = {}) => {
    if (stopped) return stopPromise || Promise.resolve();
    stopped = true;
    cancelled = true;
    window.clearInterval(heartbeat);
    window.removeEventListener("pagehide", onExit);
    window.removeEventListener("beforeunload", onExit);
    unsubscribeConnected();
    const disconnectCleanup = presenceDisconnectOperation?.cancel?.().catch(() => {});
    const offlineCleanup = saveOfflineState ? saveOffline() : Promise.resolve();
    const writesInFlight = Array.from(pendingWrites);
    stopPromise = Promise.allSettled([
      ...writesInFlight,
      disconnectCleanup,
      offlineCleanup,
      waitForPresenceWrites(uid),
    ]).then(() => undefined);
    return stopPromise;
  };
  const unsubscribeSessionEnding = subscribeSessionEnding(uid, () => {
    endingPresenceUids.add(uid);
    return stopPresenceRuntime({ saveOfflineState: false });
  });

  return () => {
    unsubscribeSessionEnding();
    stopPresenceRuntime();
  };
}

export function getOnlineTimestamp(user) {
  const raw = user?.lastSeen ?? user?.updatedAt ?? 0;
  if (!raw) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof raw === "object" && typeof raw.seconds === "number") return raw.seconds * 1000;
  return 0;
}

export function isOnlineRecente(user, now = Date.now()) {
  const seenAt = getOnlineTimestamp(user);
  return (
    user?.online === true &&
    user?.disponivel !== false &&
    user?.showOnlineStatus !== false &&
    Number.isFinite(seenAt) &&
    now - seenAt <= ONLINE_TTL_MS
  );
}

export function hasValidUserLocation(user) {
  const lat = Number(user?.local?.lat);
  const lng = Number(user?.local?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

export function splitUsuariosOnline(usersObj, now = Date.now()) {
  const users = Object.entries(usersObj || {})
    .map(([id, user]) => ({ id, uid: user?.uid || id, ...user }));
  const onlineBrutos = users.filter((user) => (
    user?.online === true &&
    user?.disponivel !== false &&
    user?.showOnlineStatus !== false
  ));
  const usuariosOnlineLista = onlineBrutos
    .filter((user) => {
      const seenAt = getOnlineTimestamp(user);
      const online = isOnlineRecente(user, now);
      if (!online) {
        debugPresence("usuario removido pelo filtro de lastSeen", {
          uid: user?.uid || user?.id || null,
          online: user?.online,
          lastSeen: user?.lastSeen ?? null,
          updatedAt: user?.updatedAt ?? null,
          seenAt,
          idadeMs: seenAt ? now - seenAt : null,
        });
      }
      return online;
    })
    .sort((a, b) => getOnlineTimestamp(b) - getOnlineTimestamp(a));
  const usuariosOnlineMapa = usuariosOnlineLista.filter(hasValidUserLocation);

  debugPresence("presence online brutos", {
    total: onlineBrutos.length,
    uids: onlineBrutos.map((u) => u?.uid || u?.id).slice(0, 12),
  });
  debugPresence("presence online apos filtro de lastSeen", {
    total: usuariosOnlineLista.length,
    uids: usuariosOnlineLista.map((u) => u?.uid || u?.id).slice(0, 12),
  });
  debugPresence("presence com local valido", {
    total: usuariosOnlineMapa.length,
    uids: usuariosOnlineMapa.map((u) => u?.uid || u?.id).slice(0, 12),
  });

  return {
    usuariosOnlineLista,
    usuariosOnlineMapa,
  };
}
