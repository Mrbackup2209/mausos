import { PermissionsAndroid, Platform } from 'react-native';
import * as ExpoSms from 'expo-sms';
import * as MausosSms from '../../modules/mausos-sms/src';
import { normalisePhone } from '../utils/validators';

// ---------------------------------------------------------------------------
// SMS dispatch.
//
// SMS is the primary transport for an alert because it travels over the
// cellular voice network: it works with mobile data off, with no Wi-Fi, and in
// places where a data connection is too weak to carry anything else. Those are
// exactly the conditions in which an emergency is most likely to occur.
//
// Two channels, tried in order:
//
//   1. Silent — a local native module (modules/mausos-sms) sends directly
//      through Android's telephony stack with no user interaction.
//   2. Composer — if silent sending is refused, the system messaging app opens
//      with every contact and the full message already filled in, so the user
//      needs a single tap to send.
//
// The fallback exists because silent sending is not universally available.
// On Samsung devices running Android 11 the platform rejects third-party sends
// with "Package com.android.phone does not match provided uid" regardless of
// how the SmsManager is obtained — a vendor defect reported on Samsung's own
// developer forum with no published fix. iOS offers no silent route at all.
// An alert that fails silently would be worse than one needing a tap, so the
// composer guarantees the message can always leave the phone.
// ---------------------------------------------------------------------------

// Failure codes meaning "this device will not send silently", as opposed to a
// transient network problem that a retry might solve.
const SILENT_UNAVAILABLE_CODES = new Set([
  'E_SEND_THREW',
  'E_NO_SMS_MANAGER',
  'E_UNSUPPORTED_PLATFORM',
  'E_PERMISSION_DENIED',
]);

const isAndroid = Platform.OS === 'android';

/** True when the platform can send SMS without user interaction at all. */
export function isSilentSendSupported() {
  if (!isAndroid) return false;
  try {
    return MausosSms.isSmsCapable();
  } catch (error) {
    return false;
  }
}

export function hasSmsPermission() {
  if (!isAndroid) return false;
  try {
    return MausosSms.hasPermission();
  } catch (error) {
    return false;
  }
}

/**
 * Requests SEND_SMS if it has not already been granted.
 * Returns { granted, neverAskAgain }.
 */
export async function requestSmsPermission() {
  if (!isAndroid) return { granted: false, neverAskAgain: false };

  if (hasSmsPermission()) return { granted: true, neverAskAgain: false };

  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.SEND_SMS,
      {
        title: 'Allow MauSOS to send messages',
        message:
          'MauSOS sends your location to your emergency contacts by SMS when ' +
          'you raise an alert. Without this it cannot reach them automatically.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      }
    );

    return {
      granted: result === PermissionsAndroid.RESULTS.GRANTED,
      neverAskAgain: result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
    };
  } catch (error) {
    return { granted: false, neverAskAgain: false };
  }
}

/** Number of 153-character parts a message will occupy. Each is billed separately. */
export function countParts(message) {
  if (!isAndroid) return 1;
  try {
    return MausosSms.countParts(message);
  } catch (error) {
    return Math.ceil(message.length / 153);
  }
}

/**
 * Sends one message to one number.
 * Returns { success, parts } or { success: false, code, error }.
 */
export async function sendSms(phoneNumber, message) {
  if (!isAndroid) {
    return {
      success: false,
      code: 'E_UNSUPPORTED_PLATFORM',
      error: 'Silent SMS is only available on Android.',
    };
  }

  const number = normalisePhone(phoneNumber);

  try {
    const result = await MausosSms.sendSms(number, message);
    return { success: true, parts: result?.parts ?? 1, strategy: result?.strategy };
  } catch (error) {
    return {
      success: false,
      code: error?.code || 'E_UNKNOWN',
      error: error?.message || 'The message could not be sent.',
    };
  }
}

/**
 * Sends the same message to several contacts.
 *
 * Dispatch is sequential rather than parallel: Android's telephony stack
 * queues messages anyway, and sending one at a time means a failure to one
 * contact is attributable to that contact rather than to the batch. The result
 * records each outcome so the alert can report per-contact delivery.
 *
 * One failure never stops the others; reaching three of four contacts is
 * materially better than reaching none.
 */
export async function sendToContacts(contacts, message) {
  const results = [];

  for (const contact of contacts) {
    const outcome = await sendSms(contact.phone, message);
    results.push({
      contactId: contact.id ?? null,
      name: contact.name ?? '',
      phone: normalisePhone(contact.phone),
      ...outcome,
    });
  }

  const delivered = results.filter((r) => r.success).length;

  return {
    results,
    delivered,
    failed: results.length - delivered,
    allFailed: delivered === 0 && results.length > 0,
  };
}

/**
 * Builds the alert text.
 *
 * Kept deliberately compact. SMS bills per 153-character part, and a contact
 * reading this on a lock screen needs the essentials visible without opening
 * anything: who, when, where, and a link they can tap.
 */
