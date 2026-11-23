import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { useContacts } from '../context/ContactsContext';
import { beginAlert } from '../services/alertService';
import { startShakeDetection } from '../services/shakeDetector';
import { SHAKE, TRIGGER_METHOD } from '../utils/constants';
import { ALERT_SCREENS } from './navigationRef';

// ---------------------------------------------------------------------------
// Starts an alert when the phone is shaken.
//
// Rendered once, beside the navigator, so it works on every tab rather than
// only on the SOS screen. It listens only while all of these are true:
//   - the user has turned shake on in Settings,
//   - there is at least one contact (an alert needs somewhere to go),
//   - the app is in the foreground (no sensor use, no battery cost, when it
//     is not on screen),
//   - the stealth calculator is not showing (RootNavigator unmounts this
//     component then), since a countdown hidden behind the calculator could
//     not be seen or cancelled.
//
// A shake opens the same cancellable countdown as the button, so an
// accidental shake can still be stopped. Shakes are ignored while an alert
// screen is open, and for a few seconds after it closes (SHAKE.REARM_MS), so
// the same burst of shaking cannot start a second alert. The pause is short on
// purpose: someone who cancels an accidental alert may need a real one moments later.
// ---------------------------------------------------------------------------

export default function ShakeTrigger({ navigationRef }) {
  const { profile } = useAuth();
  const { contacts } = useContacts();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const alertEndedAt = useRef(0);
  const onAlertScreen = useRef(false);

  const enabled = profile?.settings?.shakeEnabled === true;
  const sensitivity = profile?.settings?.shakeSensitivity || 'medium';
  const hasContacts = contacts.length > 0;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => sub.remove();
  }, []);

  // Notes when an alert screen closes, whether the alert was sent or cancelled.
  useEffect(() => {
    return navigationRef.addListener('state', () => {
      const now = ALERT_SCREENS.includes(navigationRef.getCurrentRoute()?.name);
      if (onAlertScreen.current && !now) alertEndedAt.current = Date.now();
      onAlertScreen.current = now;
    });
  }, [navigationRef]);

  useEffect(() => {
    if (!enabled || !hasContacts || !active) return undefined;

    const stop = startShakeDetection({
      sensitivity,
      onShake: () => {
        if (!navigationRef.isReady()) return;
        if (ALERT_SCREENS.includes(navigationRef.getCurrentRoute()?.name)) return;
        if (Date.now() - alertEndedAt.current < SHAKE.REARM_MS) {
          console.log('[MauSOS] Shake ignored: an alert screen closed moments ago');
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        beginAlert(TRIGGER_METHOD.SHAKE);
        navigationRef.navigate('Countdown');
      },
    });
    console.log(`[MauSOS] Shake detection ${stop ? 'on' : 'unavailable'} (${sensitivity})`);
    return () => stop?.();
  }, [enabled, hasContacts, active, sensitivity, navigationRef]);

  return null;
}
