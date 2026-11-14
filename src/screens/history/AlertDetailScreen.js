import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Button from '../../components/Button';
import { useAuth } from '../../context/AuthContext';
import { subscribeToAlert } from '../../services/historyService';
import { resolveAlert } from '../../services/alertService';
import {
  CHANNEL_LABEL,
  TRIGGER_LABEL,
  describeSmsFailure,
  isSilentDuressBlocked,
  formatCoords,
  formatDuration,
  formatWhen,
  mapsUrl,
  statusMeta,
  toMillis,
} from '../../utils/alertFormat';
import { formatPhoneForDisplay } from '../../utils/validators';
import { colors, spacing, typography, radius, shadow } from '../../utils/theme';

// ---------------------------------------------------------------------------
// One alert, in full: what happened, where, what the camera saw, and who was
// told. The record is live, so a photo that arrived after the alert appears
// here as soon as it is attached.
//
// The only action is the all-clear, offered while an alert is still open. It
// tells everyone who was reached that the user is safe and marks the record
// resolved — the one change the security rules allow besides a late photo.
// ---------------------------------------------------------------------------

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

export default function AlertDetailScreen({ route }) {
  const { alertId } = route.params;
  const { user, profile } = useAuth();
  const [alert, setAlert] = useState(undefined);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    return subscribeToAlert(user.uid, alertId, setAlert, () => setAlert(null));
  }, [user, alertId]);

  if (alert === undefined) {
    return (
      <View style={[styles.safe, styles.centre]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (alert === null) {
    return (
      <View style={[styles.safe, styles.centre]}>
        <Text style={typography.bodyMuted}>This alert could not be loaded.</Text>
      </View>
    );
  }

  const meta = statusMeta(alert.status);
  const contacts = alert.contactsNotified || [];
  const maps = mapsUrl(alert.location);
  const resolvedAt = toMillis(alert.resolvedAt);
  const canResolve = alert.status === 'sent';

  function confirmResolve() {
    Alert.alert(
      'Send the all-clear?',
      'Everyone who received this alert will get a message saying you are safe.',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: "I'm safe",
          onPress: async () => {
            setResolving(true);
            await resolveAlert({ uid: user.uid, alertId: alert.id, profile, notified: contacts });
            setResolving(false);
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <View style={[styles.banner, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={28} color={meta.color} />
        <View style={styles.bannerBody}>
          <Text style={[styles.bannerTitle, { color: meta.color }]}>{meta.label}</Text>
          <Text style={styles.bannerWhen}>{formatWhen(alert.clientTriggeredAt)}</Text>
        </View>
      </View>

      {alert.photoUrl ? (
        <Section title="Photo">
          <Pressable onPress={() => Linking.openURL(alert.photoUrl)} accessibilityRole="imagebutton">
            <Image source={{ uri: alert.photoUrl }} style={styles.photo} resizeMode="cover" />
          </Pressable>
          <Text style={styles.hint}>Tap to open full size. Contacts received this same link.</Text>
        </Section>
      ) : null}

      {alert.status !== 'cancelled' ? (
        <Section title="Location">
          {alert.location ? (
            <>
              {alert.address ? <Text style={styles.address}>{alert.address}</Text> : null}
              <Text style={styles.coords}>{formatCoords(alert.location)}</Text>
              {alert.locationSource === 'last-known' ? (
                <Text style={styles.hint}>A recent saved position; a fresh GPS fix was not available.</Text>
              ) : null}
              <Button
                title="Open in Maps"
                variant="secondary"
                onPress={() => Linking.openURL(maps)}
                style={styles.mapsButton}
              />
            </>
          ) : (
            <Text style={styles.muted}>
              No location was available
              {alert.locationSource === 'permission'
                ? ' — location permission was off.'
                : alert.locationSource === 'services-off'
                  ? ' — location services were off.'
                  : '.'}
            </Text>
          )}
        </Section>
      ) : null}

      {contacts.length > 0 ? (
        <Section title="Contacts">
          {contacts.map((c, i) => (
            <View key={`${c.phone}-${i}`} style={[styles.contact, i > 0 && styles.contactDivider]}>
              <Ionicons
                name={c.success ? 'checkmark-circle' : 'close-circle'}
                size={20}
                color={c.success ? colors.success : colors.danger}
              />
              <View style={styles.contactBody}>
                <Text style={typography.label}>{c.name}</Text>
                <Text style={styles.muted}>
                  {formatPhoneForDisplay(c.phone)} ·{' '}
                  {c.success
                    ? c.channel === 'composer'
                      ? 'via messaging app'
                      : 'delivered to network'
                    : describeSmsFailure(c.code)}
                </Text>
              </View>
            </View>
          ))}
        </Section>
      ) : null}

      <Section title="Details">
        <Row label="Triggered by" value={TRIGGER_LABEL[alert.triggerMethod] || alert.triggerMethod} />
        <Row
          label="Sending"
          value={
            isSilentDuressBlocked(alert)
              ? 'Not sent: this phone only sends SMS through the messaging app, which would have been visible'
              : CHANNEL_LABEL[alert.channel]
          }
        />
        <Row
          label={alert.status === 'cancelled' ? 'Cancelled after' : 'Time to send'}
          value={formatDuration(alert.durationMs)}
        />
        <Row label="Resolved" value={resolvedAt ? formatWhen(resolvedAt) : null} />
      </Section>

      {canResolve ? (
        <Button
          title="I'm safe — send the all-clear"
          onPress={confirmResolve}
          loading={resolving}
          style={styles.resolve}
        />
      ) : null}

      <Text style={styles.footnote}>
        Alert records are permanent. They cannot be edited or deleted, so the history stays a reliable
        account of what happened.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centre: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  bannerBody: { marginLeft: spacing.md },
  bannerTitle: { ...typography.h3 },
  bannerWhen: { ...typography.caption, marginTop: 2 },

  section: { marginTop: spacing.lg },
  sectionTitle: {
    ...typography.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, ...shadow.card },

  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  hint: { ...typography.caption, marginTop: spacing.sm },

  address: { ...typography.body, lineHeight: 22 },
  coords: { ...typography.caption, marginTop: spacing.xs },
  mapsButton: { marginTop: spacing.md, height: 44 },
  muted: { ...typography.caption, lineHeight: 19 },

  contact: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  contactDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  contactBody: { marginLeft: spacing.md, flex: 1 },

  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  kvLabel: { ...typography.caption },
  kvValue: { ...typography.caption, color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: spacing.md },

  resolve: { marginTop: spacing.lg },
  footnote: { ...typography.caption, textAlign: 'center', marginTop: spacing.lg, lineHeight: 19 },
});
