import * as SecureStore from 'expo-secure-store';
import { sha256 } from '../utils/sha256';
import { setDisguised, isIconSwitchSupported } from '../../modules/mausos-icon/src';

// ---------------------------------------------------------------------------
// Stealth mode: the unlock and duress codes.
//
// Storage. The codes never leave the phone and are never stored as typed.
// Each is salted and hashed (SHA-256, repeated HASH_ROUNDS times), and only
// the hashes are kept, in expo-secure-store — on Android, encrypted with a key
// held in the Android Keystore. Someone who copies the app's storage gets
// neither the codes nor anything that reveals them; the app itself cannot
// read them back, only check whether a typed code matches.
//
// Why on the phone and not in Firestore. The disguise belongs to a device,
// and it must work the moment the app opens — before sign-in has finished and
// even with no signal. Keeping it out of the cloud also means the codes are
// never transmitted.
// ---------------------------------------------------------------------------

const KEY = 'mausos.stealth.v1';
const HASH_ROUNDS = 500;

export const CODE_RULES = { min: 4, max: 8 };

function makeSalt() {
  // The salt does not need to be secret, only different per phone, so that
  // the same code on two phones does not produce the same hash.
  let s = Date.now().toString(36);
  for (let i = 0; i < 16; i++) s += Math.floor(Math.random() * 36).toString(36);
  return s;
}

function hashCode(code, salt) {
  let h = `${salt}:${code}`;
  for (let i = 0; i < HASH_ROUNDS; i++) h = sha256(`${salt}:${h}`);
  return h;
}

async function read() {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.log('[MauSOS] Could not read stealth settings:', error?.message);
    return null;
  }
}

async function write(value) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(value));
}

/** { configured, enabled } — never the codes or hashes. */
export async function getStealthState() {
  const s = await read();
  return { configured: Boolean(s?.unlock && s?.duress), enabled: Boolean(s?.enabled && s?.unlock) };
}

export function validateCodes(unlock, unlockConfirm, duress, duressConfirm) {
  const errors = {};
  const digits = new RegExp(`^\\d{${CODE_RULES.min},${CODE_RULES.max}}$`);
  if (!digits.test(unlock)) errors.unlock = `Use ${CODE_RULES.min} to ${CODE_RULES.max} digits`;
  else if (/^(\d)\1+$/.test(unlock)) errors.unlock = 'Avoid a code with one repeated digit';
  if (!errors.unlock && unlock !== unlockConfirm) errors.unlockConfirm = 'The codes do not match';

  if (!digits.test(duress)) errors.duress = `Use ${CODE_RULES.min} to ${CODE_RULES.max} digits`;
  else if (duress === unlock) errors.duress = 'Must be different from the unlock code';
  if (!errors.duress && duress !== duressConfirm) errors.duressConfirm = 'The codes do not match';

  return { isValid: Object.keys(errors).length === 0, errors };
}

/** Saves new codes and turns stealth mode on. */
export async function configureStealth(unlock, duress) {
  const salt = makeSalt();
  await write({ enabled: true, salt, unlock: hashCode(unlock, salt), duress: hashCode(duress, salt) });
  setDisguised(true);
}

/**
 * Turns the disguise on or off. The home-screen icon follows: a calculator
 * named "Calculator" while on, the MauSOS icon and name while off.
 * The codes are kept, so turning it back on needs no new setup.
 */
export async function setStealthEnabled(enabled) {
  const s = await read();
  if (!s) return;
  await write({ ...s, enabled });
  const switched = setDisguised(enabled);
  console.log(`[MauSOS] Stealth ${enabled ? 'on' : 'off'}; icon switch supported: ${isIconSwitchSupported()}, switched: ${switched}`);
}

/** Whether this build can change its home-screen icon (needs the rebuild). */
export function canSwitchIcon() {
  return isIconSwitchSupported();
}

/**
 * Checks a code typed on the calculator.
 * Returns 'unlock', 'duress' or null. Only plausible codes are hashed, so an
 * ordinary sum costs nothing.
 */
export async function checkCode(entry) {
  if (!new RegExp(`^\\d{${CODE_RULES.min},${CODE_RULES.max}}$`).test(entry)) return null;
  const s = await read();
  if (!s?.enabled) return null;
  const h = hashCode(entry, s.salt);
  if (h === s.unlock) return 'unlock';
  if (h === s.duress) return 'duress';
  return null;
}
