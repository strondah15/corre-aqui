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

async function salvarPerfilGoogle(user) {
  if (!user?.uid) return;

  await update(ref(database, `users/${user.uid}`), {
    email: user.email || "",
    authProvider: "google",
    anonimo: false,
    atualizadoEm: serverTimestamp(),
  });

  await update(ref(database, `users/${user.uid}/auth`), {
    nome: user.displayName || "",
    fotoURL: user.photoURL || null,
    photoURL: user.photoURL || null,
    email: user.email || "",
    provider: "google",
    atualizadoEm: serverTimestamp(),
  });
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
      await signInWithRedirect(auth, provider);
      return null;
    }

    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    await salvarPerfilGoogle(user);

    return user;
  } catch (err) {
    console.error("Google login error:", err);
    throw err;
  }
}

export async function getGoogleRedirectUser() {
  await ensureAuthPersistence();

  const result = await getRedirectResult(auth).catch((err) => {
    console.error("Google redirect result error:", err);
    return null;
  });

  if (result?.user) {
    await salvarPerfilGoogle(result.user);
    return result.user;
  }

  return null;
}

export async function signInAsGuest() {
  await ensureAuthPersistence();

  const result = await signInAnonymously(auth);
  return result.user;
}
