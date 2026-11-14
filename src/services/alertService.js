import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { withTimeout } from '../utils/async';
import { ALERT_STATUS, TRIGGER_METHOD } from '../utils/constants';
import { locate, describeLocation } from './locationService';
import {
  buildAlertMessage,
  buildAllClearMessage,
  buildPhotoFollowUpMessage,
  dispatchAlert,
  sendToContacts,
  hasSmsPermission,
} from './smsService';
import { deleteUploadedPhoto } from './mediaService';

// ---------------------------------------------------------------------------
// The alert pipeline.
//
//   trigger ──► countdown ──► location + photo ──► message ──► dispatch ──► record
//                   │
//                   ├── location acquisition starts here, in parallel
//                   └── photo captured and uploaded here, in parallel
//
// An alert is a "session" that begins the moment the trigger completes. The
// session starts looking for the user's position immediately, so the GPS fix
// runs during the countdown instead of after it: by the time the countdown
// ends the position is usually already known, and the time between the
// countdown ending and contacts receiving the message is only the dispatch.
//
// Every alert is recorded, including cancelled ones, so the history shows
// accidental triggers as well as real alerts. Records are written once and
// never deleted; afterwards only their status can change (see firestore.rules).
// ---------------------------------------------------------------------------

const RECORD_TIMEOUT_MS = 8000;

// How long sending waits for a photo still uploading when the countdown ends.
// Short on purpose: the alert matters more than the picture, so a slow upload
// is sent afterwards as a follow-up rather than delaying the alert.
const PHOTO_GRACE_MS = 2500;
const PHOTO_LATE_LIMIT_MS = 60000;

let session = null;

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const sleep = (ms, value = null) => new Promise((r) => setTimeout(() => r(value), ms));

function alertsRef(uid) {
  return collection(db, 'users', uid, 'alerts');
}

/** Starts an alert session and begins locating the user straight away. */
export function beginAlert(triggerMethod = TRIGGER_METHOD.BUTTON) {
  const startedAt = Date.now();

  const locationPromise = locate()
    .then(async (fix) => {
      if (fix.ok) fix.address = await describeLocation(fix.latitude, fix.longitude);
      return fix;
    })
    .catch(() => ({ ok: false, reason: 'error' }));

  session = { triggerMethod, startedAt, locationPromise, photo: deferred(), photoLocalUri: null };
  return session;
}

/**
 * Called by the countdown screen once a photo has been captured, with the
 * promise of its upload. Also called with a failed result when photos are off
 * or the camera is unavailable, so the pipeline never waits on a photo that is
 * not coming.
 */
export function providePhoto(uploadPromise, localUri = null, target = session) {
  // `target` is the session the photo was taken for. The countdown screen
  // passes it explicitly, because a photo can arrive after sending has already
  // begun, by which point the module-level session has been cleared.
  const s = target;
  if (!s) return;
  s.photoLocalUri = localUri;
  Promise.resolve(uploadPromise)
    .then((result) => s.photo.resolve(result))
    .catch(() => s.photo.resolve({ ok: false, reason: 'error' }));
}

export function getAlertSession() {
  return session;
}

/**
 * Writes an alert record. The document id is created locally first, so even
 * if the write cannot be confirmed in time — no signal — the id is known and
 * Firestore keeps retrying in the background while the app is open.
 */
async function recordAlert(uid, data) {
  const ref = doc(alertsRef(uid));
  const write = setDoc(ref, {
    ...data,
    triggeredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    resolvedAt: null,
  });
  try {
    await withTimeout(write, RECORD_TIMEOUT_MS, 'Save alert');
    return { id: ref.id, saved: true };
  } catch (error) {
    const code = error?.code || 'unknown';
    console.log(`[MauSOS] Alert record not saved: ${code} ·`, error?.message);
    // Only a timeout or a dropped connection will fix itself: Firestore keeps
    // retrying those. Anything else (e.g. permission-denied) has been refused.
    return { id: ref.id, saved: false, retrying: code === 'timeout' || code === 'unavailable', code };
  }
}

