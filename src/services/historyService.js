import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../config/firebase';

// ---------------------------------------------------------------------------
// Alert history: read-only, live.
//
// The app never edits or deletes these records from here; the security rules
// would refuse it anyway. Both functions use live listeners, so a photo
// that arrives after the alert, or an all-clear sent from another screen,
// appears in the history without a refresh.
//
// Sorted by `clientTriggeredAt` (the phone's clock when the alert began)
// rather than the server timestamp: a record written without signal has no
// server time yet, but it still belongs at the top of the list.
// ---------------------------------------------------------------------------

const HISTORY_LIMIT = 50;

function toAlert(snapshot) {
  return { id: snapshot.id, ...snapshot.data() };
}

export function subscribeToAlerts(uid, onData, onError) {
  const q = query(
    collection(db, 'users', uid, 'alerts'),
    orderBy('clientTriggeredAt', 'desc'),
    limit(HISTORY_LIMIT)
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map(toAlert)),
    (error) => {
      console.log('[MauSOS] History listener failed:', error?.code, error?.message);
      onError?.(error);
    }
  );
}

export function subscribeToAlert(uid, alertId, onData, onError) {
  return onSnapshot(
    doc(db, 'users', uid, 'alerts', alertId),
    (snap) => onData(snap.exists() ? toAlert(snap) : null),
    (error) => {
      console.log('[MauSOS] Alert listener failed:', error?.code, error?.message);
      onError?.(error);
    }
  );
}
