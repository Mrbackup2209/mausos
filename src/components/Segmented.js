import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../utils/theme';

// ---------------------------------------------------------------------------
// A row of mutually exclusive options, e.g. 3 s / 5 s / 10 s / 15 s.
// Chosen over a dropdown because every option is visible at once and a
// choice is one tap, which suits settings with only a handful of values.
// ---------------------------------------------------------------------------

export default function Segmented({ options, value, onChange, disabled = false }) {
  return (
    <View style={[styles.track, disabled && styles.disabled]} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => !disabled && !selected && onChange(option.value)}
            style={[styles.segment, selected && styles.selected]}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={option.a11y || option.label}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm + 2,
    padding: 3,
    marginTop: spacing.sm,
  },
  disabled: { opacity: 0.45 },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  selected: {
    backgroundColor: colors.surface,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  labelSelected: { color: colors.primary },
});
