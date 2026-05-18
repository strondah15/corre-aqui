import { initializeApp, getApp, getApps } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const env = typeof process !== 'undefined' ? process.env || {} : {};

const firebaseConfig = {
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY || env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  databaseURL: env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || '',
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId:
    env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID || env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};

const requiredFirebaseKeys = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'];

export const firebaseConfigReady = requiredFirebaseKeys.every((key) => Boolean(firebaseConfig[key]));

export const app = firebaseConfigReady
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export const database = app ? getDatabase(app) : null;