export function buildAlertMessage({
  userName,
  userPhone,
  latitude,
  longitude,
  address,
  photoUrl,
  triggerMethod,
  timestamp = new Date(),
}) {
  const time = timestamp.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const date = timestamp.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });

  const name = userName || 'A MauSOS user';
  const duress = triggerMethod === 'duress';
  // A duress alert is raised secretly, in front of someone. A reply or a call
  // could give it away and put the sender at greater risk, so the message
  // says so first and points to the police instead.
  const lines = duress
    ? [`EMERGENCY - ${name} may be in danger and cannot talk freely.`, 'Do NOT call or text back. Contact the police (999).']
    : [`EMERGENCY - ${name} needs help.`];
  lines.push(`${time}, ${date}`);

  if (address) lines.push(address);

  if (latitude != null && longitude != null) {
    lines.push(`https://maps.google.com/?q=${latitude.toFixed(5)},${longitude.toFixed(5)}`);
  } else {
    lines.push('Location unavailable.');
  }

  if (photoUrl) lines.push(`Photo: ${photoUrl}`);
  if (userPhone && !duress) lines.push(`Call: ${userPhone}`);
  if (triggerMethod === 'shake') lines.push('(Sent by shake trigger)');

  lines.push('Sent by MauSOS');

  return lines.join('\n');
}

/** Follow-up sent when the user confirms they are safe after an alert. */
export function buildAllClearMessage(userName, timestamp = new Date()) {
  const time = timestamp.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    `ALL CLEAR - ${userName || 'The MauSOS user'} is safe now. ` +
    `No further action is needed for the earlier alert. (${time})`
  );
}

// ---------------------------------------------------------------------------
// Composer fallback.
// ---------------------------------------------------------------------------

export async function isComposerAvailable() {
  try {
    return await ExpoSms.isAvailableAsync();
  } catch (error) {
    return false;
  }
}

/**
 * Opens the system messaging app with every recipient and the message filled
 * in. The user must press send.
 *
 * Android cannot report whether the user actually sent the message from the
 * composer, so the result is 'opened' rather than 'sent'. The alert record
 * stores that distinction honestly rather than claiming a delivery it cannot
 * confirm.
 */
export async function openComposer(phoneNumbers, message) {
  if (!(await isComposerAvailable())) {
    return { success: false, code: 'E_NO_COMPOSER', error: 'No messaging app is available.' };
  }
  try {
    const { result } = await ExpoSms.sendSMSAsync(
      phoneNumbers.map((p) => normalisePhone(p)),
      message
    );
    //Android reports 'unknown'.
    return { success: result !== 'cancelled', outcome: result === 'unknown' ? 'opened' : result };
  } catch (error) {
    return { success: false, code: 'E_COMPOSER_FAILED', error: error?.message || 'Could not open messaging.' };
  }
}

/**
 * Sends an alert by the best channel available.
 *
 * Tries silent sending first. If the device refuses it outright, falls back to
 * the composer with every contact prefilled. A partial silent failure (some
 * contacts reached, others not) does not trigger the composer for everyone;
 * only the contacts that failed are passed to it.
 *
 * Returns { channel: 'silent' | 'composer' | 'none', ... }.
 */
export async function dispatchAlert(contacts, message, { silentOnly = false } = {}) {
  if (contacts.length === 0) {
    return { channel: 'none', delivered: 0, failed: 0, error: 'No emergency contacts.' };
  }

  // Duress alerts: nothing may appear on screen, no permission prompt, no
  // messaging app. Send silently if this phone allows it; otherwise send
  // nothing, and the alert is still recorded.
  if (silentOnly) {
    if (!isSilentSendSupported() || !hasSmsPermission()) {
      return { channel: 'none', delivered: 0, failed: 0, error: 'Silent sending unavailable.' };
    }
    return { channel: 'silent', ...(await sendToContacts(contacts, message)) };
  }

  let silent = null;
  if (isSilentSendSupported()) {
    const permission = await requestSmsPermission();
    if (permission.granted) {
      silent = await sendToContacts(contacts, message);
      if (silent.failed === 0) {
        return { channel: 'silent', ...silent };
      }
    }
  }

  // Contacts still to reach: every one if silent sending was unavailable,
  // otherwise only those whose silent send failed for a device-level reason.
  const remaining = silent
    ? silent.results
        .filter((r) => !r.success && SILENT_UNAVAILABLE_CODES.has(r.code))
        .map((r) => r.phone)
    : contacts.map((c) => c.phone);

  if (remaining.length === 0) {
    // Silent sending failed for transient reasons (no signal, no credit).
    // The composer would fail the same way, so report rather than retry.
    return { channel: 'silent', ...silent };
  }

  const composer = await openComposer(remaining, message);
  return {
    channel: silent && silent.delivered > 0 ? 'silent+composer' : 'composer',
    silent,
    composer,
    composerRecipients: remaining,
  };
}

/** Sent after the alert when the photo finished uploading too late to include. */
export function buildPhotoFollowUpMessage(userName, photoUrl) {
  return `MauSOS - photo from ${userName || 'the MauSOS user'}'s alert: ${photoUrl}`;
}
