import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import { getUserProfile, writeUserProfile, updateUserProfile } from '../services/authService';

// ---------------------------------------------------------------------------
// Holds the signed-in user for the whole app.
//
// onAuthStateChanged fires once shortly after launch with the session Firebase
// restored from device storage, and again on every sign-in or sign-out. Until
// that first call arrives we do not know whether the user is signed in, which
// is what `initialising` represents: while it is true the app shows a splash
// screen rather than flashing the login screen for a fraction of a second.
// ---------------------------------------------------------------------------

const AuthContext = createContext({
  user: null,
  profile: null,
  initialising: true,
  refreshProfile: async () => {},
  updateSettings: async () => ({ success: false }),
  updateProfile: async () => ({ success: false }),
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [initialising, setInitialising] = useState(true);

  const [profileError, setProfileError] = useState(null);
  const profileRef = useRef(null);
  profileRef.current = profile;

  const loadProfile = useCallback(async (firebaseUser, attempt = 1) => {
    try {
      const data = await getUserProfile(firebaseUser.uid);

      if (data) {
        setProfile(data);
        setProfileError(null);
        return;
      }

      // Signed in, but no profile document. This happens when the write during
      // registration failed — the account exists while its profile does not.
      // Rather than leaving the user permanently without a profile, rebuild it
      // from what the auth record knows.
      console.warn(
        '[MauSOS] No profile document for ' + firebaseUser.uid + '. Rebuilding.'
      );
      const rebuilt = await writeUserProfile(firebaseUser, {
        fullName: firebaseUser.displayName || '',
        email: firebaseUser.email || '',
        phone: '',
      });
      setProfile(rebuilt);
      setProfileError(null);
      console.warn('[MauSOS] Profile rebuilt. Phone number needs re-entering in Settings.');
    } catch (error) {
      // A timeout on the first attempt is usually a cold network connection
      // rather than a real fault, so it is retried once before being reported.
      if (attempt < 2 && ['timeout', 'unavailable', undefined].includes(error?.code)) {
        console.warn('[MauSOS] Profile load attempt ' + attempt + ' failed; retrying.');
        return loadProfile(firebaseUser, attempt + 1);
      }

      // Offline, unreachable, or blocked by security rules. The user stays
      // signed in; the profile is retried on the next launch.
      console.error(
        '[MauSOS] Could not load or rebuild the profile.\n' +
          '  code: ' + (error?.code || 'timeout') + '\n' +
          '  message: ' + (error?.message || String(error))
      );
      setProfile(null);
      setProfileError(error?.code || 'unavailable');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await loadProfile(firebaseUser);
      } else {
        setProfile(null);
        setProfileError(null);
      }
      setInitialising(false);
    });

    return unsubscribe;
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (auth.currentUser) await loadProfile(auth.currentUser);
  }, [loadProfile]);

  // Changes to the profile are applied to the screen immediately and saved in
  // the background, so a toggle responds instantly even on a slow connection.
  // Every screen reads the same in-memory profile, so the countdown and camera
  // pick up a new setting at once. If the server refuses the change, it is
  // rolled back.
  const applyChange = useCallback(async (merge, firestoreUpdate) => {
    const uid = auth.currentUser?.uid;
    const before = profileRef.current;
    if (!uid || !before) return { success: false, error: 'Not signed in.' };
    setProfile(merge(before));
    const result = await updateUserProfile(uid, firestoreUpdate);
    if (!result.success && !result.pending) setProfile(before);
    return result;
  }, []);

  const updateSettings = useCallback(
    (patch) =>
      applyChange(
        (p) => ({ ...p, settings: { ...(p.settings || {}), ...patch } }),
        { settings: patch }
      ),
    [applyChange]
  );

  const updateProfile = useCallback(
    (fields) => applyChange((p) => ({ ...p, ...fields }), fields),
    [applyChange]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        setProfile,
        initialising,
        refreshProfile,
        updateSettings,
        updateProfile,
        profileError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
