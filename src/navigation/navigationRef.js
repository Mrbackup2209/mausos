import { createNavigationContainerRef } from '@react-navigation/native';

// Lets code outside the screens — the shake listener and stealth lock — see
// and change the current screen. Kept in its own file so those modules and the
// navigator can all import it without importing each other.
export const navigationRef = createNavigationContainerRef();

export const ALERT_SCREENS = ['Countdown', 'AlertStatus'];

export function onAlertScreen() {
  return navigationRef.isReady() && ALERT_SCREENS.includes(navigationRef.getCurrentRoute()?.name);
}
