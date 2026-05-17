import { auth, database } from "@/lib/firebase";
import {
  browserLocalPersistence,
  GoogleAuthProvider,
  setPersistence,
  signInAnonymously,
  signInWithPopup,
} from "firebase/auth";
import { ref, update, serverTimestamp } from "firebase/database";

const provider = new GoogleAuthProvider();

async function salvarPerfilGoogle(user) {
  if (!user?.uid) return;

  await update(ref(database, `users/${user.uid}`), {
    profile: {
      nome: user.displayName || "",
      fotoURL: user.photoURL || "",
      email: user.email || "",
      atualizadoEm: serverTimestamp(),
      criadoEm: serverTimestamp(),
    },
  });
}

async function ensureAuthPersistence() {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (err) {
    console.warn("Nao foi possivel configurar persistencia local do Firebase Auth:", err);
  }
}

export async function signInWithGoogle() {
  try {
    await ensureAuthPersistence();

    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    await salvarPerfilGoogle(user);

    return user;
  } catch (err) {
    console.error("Google login error:", err);
    throw err;
  }
}

export async function signInAsGuest() {
  await ensureAuthPersistence();

  const result = await signInAnonymously(auth);
  return result.user;
}
