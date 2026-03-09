// src/lib/firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

// ✅ validação (ajuda muito)
if (!firebaseConfig.projectId || !firebaseConfig.databaseURL) {
  console.error("❌ Firebase ENV faltando:", {
    projectId: firebaseConfig.projectId,
    databaseURL: firebaseConfig.databaseURL,
    apiKey: firebaseConfig.apiKey ? "OK" : null,
  });
  throw new Error(
    "Firebase ENV inválido: faltou NEXT_PUBLIC_FIREBASE_PROJECT_ID ou NEXT_PUBLIC_FIREBASE_DATABASE_URL"
  );
}

// ✅ inicializa primeiro
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ✅ só DEPOIS você pode logar (sem quebrar)
console.log("🔥 Firebase options:", {
  projectId: app?.options?.projectId,
  databaseURL: app?.options?.databaseURL,
});

// ✅ serviços
export const database = getDatabase(app);
export const auth = getAuth(app);
