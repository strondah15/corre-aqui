import { auth, database } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { ref, update, serverTimestamp } from "firebase/database";

const provider = new GoogleAuthProvider();
// opcional: provider.addScope("email");

export async function signInWithGoogle({ mode = "popup" } = {}) {
  try {
    let result;

    if (mode === "redirect") {
      await signInWithRedirect(auth, provider);
      return; // em redirect, o retorno vem depois via getRedirectResult (se você usar)
    }

    result = await signInWithPopup(auth, provider);

    const user = result.user;
    if (!user?.uid) return;

    // cria/atualiza o perfil no Realtime Database
    await update(ref(database, `users/${user.uid}`), {
      profile: {
        nome: user.displayName || "",
        fotoURL: user.photoURL || "",
        email: user.email || "",
        atualizadoEm: serverTimestamp(),
        criadoEm: serverTimestamp(), // ok manter; se quiser “não sobrescrever”, eu ajusto depois
      },
    });

    return user;
  } catch (err) {
    console.error("Google login error:", err);
    throw err;
  }
}
