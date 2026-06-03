import { auth, database } from "@/lib/firebase";
import {
  browserLocalPersistence,
  getRedirectResult,
  GoogleAuthProvider,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { ref, update, serverTimestamp } from "firebase/database";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });
const REDIRECT_PENDING_KEY = "correaqui:googleRedirectPending";

function debugAuth(evento, dados = {}) {
  console.log(`[CorreAqui Auth] ${evento}`, dados);
}

function esperar(ms, valor = null) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(valor), ms);
  });
}

function setRedirectPending() {
  try {
    sessionStorage.setItem(REDIRECT_PENDING_KEY, String(Date.now()));
  } catch {}
  try {
    localStorage.setItem(REDIRECT_PENDING_KEY, String(Date.now()));
  } catch {}
}

function clearRedirectPending() {
  try {
    sessionStorage.removeItem(REDIRECT_PENDING_KEY);
  } catch {}
  try {
    localStorage.removeItem(REDIRECT_PENDING_KEY);
  } catch {}
}

export function clearGoogleRedirectPending() {
  clearRedirectPending();
}

export function isGoogleRedirectPending() {
  try {
    const rawSession = sessionStorage.getItem(REDIRECT_PENDING_KEY);
    const rawLocal = localStorage.getItem(REDIRECT_PENDING_KEY);
    const ms = Math.max(Number(rawSession || 0), Number(rawLocal || 0));
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

  const standalone = Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator?.standalone,
  );

  return standalone;
}

function deveTentarRedirectDepoisDoPopup(err) {
  if (typeof window === "undefined") return false;

  const code = err?.code || "";
  const ua = window.navigator?.userAgent || "";
  const mobile = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua);

  return (
    mobile &&
    (code === "auth/popup-blocked" ||
      code === "auth/cancelled-popup-request" ||
      code === "auth/popup-closed-by-user" ||
      code === "auth/operation-not-supported-in-this-environment")
  );
}

function dominioAtual() {
  if (typeof window === "undefined") return "";
  return window.location.hostname || "";
}

function contextoNavegador() {
  if (typeof window === "undefined") return {};

  const ua = window.navigator?.userAgent || "";
  const host = window.location.hostname || "";
  const isLocalhost = host === "localhost" || host === "127.0.0.1";
  const isIpLocal = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);

  return {
    host,
    href: window.location.href,
    mobile: /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua),
    standalone: Boolean(
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
        window.navigator?.standalone,
    ),
    precisaAutorizarDominio: Boolean(host && !isLocalhost && isIpLocal),
  };
}

export function mensagemErroAuthGoogle(err) {
  const code = err?.code || "";
  const host = dominioAtual();

  if (code === "auth/unauthorized-domain") {
    return `Domínio não autorizado no Firebase: ${host}. Adicione esse domínio em Firebase Authentication > Settings > Authorized domains.`;
  }

  if (code === "auth/operation-not-allowed") {
    return "Login Google ainda não está habilitado no Firebase Authentication > Sign-in method.";
  }

  if (code === "auth/invalid-api-key" || code === "auth/api-key-not-valid.-please-pass-a-valid-api-key.") {
    return "A chave NEXT_PUBLIC_FIREBASE_API_KEY está inválida ou não bate com o projeto Firebase.";
  }

  if (code === "auth/network-request-failed") {
    return "Falha de rede ao abrir o Google. Confira a internet e tente novamente.";
  }

  if (code === "auth/popup-blocked") {
    return "O navegador bloqueou a janela do Google. Toque novamente e permita pop-ups para este site.";
  }

  if (code === "auth/popup-closed-by-user") {
    return "A janela do Google foi fechada antes de concluir a entrada.";
  }

  if (code === "auth/operation-not-supported-in-this-environment") {
    return "Este navegador não permitiu o login Google por popup. Tente abrir no Chrome ou instale o app pela tela inicial.";
  }

  return code
    ? `Não consegui entrar com Google agora. Código Firebase: ${code}.`
    : "Não consegui entrar com Google agora. Verifique a conexão e tente novamente.";
}

export async function signInWithGoogle() {
  try {
    await ensureAuthPersistence();
    debugAuth("signInWithGoogle:start", contextoNavegador());

    if (deveUsarRedirect()) {
      debugAuth("signInWithGoogle:redirect", contextoNavegador());
      setRedirectPending();
      await signInWithRedirect(auth, provider);
      return null;
    }

    let result;
    try {
      debugAuth("signInWithGoogle:popup", contextoNavegador());
      result = await signInWithPopup(auth, provider);
    } catch (popupErr) {
      if (!deveTentarRedirectDepoisDoPopup(popupErr)) throw popupErr;

      debugAuth("signInWithGoogle:popup-fallback-redirect", {
        ...contextoNavegador(),
        code: popupErr?.code || "",
      });
      setRedirectPending();
      await signInWithRedirect(auth, provider);
      return null;
    }

    const user = result.user;

    clearRedirectPending();
    await salvarPerfilGoogle(user);
    debugAuth("signInWithGoogle:popup-user", { uid: user?.uid || null });

    return user;
  } catch (err) {
    clearRedirectPending();
    console.error("Google login error:", err);
    debugAuth("signInWithGoogle:error", {
      ...contextoNavegador(),
      code: err?.code || "",
      message: err?.message || "",
    });
    throw err;
  }
}

export async function getGoogleRedirectUser() {
  await ensureAuthPersistence();

  const tinhaRedirectPendente = isGoogleRedirectPending();
  debugAuth("getRedirectResult:start", {
    ...contextoNavegador(),
    tinhaRedirectPendente,
    currentUserUid: auth.currentUser?.uid || null,
  });

  const result = await getRedirectResult(auth).catch((err) => {
    console.error("Google redirect result error:", err);
    clearRedirectPending();
    debugAuth("getRedirectResult:error", {
      ...contextoNavegador(),
      code: err?.code || "",
      message: err?.message || "",
    });
    throw err;
  });

  if (result?.user) {
    clearRedirectPending();
    await salvarPerfilGoogle(result.user);
    debugAuth("getRedirectResult:user", { uid: result.user.uid });
    return result.user;
  }

  if (tinhaRedirectPendente && auth.currentUser?.uid) {
    clearRedirectPending();
    await salvarPerfilGoogle(auth.currentUser);
    debugAuth("getRedirectResult:currentUser-fallback", { uid: auth.currentUser.uid });
    return auth.currentUser;
  }

  debugAuth("getRedirectResult:null", {
    tinhaRedirectPendente,
    currentUserUid: auth.currentUser?.uid || null,
  });
  return null;
}
