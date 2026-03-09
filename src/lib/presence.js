// src/lib/presence.js
import { ref, onValue, update, onDisconnect, serverTimestamp } from "firebase/database";

async function getMyLocation() {
  return await new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

export function startPresence(database, meuId, meuNome) {
  if (!meuId) return () => {};

  let cancelled = false;

  const userRef = ref(database, `users/${meuId}`);
  const connectedRef = ref(database, ".info/connected");

  const markOfflineNow = () => {
    update(userRef, {
      online: false,
      lastSeen: Date.now(),
      updatedAt: serverTimestamp?.() || Date.now(),
    }).catch(() => {});
  };

  const offConnected = onValue(connectedRef, async (snap) => {
    const connected = !!snap.val();
    if (!connected || cancelled) return;

    // arma o onDisconnect ANTES de marcar online
    try {
      await onDisconnect(userRef).update({
        online: false,
        lastSeen: Date.now(),
        updatedAt: Date.now(), // best-effort
      });
    } catch {}

    const local = await getMyLocation();
    if (cancelled) return;

    await update(userRef, {
      id: meuId,
      nome: meuNome || "Anônimo",
      online: true,
      local: local || null,
      lastSeen: Date.now(),
      updatedAt: serverTimestamp?.() || Date.now(),
    });
  });

  const heartbeat = setInterval(() => {
    update(userRef, {
      online: true,
      lastSeen: Date.now(),
      updatedAt: serverTimestamp?.() || Date.now(),
    }).catch(() => {});
  }, 15000);

  window.addEventListener("beforeunload", markOfflineNow);
  window.addEventListener("pagehide", markOfflineNow);

  return () => {
    cancelled = true;
    clearInterval(heartbeat);
    offConnected();
    window.removeEventListener("beforeunload", markOfflineNow);
    window.removeEventListener("pagehide", markOfflineNow);
    markOfflineNow();
  };
}
