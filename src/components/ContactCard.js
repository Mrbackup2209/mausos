import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography, shadow } from '../utils/theme';
import { formatPhoneForDisplay } from '../utils/validators';

// ---------------------------------------------------------------------------
// One emergency contact in the list.
//
// The priority-one contact is marked explicitly, because that position has a
// consequence the user should understand: it is who the alert reaches first.
// Reorder controls sit on the right, large enough to hit reliably, and are
// disabled at the ends of the list rather than hidden, so every card keeps the
// same shape.
// ---------------------------------------------------------------------------

function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export default function ContactCard({ contact, isFirst, isLast, onPress, onMoveUp, onMoveDown, busy }) {
  const primary = contact.priority === 1;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${contact.name}, ${contact.relationship}, priority ${contact.priority}. Tap to edit.`}
    >
      <View style={[styles.avatar, primary && styles.avatarPrimary]}>
        <Text style={[styles.avatarText, primary && styles.avatarTextPrimary]}>
          {initials(contact.name) || '?'}
        </Text>
      </View>

      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{contact.name}</Text>
          {primary ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>First</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {contact.relationship} · {formatPhoneForDisplay(contact.phone)}
        </Text>
      </View>

      <View style={styles.reorder}>
        <Pressable
          onPress={onMoveUp}
          disabled={isFirst || busy}
          hitSlop={8}
          style={styles.arrow}
          accessibilityLabel={`Move ${contact.name} up`}
        >
          <Ionicons
            name="chevron-up"
            size={20}
            color={isFirst || busy ? colors.border : colors.textMuted}
          />
        </Pressable>
        <Pressable
          onPress={onMoveDown}
          disabled={isLast || busy}
          hitSlop={8}
          style={styles.arrow}
          accessibilityLabel={`Move ${contact.name} down`}
        >
          <Ionicons
            name="chevron-down"
            size={20}
            color={isLast || busy ? colors.border : colors.textMuted}
          />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  pressed: { opacity: 0.85 },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarPrimary: { backgroundColor: colors.primary },
  avatarText: { fontSize: 15, fontWeight: '700', color: colors.primaryDark },
  avatarTextPrimary: { color: colors.textInverse },

  body: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { ...typography.h3, flexShrink: 1 },
  badge: {
    marginLeft: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.primaryDark },
  meta: { ...typography.caption, marginTop: 2 },

  reorder: { marginLeft: spacing.sm },
  arrow: { padding: 2 },
});
