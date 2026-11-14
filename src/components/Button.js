import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import { colors, spacing, radius, typography } from '../utils/theme';

// ---------------------------------------------------------------------------
// One button component for the whole app.
//
// Variants: primary (filled blue), danger (filled red), secondary (outlined),
// ghost (text only). Having a single component means spacing, height and
// disabled styling stay identical everywhere, which is most of what makes an
// interface look deliberate rather than assembled.
// ---------------------------------------------------------------------------

export default function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
}) {
  const isInactive = disabled || loading;

  const containerStyles = [
    styles.base,
    styles[variant],
    fullWidth && styles.fullWidth,
    isInactive && styles.inactive,
    style,
  ];

  const labelStyles = [styles.label, styles[`${variant}Label`]];

  return (
    <TouchableOpacity
      style={containerStyles}
      onPress={onPress}
      disabled={isInactive}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isInactive, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'secondary' || variant === 'ghost' || variant === 'ghostDanger'
            ? colors.primary
            : colors.textInverse}
        />
      ) : (
        <View style={styles.content}>
          <Text style={labelStyles}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center' },
  inactive: { opacity: 0.5 },

  primary: { backgroundColor: colors.primary },
  danger: { backgroundColor: colors.danger },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  ghost: { backgroundColor: 'transparent', height: 44 },
  ghostDanger: { backgroundColor: 'transparent', height: 44 },

  label: { ...typography.button },
  primaryLabel: { color: colors.textInverse },
  dangerLabel: { color: colors.textInverse },
  secondaryLabel: { color: colors.primary },
  ghostLabel: { color: colors.primary },
  ghostDangerLabel: { color: colors.danger },
});
