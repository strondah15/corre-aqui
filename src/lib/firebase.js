// src/lib/firebase.js
import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

const EXPECTED_PROJECT_ID = "corre-aqui-3f9ec";
const EXPECTED_DATABASE_URL = "https://corre-aqui-3f9ec-default-rtdb.firebaseio.com";

const getDatabaseHost = (databaseURL) => {
  try {
    return databaseURL ? new URL(databaseURL).host : "";
  } catch {
    return "";
  }
};

const missingFirebaseEnv = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingFirebaseEnv.length) {
  console.warn("[Firebase] ENV faltando:", missingFirebaseEnv);
}

const databaseHost = getDatabaseHost(firebaseConfig.databaseURL);
const databaseLooksLikeProject =
  !firebaseConfig.projectId ||
  !databaseHost ||
  databaseHost.includes(firebaseConfig.projectId);

if (!databaseLooksLikeProject) {
  console.error("[Firebase] DATABASE_URL nao parece ser do mesmo projeto:", {
    projectId: firebaseConfig.projectId,
    databaseHost,
  });
}

if (firebaseConfig.projectId && firebaseConfig.projectId !== EXPECTED_PROJECT_ID) {
  console.error("[Firebase] PROJECT_ID inesperado:", {
    projectId: firebaseConfig.projectId,
    esperado: EXPECTED_PROJECT_ID,
  });
}

if (firebaseConfig.databaseURL && firebaseConfig.databaseURL !== EXPECTED_DATABASE_URL) {
  console.error("[Firebase] DATABASE_URL inesperado:", {
    databaseURL: firebaseConfig.databaseURL,
    esperado: EXPECTED_DATABASE_URL,
  });
}

if (process.env.NODE_ENV !== "production") {
  console.log("[FIREBASE CONFIG]", {
    projectId: firebaseConfig.projectId,
    databaseURL: firebaseConfig.databaseURL,
    authDomain: firebaseConfig.authDomain,
  });
}

const existingApp = getApps()[0];
if (existingApp && process.env.NODE_ENV !== "production") {
  const existingOptions = existingApp.options || {};
  if (
    existingOptions.projectId !== firebaseConfig.projectId ||
    existingOptions.databaseURL !== firebaseConfig.databaseURL ||
    existingOptions.authDomain !== firebaseConfig.authDomain
  ) {
    console.error("[Firebase] App DEFAULT ja estava inicializado com outra config. Reinicie o npm run dev.", {
      existing: {
        projectId: existingOptions.projectId,
        databaseURL: existingOptions.databaseURL,
        authDomain: existingOptions.authDomain,
      },
      expected: {
        projectId: firebaseConfig.projectId,
        databaseURL: firebaseConfig.databaseURL,
        authDomain: firebaseConfig.authDomain,
      },
    });
  }
}

// Evita inicializar o Firebase mais de uma vez no Next.js/Turbopack.
export const app = existingApp ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const database = getDatabase(app);

export default app;
