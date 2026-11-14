import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { withTimeout } from '../utils/async';
import { normalisePhone, sanitiseText } from '../utils/validators';
import { MAX_CONTACTS, RELATIONSHIPS } from '../utils/constants';

// ---------------------------------------------------------------------------
// Emergency contacts, stored at users/{uid}/contacts/{contactId}.
//
// Each contact carries a `priority` from 1 upwards. Priority 1 is the person
// the alert is sent to first and, later, the person the call fallback dials.
// Priorities are kept contiguous (1, 2, 3 …) after every change so the order
// shown on screen is always exactly the order used in an emergency.
//
// All multi-document changes go through a write batch so they are atomic: a
// reorder or deletion either fully applies or not at all, and the list can
// never end up with two contacts sharing priority 1.
// ---------------------------------------------------------------------------

const WRITE_TIMEOUT_MS = 10000;

function contactsRef(uid) {
  return collection(db, 'users', uid, 'contacts');
}

function friendly(error) {
  if (error?.code === 'permission-denied') {
    return 'You do not have permission to change these contacts.';
  }
  if (error?.code === 'timeout' || error?.code === 'unavailable') {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return 'Something went wrong saving your contacts. Please try again.';
}

function cleanContact({ name, phone, relationship }) {
  return {
    name: sanitiseText(name, 40),
    phone: normalisePhone(phone),
    relationship: RELATIONSHIPS.includes(relationship) ? relationship : 'Other',
  };
}

/**
 * Subscribes to the user's contacts, ordered by priority.
 *
 * Firestore applies local writes to the listener immediately, before the
 * server confirms them, so the list updates the instant the user saves.
 * Returns the unsubscribe function.
 */
export function subscribeToContacts(uid, onChange, onError) {
  const q = query(contactsRef(uid), orderBy('priority', 'asc'));
  return onSnapshot(
    q,
    (snapshot) => {
      onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (error) => {
      console.error('[MauSOS] Contacts listener error:', error?.code, error?.message);
      onError?.(friendly(error));
    }
  );
}

/** Adds a contact at the end of the priority order. */
export async function addContact(uid, data, existing) {
  if (existing.length >= MAX_CONTACTS) {
    return { success: false, error: `You can have at most ${MAX_CONTACTS} emergency contacts.` };
  }
  try {
    const ref = doc(contactsRef(uid));
    const batch = writeBatch(db);
    batch.set(ref, {
      ...cleanContact(data),
      priority: existing.length + 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await withTimeout(batch.commit(), WRITE_TIMEOUT_MS, 'Add contact');
    return { success: true, id: ref.id };
  } catch (error) {
    return { success: false, error: friendly(error) };
  }
}

export async function updateContact(uid, contactId, data) {
  try {
    const batch = writeBatch(db);
    batch.update(doc(contactsRef(uid), contactId), {
      ...cleanContact(data),
      updatedAt: serverTimestamp(),
    });
    await withTimeout(batch.commit(), WRITE_TIMEOUT_MS, 'Update contact');
    return { success: true };
  } catch (error) {
    return { success: false, error: friendly(error) };
  }
}

/** Deletes a contact and closes the gap it leaves in the priority order. */
export async function deleteContact(uid, contactId, existing) {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(contactsRef(uid), contactId));
    existing
      .filter((c) => c.id !== contactId)
      .forEach((c, index) => {
        if (c.priority !== index + 1) {
          batch.update(doc(contactsRef(uid), c.id), { priority: index + 1 });
        }
      });
    await withTimeout(batch.commit(), WRITE_TIMEOUT_MS, 'Delete contact');
    return { success: true };
  } catch (error) {
    return { success: false, error: friendly(error) };
  }
}

/** Moves a contact one place up (-1) or down (+1) in the priority order. */
export async function moveContact(uid, existing, contactId, direction) {
  const index = existing.findIndex((c) => c.id === contactId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= existing.length) {
    return { success: true };
  }

  const reordered = [...existing];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  try {
    const batch = writeBatch(db);
    reordered.forEach((c, i) => {
      if (c.priority !== i + 1) {
        batch.update(doc(contactsRef(uid), c.id), { priority: i + 1 });
      }
    });
    await withTimeout(batch.commit(), WRITE_TIMEOUT_MS, 'Reorder contacts');
    return { success: true };
  } catch (error) {
    return { success: false, error: friendly(error) };
  }
}
