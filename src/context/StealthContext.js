import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getStealthState } from '../services/stealthService';
import { onAlertScreen } from '../navigation/navigationRef';

// ---------------------------------------------------------------------------
// Whether the calculator disguise is showing.
//
// When stealth mode is on, the app starts locked (showing the calculator) and
// locks again whenever it leaves the screen, so anyone who picks up the phone
// later sees a calculator. The one exception is an alert in progress: on
// phones that send through the messaging app, sending the alert briefly
// leaves MauSOS, and coming back to a calculator mid-alert would hide the
// alert's progress from the person who raised it.
// ---------------------------------------------------------------------------

const StealthContext = createContext({
  ready: false,
  configured: false,
  enabled: false,
  locked: false,
  unlock: () => {},
  lock: () => {},
  refresh: async () => {},
});

export function StealthProvider({ children }) {
  const [state, setState] = useState({ ready: false, configured: false, enabled: false });
  const [locked, setLocked] = useState(false);

  const refresh = useCallback(async () => {
    const s = await getStealthState();
    setState({ ready: true, ...s });
    if (!s.enabled) setLocked(false);
    return s;
  }, []);

  // On launch, set `locked` in the same update that marks the state ready, so
  // the real app is never drawn for even one frame before the calculator.
  useEffect(() => {
    getStealthState().then((s) => {
      setLocked(s.enabled);
      setState({ ready: true, ...s });
    });
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' && state.enabled && !onAlertScreen()) setLocked(true);
    });
    return () => sub.remove();
  }, [state.enabled]);

  const unlock = useCallback(() => setLocked(false), []);
  const lock = useCallback(() => {
    if (state.enabled) setLocked(true);
  }, [state.enabled]);

  return (
    <StealthContext.Provider value={{ ...state, locked, unlock, lock, refresh }}>
      {children}
    </StealthContext.Provider>
  );
}

export function useStealth() {
  return useContext(StealthContext);
}
