import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { ALERT } from '../utils/constants';
import { normalisePhone, sanitiseText } from '../utils/validators';
import { withTimeout } from '../utils/async';

// ---------------------------------------------------------------------------
// Firebase throws machine-readable codes like "auth/wrong-password". Showing
// those to a user is poor UX, so every code is mapped to a sentence a person
// can act on. Anything unmapped falls back to a generic message rather than
// leaking internal details.
// ---------------------------------------------------------------------------
const ERROR_MESSAGES = {
  'auth/email-already-in-use': 'An account already exists with this email address.',
  'auth/invalid-email': 'That email address is not valid.',
  'auth/weak-password': 'That password is too weak. Use at least 8 characters.',
  // Wrong email and wrong password get the same message, so sign-in cannot be
  // used to discover which email addresses have accounts.
  'auth/user-not-found': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'No internet connection. Check your network and try again.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/operation-not-allowed': 'Email sign-in is not enabled for this project.',
};

function toFriendlyError(error) {
  return ERROR_MESSAGES[error?.code] || 'Something went wrong. Please try again.';
}

// Default settings written at registration. Having these on the user document
// rather than only on the device means a reinstall keeps the user's preferences.
function defaultSettings() {
  return {
    countdownSeconds: ALERT.DEFAULT_COUNTDOWN_S,
    capturePhoto: true,
    preferredCamera: 'back',
    shakeEnabled: false,
    shakeSensitivity: 'medium',
    stealthEnabled: false,
  };
}

/**
 * Writes (or repairs) the Firestore profile document for a user.
 * Separated from register() so it can be retried on a later launch if the
 * original write failed.
 */
export async function writeUserProfile(user, { fullName, email, phone }) {
  const payload = {
    uid: user.uid,
    fullName: sanitiseText(fullName || user.displayName || '', 60),
    email: (email || user.email || '').trim().toLowerCase(),
    phone: phone ? normalisePhone(phone) : '',
    medicalNotes: '',
    settings: defaultSettings(),
    createdAt: serverTimestamp(),
  };

  await withTimeout(
    setDoc(doc(db, 'users', user.uid), payload, { merge: true }),
    10000,
    'Firestore profile write'
  );

  return payload;
}

/**
 * Creates the auth account and its matching Firestore profile document.
 * Returns { success: true, user } or { success: false, error }.
 *
 * Note on ordering: creating the auth account immediately fires
 * onAuthStateChanged, which navigates the user away from the registration
 * screen. Anything that fails after that point cannot be reported on that
 * screen, so a profile-write failure is logged and flagged on the returned
 * object rather than relying on the UI to surface it.
 */
export async function register({ fullName, email, password, phone }) {
  let credential;

  try {
    credential = await createUserWithEmailAndPassword(
      auth,
      email.trim().toLowerCase(),
      password
    );
  } catch (error) {
    return { success: false, error: toFriendlyError(error) };
  }

  try {
    await updateProfile(credential.user, {
      displayName: sanitiseText(fullName, 60),
    });
  } catch (error) {
    // Cosmetic only — the display name also lives in the Firestore profile.
    console.warn('[MauSOS] Could not set auth display name:', error?.message);
  }

  try {
    await writeUserProfile(credential.user, { fullName, email, phone });
    return { success: true, user: credential.user };
  } catch (error) {
    console.error(
      '[MauSOS] Account created but the Firestore profile write FAILED.\n' +
        '  uid: ' + credential.user.uid + '\n' +
        '  code: ' + (error?.code || 'none') + '\n' +
        '  message: ' + (error?.message || String(error)) + '\n' +
        '  The app will retry this write on the next launch.'
    );
    // The account exists and the user is signed in, so this is not a failed
    // registration. AuthContext retries the profile write when it finds the
    // document missing.
    return { success: true, user: credential.user, profilePending: true };
  }
}

export async function login(email, password) {
  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      email.trim().toLowerCase(),
      password
    );
    return { success: true, user: credential.user };
  } catch (error) {
    return { success: false, error: toFriendlyError(error) };
  }
}

export async function logout() {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    return { success: false, error: toFriendlyError(error) };
  }
}

export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
    return { success: true };
  } catch (error) {
    // An unknown address is reported as success: the screen then says "if an
    // account exists, a link has been sent", the same as for a real account,
    // so the reset form cannot reveal which addresses are registered (D-11).
    if (error?.code === 'auth/user-not-found') return { success: true };
    return { success: false, error: toFriendlyError(error) };
  }
}

/**
 * Reads the Firestore profile for a user. Returns null when the document is
 * missing, and throws only on a genuine network or permission failure so the
 * caller can distinguish "no profile" from "could not reach the database".
 */
export async function getUserProfile(uid) {
  const snapshot = await withTimeout(
    getDoc(doc(db, 'users', uid)),
    10000,
    'Firestore profile read'
  );
  return snapshot.exists() ? snapshot.data() : null;
}

/**
 * Diagnostic helper. Performs a single round trip to Firestore and reports what
 * happened in plain terms, so a connection problem can be distinguished from a
 * permissions problem or a missing database.
 */
export async function testFirestoreConnection() {
  const user = auth.currentUser;
  if (!user) return { ok: false, stage: 'auth', detail: 'No signed-in user.' };

  try {
    await withTimeout(
      setDoc(
        doc(db, 'users', user.uid),
        { connectionTestAt: serverTimestamp() },
        { merge: true }
      ),
      8000,
      'Firestore test write'
    );
  } catch (error) {
    return {
      ok: false,
      stage: 'write',
      code: error?.code || 'timeout',
      detail: error?.message || String(error),
    };
  }

  try {
    const snapshot = await withTimeout(
      getDoc(doc(db, 'users', user.uid)),
      8000,
      'Firestore test read'
    );
    return { ok: true, stage: 'read', exists: snapshot.exists() };
  } catch (error) {
    return {
      ok: false,
      stage: 'read',
      code: error?.code || 'timeout',
      detail: error?.message || String(error),
    };
  }
}

/**
 * Merges a partial update into the user's profile document.
 *
 * A Firestore write made without signal never fails: it waits, and is sent
 * when the connection returns. So a timeout here is reported as `pending`
 * (saved on this phone, not yet on the server) rather than as an error.
 */
export async function updateUserProfile(uid, updates) {
  try {
    await withTimeout(
      setDoc(doc(db, 'users', uid), { ...updates, updatedAt: serverTimestamp() }, { merge: true }),
      8000,
      'Save profile'
    );
    return { success: true };
  } catch (error) {
    if (error?.code === 'timeout') return { success: false, pending: true };
    console.log('[MauSOS] Profile update failed:', error?.code, error?.message);
    return { success: false, error: 'Could not save changes. Please try again.' };
  }
}
