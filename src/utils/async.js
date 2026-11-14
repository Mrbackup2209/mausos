// ---------------------------------------------------------------------------
// Shared async helpers.
// ---------------------------------------------------------------------------

/**
 * Races a promise against a deadline.
 *
 * Firestore writes never reject when the backend is unreachable — they queue
 * locally and the promise stays pending. Without a deadline a failed write is
 * indistinguishable from a slow one and the caller waits forever. Every
 * Firestore call in the app goes through this.
 */
export function withTimeout(promise, ms, label = 'Operation') {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} did not complete within ${ms}ms`);
      error.code = 'timeout';
      reject(error);
    }, ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}
