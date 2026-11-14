// ---------------------------------------------------------------------------
// Tunable values used across the app.
//
// These live in one place so the report can cite exact figures, and so tuning
// (for example making the shake trigger less sensitive) is a one-line change
// rather than a hunt through several files.
// ---------------------------------------------------------------------------

export const APP_NAME = 'MauSOS';

export const ALERT = {
  // How long the user must hold the SOS button before the countdown starts.
  // Long enough that a pocket touch cannot trigger it, short enough that a
  // frightened user does not give up.
  HOLD_DURATION_MS: 3000,

  // Cancellation window after the hold completes.
  DEFAULT_COUNTDOWN_S: 5,
  MIN_COUNTDOWN_S: 3,
  MAX_COUNTDOWN_S: 15,

  // Stops a stuck button or repeated shake from spamming contacts.
  COOLDOWN_MS: 60000,

  // If GPS has not produced a fix within this window we fall back to the last
  // known position rather than delaying the alert any further.
  LOCATION_TIMEOUT_MS: 10000,
};

export const SHAKE = {
  // Acceleration magnitude in g. A still phone reads about 1.0, walking reads
  // roughly 1.2 to 1.5, so these sit clear of normal handling. Lowered after
  // testing on the A50, where the first values (3.2 / 2.5 / 2.0) needed an
  // uncomfortably hard shake even on High (C-12).
  THRESHOLD_LOW: 2.7,
  THRESHOLD_MEDIUM: 2.2,
  THRESHOLD_HIGH: 1.8,

  // A single jolt is not enough. We require several threshold crossings inside
  // this window — roughly a second of deliberate shaking.
  WINDOW_MS: 1500,
  REQUIRED_SPIKES: 4,

  // 20 readings a second. At 10 a second the brief peak of each swing often
  // fell between two readings and was missed.
  UPDATE_INTERVAL_MS: 50,

  // After an alert screen closes — sent or cancelled — shakes are ignored this
  // long, so the shaking that started it cannot immediately start another.
  REARM_MS: 5000,
};

export const TRIGGER_METHOD = {
  BUTTON: 'button',
  SHAKE: 'shake',
  DURESS: 'duress',
};

export const ALERT_STATUS = {
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  FALSE_ALARM: 'falseAlarm',
  RESOLVED: 'resolved',
};

// More than a handful of contacts slows dispatch and dilutes the response.
export const MAX_CONTACTS = 5;

export const RELATIONSHIPS = [
  'Parent',
  'Sibling',
  'Spouse',
  'Child',
  'Friend',
  'Colleague',
  'Neighbour',
  'Other',
];
