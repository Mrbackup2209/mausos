import { SHAKE } from '../utils/constants';

// ---------------------------------------------------------------------------
// Shake detection from the accelerometer.
//
// A phone lying still reads about 1 g (gravity). Walking, running or a phone
// bouncing in a bag peaks around 1.2–2 g, and only briefly. A deliberate,
// hard shake produces repeated peaks around or above 2 g.
//
// So a single spike never triggers anything. The detector counts spikes above
// the threshold and only fires when SHAKE.REQUIRED_SPIKES of them happen within
// SHAKE.WINDOW_MS — about a second of vigorous shaking. Spikes less
// than MIN_SPIKE_GAP_MS apart count once, since one swing of the arm can
// produce several readings above the line.
//
// The sensor library is loaded lazily: if the native part is missing from the
// installed build, shake detection is reported as unavailable instead of the
// app failing to start.
// ---------------------------------------------------------------------------

const MIN_SPIKE_GAP_MS = 100;

export const SENSITIVITY_THRESHOLD = {
  low: SHAKE.THRESHOLD_LOW,
  medium: SHAKE.THRESHOLD_MEDIUM,
  high: SHAKE.THRESHOLD_HIGH,
};

function loadAccelerometer() {
  try {
    // eslint-disable-next-line global-require
    return require('expo-sensors').Accelerometer;
  } catch (error) {
    console.log('[MauSOS] Accelerometer module not available:', error?.message);
    return null;
  }
}

export async function isShakeAvailable() {
  const Accelerometer = loadAccelerometer();
  if (!Accelerometer) return false;
  try {
    return await Accelerometer.isAvailableAsync();
  } catch (error) {
    console.log('[MauSOS] Accelerometer check failed:', error?.message);
    return false;
  }
}

/**
 * Starts listening. Calls `onShake` once per detected shake.
 * Returns a function that stops listening (or null if unavailable).
 */
export function startShakeDetection({ sensitivity = 'medium', onShake }) {
  const Accelerometer = loadAccelerometer();
  if (!Accelerometer) return null;

  const threshold = SENSITIVITY_THRESHOLD[sensitivity] ?? SHAKE.THRESHOLD_MEDIUM;
  let spikes = [];
  let lastSpikeAt = 0;

  try {
    Accelerometer.setUpdateInterval(SHAKE.UPDATE_INTERVAL_MS);
    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      const g = Math.sqrt(x * x + y * y + z * z);
      if (g < threshold) return;

      const now = Date.now();
      if (now - lastSpikeAt < MIN_SPIKE_GAP_MS) return;
      lastSpikeAt = now;

      spikes = spikes.filter((t) => now - t <= SHAKE.WINDOW_MS);
      spikes.push(now);

      if (spikes.length >= SHAKE.REQUIRED_SPIKES) {
        console.log(`[MauSOS] Shake detected (${spikes.length} spikes above ${threshold} g)`);
        spikes = [];
        onShake();
      }
    });
    return () => subscription.remove();
  } catch (error) {
    console.log('[MauSOS] Could not start shake detection:', error?.message);
    return null;
  }
}
