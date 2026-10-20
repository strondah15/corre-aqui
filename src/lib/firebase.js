// src/lib/firebase.js
import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { assessFirebaseClientConfiguration } from "./firebaseClientConfig";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

const clientAssessment = assessFirebaseClientConfiguration(firebaseConfig, {
  hostname: typeof window === "undefined" ? "" : window.location.hostname,
});

if (!clientAssessment.valid) {
  const error = new Error("Firebase Client bloqueado por configuracao inconsistente.");
  error.code = "firebase_client_environment_invalid";
  error.configurationIssues = Array.from(clientAssessment.issues);
  throw error;
}

const existingApp = getApps().find((candidate) => candidate.name === "[DEFAULT]");
if (existingApp) {
  const existingOptions = existingApp.options || {};
  if (
    existingOptions.projectId !== firebaseConfig.projectId ||
    existingOptions.databaseURL !== firebaseConfig.databaseURL ||
    existingOptions.authDomain !== firebaseConfig.authDomain ||
    existingOptions.storageBucket !== firebaseConfig.storageBucket ||
    existingOptions.messagingSenderId !== firebaseConfig.messagingSenderId ||
    existingOptions.appId !== firebaseConfig.appId
  ) {
    const error = new Error("Firebase Client bloqueado porque o app DEFAULT usa outra configuracao.");
    error.code = "firebase_client_existing_app_mismatch";
    throw error;
  }
}

// Evita inicializar o Firebase mais de uma vez no Next.js/Turbopack.
export const app = existingApp ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const database = getDatabase(app);

export default app;
