// ---------------------------------------------------------------------------
// Input validation and sanitisation.
//
// The assignment requires "data validation and sanitisation" as part of the
// security marks, so every value entering Firestore passes through here first.
// Each validator returns null when the value is acceptable, or a message to
// show the user when it is not.
// ---------------------------------------------------------------------------

// Mauritian numbers are 8 digits; +230 is the country code.
const MU_COUNTRY_CODE = '+230';

export function validateEmail(email) {
  if (!email || !email.trim()) return 'Email is required';
  // Deliberately permissive. Strict RFC-compliant email regexes reject valid
  // addresses; the real check is the verification email Firebase sends.
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!pattern.test(email.trim())) return 'Enter a valid email address';
  return null;
}

export function validatePassword(password) {
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Za-z]/.test(password)) return 'Password must contain a letter';
  if (!/[0-9]/.test(password)) return 'Password must contain a number';
  return null;
}

export function validateConfirmPassword(password, confirm) {
  if (!confirm) return 'Please confirm your password';
  if (password !== confirm) return 'Passwords do not match';
  return null;
}

export function validateFullName(name) {
  if (!name || !name.trim()) return 'Full name is required';
  if (name.trim().length < 2) return 'Name is too short';
  if (name.trim().length > 60) return 'Name is too long';
  return null;
}

export function validatePhone(phone) {
  if (!phone || !phone.trim()) return 'Phone number is required';
  const digits = phone.replace(/[^\d+]/g, '');
  // Accept a local 8-digit number or an international number with country code.
  if (/^\d{8}$/.test(digits)) return null;
  if (/^\+\d{10,15}$/.test(digits)) return null;
  return 'Enter a valid phone number (8 digits, or with country code)';
}

// Turns whatever the user typed into a consistent E.164 number, so the SMS
// layer never has to guess. "5 789 1234" and "57891234" both become
// "+23057891234".
export function normalisePhone(phone) {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 8) return `${MU_COUNTRY_CODE}${digits}`;
  return digits;
}

// Strips control characters and collapses whitespace before anything is
// written to the database.
export function sanitiseText(value, maxLength = 200) {
  if (!value) return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

// Runs a map of { field: validatorResult } and reports whether all passed.
// Usage:
//   const { isValid, errors } = runValidators({
//     email: validateEmail(email),
//     password: validatePassword(password),
//   });
export function runValidators(results) {
  const errors = {};
  Object.keys(results).forEach((field) => {
    if (results[field]) errors[field] = results[field];
  });
  return { isValid: Object.keys(errors).length === 0, errors };
}

// ---------------------------------------------------------------------------
// Emergency contacts.
// ---------------------------------------------------------------------------

export function validateContactName(name) {
  if (!name || !name.trim()) return 'Name is required';
  if (name.trim().length > 40) return 'Keep the name under 40 characters';
  return null;
}

/**
 * Checks a contact's number against the user's own number and the existing
 * contacts. Both are easy mistakes that would make an alert useless: texting
 * yourself, or texting the same person twice while missing someone else.
 */
export function validateContactPhone(phone, { ownPhone, existing = [], excludeId } = {}) {
  const basic = validatePhone(phone);
  if (basic) return basic;

  const normalised = normalisePhone(phone);
  if (ownPhone && normalisePhone(ownPhone) === normalised) {
    return 'That is your own number. Alerts need to reach someone else.';
  }
  const duplicate = existing.find(
    (c) => c.id !== excludeId && normalisePhone(c.phone) === normalised
  );
  if (duplicate) return `${duplicate.name} already has this number.`;
  return null;
}

/** "+23057891234" -> "+230 5789 1234". Other formats are returned unchanged. */
export function formatPhoneForDisplay(phone) {
  if (!phone) return '';
  const m = /^\+230(\d{4})(\d{4})$/.exec(phone);
  return m ? `+230 ${m[1]} ${m[2]}` : phone;
}