/** Ends the session without sending, and records that it was cancelled. */
export function cancelAlert(uid) {
  const s = session;
  session = null;
  if (!s || !uid) return;

  // A photo may already be uploading. Once it finishes, remove it: a picture
  // taken for an alert that was cancelled should not remain online.
  Promise.race([s.photo.promise, sleep(PHOTO_LATE_LIMIT_MS)]).then((photo) => {
    if (photo?.ok && photo.deleteToken) deleteUploadedPhoto(photo.deleteToken);
  });

  recordAlert(uid, {
    triggerMethod: s.triggerMethod,
    status: ALERT_STATUS.CANCELLED,
    clientTriggeredAt: s.startedAt,
    location: null,
    address: null,
    locationSource: null,
    contactsNotified: [],
    channel: 'none',
    durationMs: Date.now() - s.startedAt,
    photoUrl: null,
  });
}

/** Flattens a dispatch result into one entry per contact, for display and storage. */
function summariseDispatch(result, contacts) {
  if (result.channel === 'none') return [];

  const composerSet = new Set(result.composerRecipients || []);
  const composerOk = result.composer?.success === true;
  const hasSilentResults = Boolean(result.results || result.silent?.results);

  // Silent sending was never attempted (no permission, or unsupported), so
  // every contact went to the composer together.
  if (!hasSilentResults) {
    return contacts.map((c) => ({
      name: c.name,
      phone: c.phone,
      channel: 'composer',
      success: composerOk,
      code: composerOk ? null : result.composer?.code || 'E_COMPOSER',
    }));
  }

  // Silent sending was attempted; any contacts it could not reach for a
  // device-level reason were passed on to the composer.
  const silentResults = result.results || result.silent?.results || [];
  return silentResults.map((r) => {
    if (composerSet.has(r.phone)) {
      return {
        name: r.name,
        phone: r.phone,
        channel: 'composer',
        success: composerOk,
        code: composerOk ? null : result.composer?.code || 'E_COMPOSER',
      };
    }
    return {
      name: r.name,
      phone: r.phone,
      channel: 'silent',
      success: r.success,
      code: r.success ? null : r.code || 'E_UNKNOWN',
    };
  });
}

/**
 * Runs the alert: waits for the location already being acquired, builds the
 * message, sends it, and records the outcome.
 *
 * `onProgress` receives partial state as each stage starts and finishes, so
 * the status screen can show the alert progressing live.
 */
export async function sendAlert({ uid, profile, contacts, onProgress, silentOnly = false }) {
  const s = session ?? beginAlert(TRIGGER_METHOD.BUTTON);
  session = null;
  const emit = (patch) => onProgress?.(patch);
  const sendStartedAt = Date.now();

  // 1. Location and photo — both started during the countdown. Location is
  //    always awaited; the photo only for a short grace period.
  emit({ location: { state: 'working' }, photo: { state: 'working', localUri: s.photoLocalUri } });
  const [fix, earlyPhoto] = await Promise.all([
    s.locationPromise,
    Promise.race([s.photo.promise, sleep(PHOTO_GRACE_MS)]),
  ]);
  emit({ location: { state: fix.ok ? 'done' : 'failed', fix } });

  const photoReady = earlyPhoto?.ok === true;
  const photoPending = earlyPhoto === null;
  if (!photoPending) {
    emit({ photo: photoState(earlyPhoto, s.photoLocalUri) });
  }

  // 2. Message.
  const message = buildAlertMessage({
    userName: profile?.fullName,
    userPhone: profile?.phone,
    latitude: fix.ok ? fix.latitude : null,
    longitude: fix.ok ? fix.longitude : null,
    address: fix.ok ? fix.address : null,
    photoUrl: photoReady ? earlyPhoto.url : null,
    triggerMethod: s.triggerMethod,
    timestamp: new Date(s.startedAt),
  });

  // 3. Dispatch.
  emit({ dispatch: { state: 'working', total: contacts.length } });
  const result = await dispatchAlert(contacts, message, { silentOnly });
  const notified = summariseDispatch(result, contacts);
  const reached = notified.filter((n) => n.success).length;
  const durationMs = Date.now() - sendStartedAt;
  emit({
    dispatch: {
      state: reached > 0 ? 'done' : 'failed',
      channel: result.channel,
      reached,
      total: contacts.length,
      notified,
      durationMs,
    },
  });

  // 4. Record.
  emit({ record: { state: 'working' } });
  const record = {
    triggerMethod: s.triggerMethod,
    status: reached > 0 ? ALERT_STATUS.SENT : ALERT_STATUS.FAILED,
    clientTriggeredAt: s.startedAt,
    location: fix.ok
      ? { latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy }
      : null,
    address: fix.ok ? fix.address ?? null : null,
    locationSource: fix.ok ? fix.source : fix.reason ?? null,
    contactsNotified: notified,
    channel: result.channel,
    durationMs,
    photoUrl: photoReady ? earlyPhoto.url : null,
  };
  const saved = await recordAlert(uid, record);
  emit({
    record: {
      state: saved.saved ? 'done' : saved.retrying ? 'pending' : 'failed',
      alertId: saved.id,
      code: saved.code,
    },
  });

  // 5. A photo that missed the grace period follows on its own.
  if (photoPending) {
    sendLatePhoto({ uid, alertId: saved.id, s, profile, notified, channel: result.channel, emit });
  }

  return { alertId: saved.id, record, message };
}

