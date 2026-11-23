// ---------------------------------------------------------------------------
// Design tokens.
//
// Every colour, spacing value and text style in the app comes from here.
// Nothing hardcodes a hex value or a pixel number in a StyleSheet. That keeps
// the UI consistent across screens and lets us restyle the whole app from one
// file, which matters because UI/UX carries 30% of the marks.
// ---------------------------------------------------------------------------

export const colors = {
  // Brand
  primary: '#1E3A8A',
  primaryDark: '#152C6B',
  primaryLight: '#DBEAFE',

  // The SOS button and anything alert-related. Sampled from the MauSOS mark so
  // the trigger on screen is the same red as the icon on the home screen.
  //
  // Red is reserved exclusively for emergency actions. Navy above carries the
  // ordinary interface, buttons, links, headings precisely so the single red
  // control cannot be confused with anything else. An interface where
  // everything is red has no way to make the SOS button stand out, which
  // matters more here than matching the logo everywhere.
  danger: '#C41E2A',
  dangerDark: '#8A0E18',
  dangerLight: '#FDECEE',
  brandRed: '#9B1019',

  // Status
  success: '#059669',
  successLight: '#D1FAE5',
  warning: '#D97706',
  warningLight: '#FEF3C7',

  // Surfaces
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',

  // Text
  text: '#0F172A',
  textMuted: '#64748B',
  textFaint: '#94A3B8',
  textInverse: '#FFFFFF',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  full: 9999,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '700', color: colors.text },
  h2: { fontSize: 22, fontWeight: '700', color: colors.text },
  h3: { fontSize: 18, fontWeight: '600', color: colors.text },
  body: { fontSize: 16, fontWeight: '400', color: colors.text },
  bodyMuted: { fontSize: 16, fontWeight: '400', color: colors.textMuted },
  caption: { fontSize: 13, fontWeight: '400', color: colors.textMuted },
  button: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
};

// Subtle elevation. Android uses `elevation`, iOS uses the shadow* properties,
// so both are set and each platform ignores the one it does not understand.
export const shadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  raised: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
};
