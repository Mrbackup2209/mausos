// ---------------------------------------------------------------------------
// Cloudinary configuration for alert photos.
//
// Values come from the Cloudinary console:
//   cloudName     — shown on the Dashboard ("Cloud name")
//   uploadPreset  — Settings → Upload → Upload presets → the preset's name
//
// The preset must be "Unsigned", so the app uploads without holding an API
// secret — anything shipped in an APK can be extracted, so a secret here would
// be public. The preset itself limits what an unsigned upload may do: see
// DECISIONS.md D-06 and D-29 for the restrictions it should carry.
// ---------------------------------------------------------------------------

export const cloudinaryConfig = {
  cloudName: 'sfzkevwm',
  uploadPreset: 'mausos_alerts',
  folder: 'mausos/alerts',
};

// Checks the shape of the values rather than comparing to a placeholder, so a
// find-and-replace cannot turn it into a tautology (see C-06).
export function isCloudinaryConfigured() {
  const { cloudName, uploadPreset } = cloudinaryConfig;
  return (
    typeof cloudName === 'string' &&
    /^[a-z0-9_-]{2,}$/i.test(cloudName) &&
    typeof uploadPreset === 'string' &&
    uploadPreset.length > 0
  );
}
