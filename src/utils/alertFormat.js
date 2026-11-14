import { colors } from './theme';

// ---------------------------------------------------------------------------
// How alert records are described on screen. Shared by the history list and
// the detail screen so both always use the same words and colours.
// ---------------------------------------------------------------------------

// Red is reserved for emergencies (theme.js), so only an alert that actually
// went out — and has not been resolved — is shown in red.
export const STATUS_META = {
  sent: { label: 'Alert sent', icon: 'alert-circle', color: colors.danger, bg: colors.dangerLight },
  failed: { label: 'Not delivered', icon: 'close-circle', color: colors.warning, bg: colors.warningLight },
  resolved: { label: 'Resolved', icon: 'checkmark-circle', color: colors.success, bg: colors.successLight },
  falseAlarm: { label: 'False alarm', icon: 'remove-circle', color: colors.textMuted, bg: colors.surfaceAlt },
  cancelled: { label: 'Cancelled', icon: 'close', color: colors.textMuted, bg: colors.surfaceAlt },
};

export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.cancelled;
}

export const TRIGGER_LABEL = {
  button: 'SOS button',
  shake: 'Shake',
  duress: 'Duress code (stealth calculator)',
};

export const CHANNEL_LABEL = {
  silent: 'Sent automatically by SMS',
  composer: 'Sent through the messaging app',
  'silent+composer': 'Partly automatic, partly through the messaging app',
  none: 'Not sent',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** "Today, 17:47", "Yesterday, 09:12" or "7 Oct 2026, 17:47". */
export function formatWhen(ms) {
  if (!ms) return 'Unknown time';
  const d = new Date(ms);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (ms >= startOfToday) return `Today, ${time}`;
  if (ms >= startOfToday - 86400000) return `Yesterday, ${time}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}

/** Firestore Timestamp, millisecond number or null → milliseconds or null. */
export function toMillis(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  return null;
}

export function formatDuration(ms) {
  if (ms == null) return null;
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function reachedCount(alert) {
  const list = alert.contactsNotified || [];
  return { reached: list.filter((c) => c.success).length, total: list.length };
}

// Error codes from the SMS layer (smsService / MausosSmsModule.kt) in words.
const SMS_FAILURE = {
  E_SEND_THREW: 'blocked by this phone',
  E_NO_SMS_MANAGER: 'blocked by this phone',
  E_UNSUPPORTED_PLATFORM: 'not supported on this phone',
  E_PERMISSION_DENIED: 'SMS permission was off',
  E_INVALID_NUMBER: 'invalid number',
  E_SEND_FAILED: 'no signal or no credit',
  E_TIMEOUT: 'the network did not confirm',
  E_COMPOSER: 'messaging app not completed',
  E_COMPOSER_FAILED: 'messaging app could not open',
  E_NO_COMPOSER: 'no messaging app',
};

export function describeSmsFailure(code) {
  return SMS_FAILURE[code] || 'not delivered';
}

// Codes meaning the phone itself refuses silent sending, as opposed to a
// network problem.
const DEVICE_BLOCKED = new Set(['E_SEND_THREW', 'E_NO_SMS_MANAGER', 'E_UNSUPPORTED_PLATFORM', 'E_PERMISSION_DENIED']);

/**
 * A duress alert that reached nobody because this phone will not send SMS
 * without showing the messaging app. Recorded on purpose rather than made
 * visible (D-33), so it is described as such rather than as a fault.
 */
export function isSilentDuressBlocked(alert) {
  if (alert.triggerMethod !== 'duress') return false;
  if (alert.channel === 'none') return true;
  const list = alert.contactsNotified || [];
  return list.length > 0 && list.every((c) => !c.success && DEVICE_BLOCKED.has(c.code));
}

/** One-line summary used as the title of a history row. */
export function summarise(alert) {
  const { reached, total } = reachedCount(alert);
  switch (alert.status) {
    case 'cancelled':
      return 'Cancelled during the countdown';
    case 'failed':
      // A duress alert on a phone that cannot send SMS silently is recorded
      // without messaging anyone, by design (D-33) — not a fault.
      if (isSilentDuressBlocked(alert)) {
        return 'Saved silently, SMS blocked';
      }
      return 'Could not reach any contact';
    default:
      return total ? `Sent to ${reached} of ${total} contact${total === 1 ? '' : 's'}` : 'Alert sent';
  }
}

/**
 * A smaller copy of the alert photo for lists. Cloudinary resizes on request,
 * so the list never downloads the full picture.
 */
export function thumbnailUrl(url, size = 160) {
  if (!url) return null;
  return url.replace(/\/image\/upload\/[^/]*q_auto\//, `/image/upload/w_${size},h_${size},c_fill,q_auto/`);
}

export function mapsUrl(location) {
  if (!location) return null;
  return `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
}

export function formatCoords(location) {
  if (!location) return null;
  const acc = location.accuracy ? ` · ±${Math.round(location.accuracy)} m` : '';
  return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}${acc}`;
}
