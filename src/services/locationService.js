import * as Location from 'expo-location';
import { withTimeout } from '../utils/async';
import { ALERT } from '../utils/constants';

// ---------------------------------------------------------------------------
// Location for an alert.
//
// GPS works without any network connection: position comes from satellites,
// not from the internet. Only the street address needs data, so the alert
// never waits on it. If reverse geocoding fails, the message carries the
// coordinates and a map link instead, which is just as usable to a contact.
//
// Strategy, in order:
//   1. A fresh high-accuracy fix, bounded by a timeout.
//   2. The last position Android already knows, if recent enough. Indoors or
//      in a basement a fresh fix may never arrive, and a position from a few
//      minutes ago is far better than none.
//   3. No location, the alert still sends, saying so.
//
// The alert flow starts this the moment the countdown begins, so the fix is
// usually ready by the time the countdown ends and costs no extra time.
// ---------------------------------------------------------------------------

const LAST_KNOWN_MAX_AGE_MS = 30 * 60 * 1000;
const GEOCODE_TIMEOUT_MS = 4000;

export async function getLocationPermission() {
  try {
    const r = await Location.getForegroundPermissionsAsync();
    return { granted: r.granted, canAskAgain: r.canAskAgain };
  } catch (error) {
    return { granted: false, canAskAgain: true };
  }
}

export async function requestLocationPermission() {
  try {
    const r = await Location.requestForegroundPermissionsAsync();
    return { granted: r.granted, canAskAgain: r.canAskAgain };
  } catch (error) {
    return { granted: false, canAskAgain: false };
  }
}

function shape(position) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: Math.round(position.coords.accuracy ?? 0),
    timestamp: position.timestamp,
  };
}

/**
 * Finds the device's position.
 * Returns { ok: true, source: 'gps' | 'last-known', latitude, longitude,
 * accuracy, ageMs, ms } or { ok: false, reason }.
 */
export async function locate({ timeoutMs = ALERT.LOCATION_TIMEOUT_MS } = {}) {
  const started = Date.now();

  const permission = await getLocationPermission();
  if (!permission.granted) return { ok: false, reason: 'permission', ms: 0 };

  let servicesOn = true;
  try {
    servicesOn = await Location.hasServicesEnabledAsync();
  } catch (error) {
    // Unknown — try anyway.
  }

  if (servicesOn) {
    try {
      const position = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        timeoutMs,
        'GPS fix'
      );
      return { ok: true, source: 'gps', ...shape(position), ageMs: 0, ms: Date.now() - started };
    } catch (error) {
      // Timed out or failed; fall back to the last known position.
    }
  }

  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
    if (last) {
      return {
        ok: true,
        source: 'last-known',
        ...shape(last),
        ageMs: Date.now() - last.timestamp,
        ms: Date.now() - started,
      };
    }
  } catch (error) {
    // Nothing cached.
  }

  return { ok: false, reason: servicesOn ? 'timeout' : 'services-off', ms: Date.now() - started };
}

/**
 * Turns coordinates into a short readable place, e.g. "Royal Road, Rose Hill".
 * Returns null when offline or when nothing useful comes back.
 */
export async function describeLocation(latitude, longitude) {
  try {
    const results = await withTimeout(
      Location.reverseGeocodeAsync({ latitude, longitude }),
      GEOCODE_TIMEOUT_MS,
      'Reverse geocode'
    );
    const r = results?.[0];
    if (!r) return null;

    // `name` is often just a house number; skip it unless it says something.
    const candidates = [
      r.name && !/^\d+[a-zA-Z]?$/.test(r.name) ? r.name : null,
      r.street,
      r.district || r.subregion,
      r.city,
    ].filter(Boolean);

    const unique = candidates.filter((part, i) => candidates.indexOf(part) === i);
    return unique.slice(0, 3).join(', ') || null;
  } catch (error) {
    return null;
  }
}

/** Human-readable summary of a locate() result, for the alert screens. */
export function describeFix(fix) {
  if (!fix) return 'Finding your location…';
  if (!fix.ok) {
    if (fix.reason === 'permission') return 'Location permission not granted';
    if (fix.reason === 'services-off') return 'Location is turned off on this phone';
    return 'Location unavailable';
  }
  const where = fix.address || `${fix.latitude.toFixed(4)}, ${fix.longitude.toFixed(4)}`;
  if (fix.source === 'last-known') {
    const mins = Math.max(1, Math.round(fix.ageMs / 60000));
    return `${where} (last known, ${mins} min ago)`;
  }
  return `${where} (±${fix.accuracy} m)`;
}
