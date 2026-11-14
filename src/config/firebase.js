import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { initializeFirestore, getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Firebase configuration
//
// These values come from:
//   Firebase Console -> Project settings -> Your apps -> Web app -> SDK setup
//
// They identify the project; they are not secrets. Google expects them to ship
// inside client applications. Access is controlled by Firestore security rules,
// not by keeping these hidden.
//
// Services used: Authentication and Firestore only. Both are available on the
// free Spark plan. Firebase Storage now requires a billing account, so captured
// photos are uploaded to Cloudinary instead (see src/services/mediaService.js).
// That choice also suits the use case better: emergency contacts receive a
// plain SMS and have no account here, so the photo link must be openable by
// anyone who holds it.
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDVgC5qcHuRLAjuZsnu-HVaETJxaNDGKDE",
  authDomain: "mausos-6a1e2.firebaseapp.com",
  projectId: "mausos-6a1e2",
  storageBucket: "mausos-6a1e2.firebasestorage.app",
  messagingSenderId: "483433229985",
  appId: "1:483433229985:web:ebfc7070ccfa40654bcae0"
};

// Sanity check for a teammate cloning the repo with an unfilled config. This
// deliberately tests the shape of the values rather than comparing against a
// placeholder string, so a find-and-replace over the file cannot turn the check
// into a tautology.
const configLooksValid =
  typeof firebaseConfig.apiKey === 'string' &&
  firebaseConfig.apiKey.startsWith('AIza') &&
  firebaseConfig.projectId.length > 0 &&
  firebaseConfig.appId.includes(':web:');

if (!configLooksValid) {
  console.warn(
    '[MauSOS] Firebase config looks incomplete. Check src/config/firebase.js ' +
      'against Firebase Console -> Project settings -> Your apps.'
  );
}

// getApps() guards against re-initialising during a fast refresh in development.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ---------------------------------------------------------------------------
// Auth with persistent sessions.
//
// This matters more here than in a typical app. MauSOS must never show a login
// screen during an emergency, so the session has to survive the app being
// closed, the phone restarting, and days of inactivity.
//
// getReactNativePersistence(AsyncStorage) writes the auth token to device
// storage. Plain getAuth() keeps it in memory only, which would sign the user
// out every time the app closes.
//
// A silent fallback here would be dangerous: the app would look fine but
// quietly lose the session, which is exactly the behaviour we cannot have. So
// each failure path logs what happened rather than hiding it.
// ---------------------------------------------------------------------------
function createAuth() {
  if (typeof getReactNativePersistence !== 'function') {
    console.error(
      '[MauSOS] getReactNativePersistence is unavailable. Sessions will NOT ' +
        'persist across restarts. Check that firebase resolves its React ' +
        'Native entry point.'
    );
    return getAuth(app);
  }

  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    // initializeAuth throws if auth was already initialised for this app,
    // which happens on a fast refresh. Reusing the existing instance keeps the
    // persistence configured by the first call.
    if (error?.code === 'auth/already-initialized') {
      return getAuth(app);
    }
    console.error('[MauSOS] Failed to initialise auth with persistence:', error);
    return getAuth(app);
  }
}

export const auth = createAuth();
// ---------------------------------------------------------------------------
// Firestore over long-polling.
//
// The JS SDK's default transport is a streaming WebChannel connection, which is
// unreliable inside React Native: on a cold start the first read can stall
// until it times out. Long-polling uses ordinary HTTP requests instead. It is
// marginally less efficient but consistently connects, which matters far more
// for an application whose alerts must be recorded the first time.
// ---------------------------------------------------------------------------
function createFirestore() {
  try {
    return initializeFirestore(app, { experimentalForceLongPolling: true });
  } catch (error) {
    // Already initialised (fast refresh in development) — reuse that instance.
    return getFirestore(app);
  }
}

export const db = createFirestore();
export default app;
