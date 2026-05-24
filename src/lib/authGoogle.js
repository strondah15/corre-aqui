import { auth, database } from "@/lib/firebase";
import {
  browserLocalPersistence,
  getRedirectResult,
  GoogleAuthProvider,
  setPersistence,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { ref, update, serverTimestamp } from "firebase/database";

const provider = new GoogleAuthProvider();
const REDIRECT_PENDING_KEY = "correaqui:googleRedirectPending";

function esperar(ms, valor = null) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(valor), ms);
  });
}

function setRedirectPending() {
  try {
    sessionStorage.setItem(REDIRECT_PENDING_KEY, String(Date.now()));
  } catch {}
}

function clearRedirectPending() {
  try {
    sessionStorage.removeItem(REDIRECT_PENDING_KEY);
  } catch {}
}

export function clearGoogleRedirectPending() {
  clearRedirectPending();
}

export function isGoogleRedirectPending() {
  try {
    const raw = sessionStorage.getItem(REDIRECT_PENDING_KEY);
    const ms = Number(raw || 0);
    return Boolean(ms && Date.now() - ms < 2 * 60 * 1000);
  } catch {
    return false;
  }
}

async function salvarPerfilGoogle(user) {
  if (!user?.uid) return;

  try {
    await Promise.race([
      update(ref(database, `users/${user.uid}`), {
        email: user.email || "",
        authProvider: "google",
        anonimo: false,
        atualizadoEm: serverTimestamp(),
      }),
      esperar(1800),
    ]);

    Promise.race([
      update(ref(database, `users/${user.uid}/auth`), {
        nome: user.displayName || "",
        fotoURL: user.photoURL || null,
        photoURL: user.photoURL || null,
        email: user.email || "",
        provider: "google",
        atualizadoEm: serverTimestamp(),
      }),
      esperar(1800),
    ]).catch(() => {});
  } catch (err) {
    console.warn("Login Google entrou, mas nao salvou auth extra agora:", err);
  }
}

async function ensureAuthPersistence() {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (err) {
    console.warn("Nao foi possivel configurar persistencia local do Firebase Auth:", err);
  }
}

function deveUsarRedirect() {
  if (typeof window === "undefined") return false;

  const ua = window.navigator?.userAgent || "";
  const mobile = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua);
  const narrow = window.matchMedia?.("(max-width: 768px)")?.matches;

  return Boolean(mobile || narrow);
}

export async function signInWithGoogle() {
  try {
    await ensureAuthPersistence();

    if (deveUsarRedirect()) {
      setRedirectPending();
      await signInWithRedirect(auth, provider);
      return null;
    }

    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    clearRedirectPending();
    await salvarPerfilGoogle(user);

    return user;
  } catch (err) {
    clearRedirectPending();
    console.error("Google login error:", err);
    throw err;
  }
}

export async function getGoogleRedirectUser() {
  await ensureAuthPersistence();

  const tinhaRedirectPendente = isGoogleRedirectPending();

  const result = await getRedirectResult(auth).catch((err) => {
    console.error("Google redirect result error:", err);
    clearRedirectPending();
    return null;
  });

  if (result?.user) {
    clearRedirectPending();
    await salvarPerfilGoogle(result.user);
    return result.user;
  }

  if (tinhaRedirectPendente && auth.currentUser?.uid) {
    clearRedirectPending();
    await salvarPerfilGoogle(auth.currentUser);
    return auth.currentUser;
  }

  return null;
}

export async function signInAsGuest() {
  await ensureAuthPersistence();

  const result = await signInAnonymously(auth);
  return result.user;
}