/**
 * A duress alert, raised from the stealth calculator (D-33). It skips the
 * countdown and the camera — both would be visible — and never opens the
 * messaging app. Repeats within a minute are ignored, so pressing = again
 * does not send a second round of messages.
 */
let lastDuressAt = 0;
const DURESS_REPEAT_MS = 60000;

export async function sendDuressAlert({ uid, profile, contacts }) {
  if (Date.now() - lastDuressAt < DURESS_REPEAT_MS) return null;
  lastDuressAt = Date.now();
  const s = beginAlert(TRIGGER_METHOD.DURESS);
  providePhoto({ ok: false, reason: 'disabled' }, null, s);
  const outcome = await sendAlert({ uid, profile, contacts, silentOnly: true });
  console.log(`[MauSOS] Duress alert ${outcome.record.status} via ${outcome.record.channel}`);
  return outcome;
}

function photoState(photo, localUri) {
  if (photo?.ok) return { state: 'done', url: photo.url, localUri };
  if (photo?.reason === 'disabled' || photo?.reason === 'permission') {
    return { state: 'skipped', reason: photo.reason };
  }
  return { state: 'failed', reason: photo?.reason, localUri };
}

/**
 * Sends the photo link once its upload completes, and attaches it to the
 * record. The follow-up SMS is only sent when the alert itself went out
 * silently; on a device that needed the messaging app, a second composer
 * would demand another tap from someone who may not be able to give it, so
 * the photo is attached to the record only.
 */
async function sendLatePhoto({ uid, alertId, s, profile, notified, channel, emit }) {
  const photo = await Promise.race([s.photo.promise, sleep(PHOTO_LATE_LIMIT_MS)]);
  if (!photo?.ok) {
    emit(photo === null ? { photo: { state: 'failed', reason: 'timeout' } } : { photo: photoState(photo, s.photoLocalUri) });
    return;
  }

  let followUp = 'not-sent';
  if (channel === 'silent' && hasSmsPermission()) {
    const reached = notified.filter((n) => n.success).map((n) => ({ name: n.name, phone: n.phone }));
    if (reached.length) {
      await sendToContacts(reached, buildPhotoFollowUpMessage(profile?.fullName, photo.url));
      followUp = 'sent';
    }
  }

  try {
    await withTimeout(
      updateDoc(doc(alertsRef(uid), alertId), { photoUrl: photo.url, updatedAt: serverTimestamp() }),
      RECORD_TIMEOUT_MS,
      'Attach photo'
    );
  } catch (error) {
    console.warn('[MauSOS] Photo not attached to record yet:', error?.code || error?.message);
  }

  emit({ photo: { state: 'late', url: photo.url, localUri: s.photoLocalUri, followUp } });
}

/**
 * The user is safe: tells everyone who was reached, and marks the alert
 * resolved. Only the status changes; the original record stays as it was.
 */
export async function resolveAlert({ uid, alertId, profile, notified }) {
  const recipients = (notified || [])
    .filter((n) => n.success)
    .map((n) => ({ name: n.name, phone: n.phone }));

  const result = recipients.length
    ? await dispatchAlert(recipients, buildAllClearMessage(profile?.fullName))
    : { channel: 'none' };

  try {
    await withTimeout(
      updateDoc(doc(alertsRef(uid), alertId), {
        status: ALERT_STATUS.RESOLVED,
        resolvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      RECORD_TIMEOUT_MS,
      'Resolve alert'
    );
  } catch (error) {
    console.warn('[MauSOS] Resolve not confirmed yet:', error?.code || error?.message);
  }

  return { channel: result.channel, recipients: recipients.length };
}
