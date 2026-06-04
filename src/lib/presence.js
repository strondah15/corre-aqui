// src/lib/presence.js
import { onDisconnect, onValue, ref, update } from "firebase/database";

const HEARTBEAT_MS = 15_000;
const LOCATION_REFRESH_MS = 60_000;
export const ONLINE_TTL_MS = 60_000;
const DEBUG_PREFIX = "[PRESENCE]";

function isBrowser() {
  return typeof window !== "undefined";
}

function debugPresence(message, data) {
  if (!isBrowser()) return;
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

async function updatePresencePath(database, uid, patch = {}) {
  await update(ref(database, `presence/${uid}`), compactPatch(patch));
}

function cleanText(value, fallback = "") {
  return String(value || fallback).trim();
}

function isFotoValor(value) {
  return /^(https?:\/\/|data:image\/|blob:|\/)/i.test(String(value || "").trim());
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

function getMyLocation() {
  return new Promise((resolve) => {
    if (!isBrowser() || !navigator.geolocation) {
      debugPresence("localizacao negada/indisponivel", { motivo: "geolocation indisponivel" });
      return resolve(null);
    }

    try {
      navigator.permissions?.query?.({ name: "geolocation" }).then((permission) => {
        debugPresence("localizacao permissao", { state: permission?.state || "desconhecido" });
      }).catch(() => {});
    } catch {}

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos?.coords?.latitude);
        const lng = Number(pos?.coords?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          debugPresence("localizacao negada/indisponivel", { motivo: "coordenada invalida" });
          return resolve(null);
        }
        debugPresence("localizacao permitida", { lat, lng });
        resolve({ lat, lng });
      },
      (error) => {
        debugPresence("localizacao negada", {
          code: error?.code || null,
          message: error?.message || "sem detalhe",
        });
        resolve(null);
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 },
    );
  });
}

function buildIdentityPatch(user, extras = {}) {
  const nome = cleanText(extras.nome || user?.displayName, user?.isAnonymous ? "Visitante" : "Usuario");
  const fotoURL = cleanText(extras.fotoURL || user?.photoURL);
  const modoAtual = cleanText(extras.modoAtual || getModoAtual());
  const now = Date.now();

  const patch = {
    uid: user.uid,
    id: user.uid,
    nome,
    online: true,
    lastSeen: now,
    updatedAt: now,
  };

  if (modoAtual) patch.modoAtual = modoAtual;
  if (user.email) patch.email = user.email;
  if (isFotoValor(fotoURL)) patch.fotoURL = fotoURL;

  return patch;
}

export function startPresence(database, user, extras = {}) {
  if (!database || !user?.uid || !isBrowser()) return () => {};

  const uid = user.uid;
  const connectedRef = ref(database, ".info/connected");
  let cancelled = false;

  debugPresence("uid atual", uid);
  debugPresence("usando caminho correto", `presence/${uid}`);
  debugPresence("firebase databaseURL", database?.app?.options?.databaseURL || "databaseURL vazio");

  const saveOnline = async (extraPatch = {}) => {
    if (cancelled) return;

    debugPresence(`salvando online true em presence/${uid}`, {
      extraKeys: Object.keys(extraPatch || {}),
    });

    try {
      const now = Date.now();
      await updatePresencePath(database, uid, {
        ...buildIdentityPatch(user, extras),
        ...extraPatch,
        online: true,
        lastSeen: now,
        updatedAt: now,
      });
      debugPresence("salvou online com sucesso", uid);
    } catch (error) {
      errorPresence("erro ao salvar presença", error);
      throw error;
    }
  };

  const saveLocation = async () => {
    const local = await getMyLocation();
    if (cancelled || !local) return null;

    try {
      const now = Date.now();
      await updatePresencePath(database, uid, {
        local,
        latitude: local.lat,
        longitude: local.lng,
        updatedAt: now,
      });
      debugPresence("local salvo", local);
    } catch (error) {
      errorPresence("erro ao salvar presença", error);
      throw error;
    }

    return local;
  };

  const saveOffline = () => {
    const now = Date.now();
    updatePresencePath(database, uid, {
      online: false,
      lastSeen: now,
      updatedAt: now,
    }).catch((error) => {
      errorPresence("erro ao salvar presença", error);
    });
  };

  const unsubscribeConnected = onValue(connectedRef, async (snap) => {
    const connected = snap.val() === true;
    debugPresence("conectado .info/connected", { uid, connected });
    if (!connected || cancelled) return;

    try {
      const now = Date.now();
      await onDisconnect(ref(database, `presence/${uid}`)).update({
        online: false,
        lastSeen: now,
        updatedAt: now,
      });
    } catch {}

    try {
      await saveOnline();
      await saveLocation();
    } catch (error) {
      errorPresence("erro ao salvar presença", error);
    }
  });

  const heartbeat = window.setInterval(() => {
    saveOnline().catch((error) => {
      errorPresence("erro ao salvar presença", error);
    });
  }, HEARTBEAT_MS);

  const locationTimer = window.setInterval(() => {
    saveLocation().catch(() => {});
  }, LOCATION_REFRESH_MS);

  const onExit = () => saveOffline();
  window.addEventListener("pagehide", onExit);
  window.addEventListener("beforeunload", onExit);

  saveOnline()
    .then(() => saveLocation())
    .catch((error) => {
      errorPresence("erro ao salvar presença", error);
    });

  return () => {
    cancelled = true;
    window.clearInterval(heartbeat);
    window.clearInterval(locationTimer);
    window.removeEventListener("pagehide", onExit);
    window.removeEventListener("beforeunload", onExit);
    unsubscribeConnected();
    saveOffline();
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
  return user?.online === true && Number.isFinite(seenAt) && now - seenAt <= ONLINE_TTL_MS;
}

export function hasValidUserLocation(user) {
  const lat = Number(user?.local?.lat);
  const lng = Number(user?.local?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

export function splitUsuariosOnline(usersObj, now = Date.now()) {
  const users = Object.entries(usersObj || {})
    .map(([id, user]) => ({ id, uid: user?.uid || id, ...user }));
  const onlineBrutos = users.filter((user) => user?.online === true);
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
