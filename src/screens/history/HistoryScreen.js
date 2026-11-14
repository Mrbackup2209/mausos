import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { subscribeToAlerts } from '../../services/historyService';
import { formatWhen, statusMeta, summarise, thumbnailUrl } from '../../utils/alertFormat';
import { colors, spacing, typography, radius, shadow } from '../../utils/theme';

// ---------------------------------------------------------------------------
// Alert history.
//
// Every alert is listed, newest first, including ones cancelled during the
// countdown: an accidental trigger is still worth knowing about. Because
// cancelled alerts can crowd the list, a filter shows only alerts that were
// actually sent. Records are read-only here; tapping one opens its detail.
// ---------------------------------------------------------------------------

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'sent', label: 'Sent only' },
];

function AlertRow({ alert, onPress }) {
  const meta = statusMeta(alert.status);
  const thumb = thumbnailUrl(alert.photoUrl);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${meta.label}, ${formatWhen(alert.clientTriggeredAt)}`}
    >
      <View style={[styles.statusIcon, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={22} color={meta.color} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowStatus, { color: meta.color }]}>{meta.label}</Text>
          <Text style={styles.rowWhen}>{formatWhen(alert.clientTriggeredAt)}</Text>
        </View>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {summarise(alert)}
        </Text>
        {alert.status !== 'cancelled' ? (
          <Text style={styles.rowPlace} numberOfLines={1}>
            {alert.address || (alert.location ? 'Location recorded' : 'No location')}
          </Text>
        ) : null}
      </View>
      {thumb ? <Image source={{ uri: thumb }} style={styles.thumb} /> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

export default function HistoryScreen({ navigation }) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!user) return undefined;
    return subscribeToAlerts(
      user.uid,
      (list) => {
        setAlerts(list);
        setError(null);
      },
      () => setError('History could not be loaded. Check your connection.')
    );
  }, [user]);

  const shown = useMemo(() => {
    if (!alerts) return [];
    return filter === 'sent' ? alerts.filter((a) => a.status !== 'cancelled') : alerts;
  }, [alerts, filter]);

  if (alerts === null && !error) {
    return (
      <SafeAreaView style={[styles.safe, styles.centre]} edges={['top']}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={shown}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>History</Text>
            <Text style={styles.subtitle}>
              Every alert is kept, including cancelled ones. Records cannot be edited or deleted.
            </Text>
            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            {alerts && alerts.length > 0 ? (
              <View style={styles.filters}>
                {FILTERS.map((f) => {
                  const active = f.key === filter;
                  return (
                    <Pressable
                      key={f.key}
                      onPress={() => setFilter(f.key)}
                      style={[styles.chip, active && styles.chipActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <AlertRow alert={item} onPress={() => navigation.navigate('AlertDetail', { alertId: item.id })} />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          !error ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="time-outline" size={36} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>
                {alerts && alerts.length > 0 ? 'No sent alerts' : 'No alerts yet'}
              </Text>
              <Text style={styles.emptyText}>
                {alerts && alerts.length > 0
                  ? 'Only cancelled alerts so far. Switch to "All" to see them.'
                  : 'When you use the SOS button, each alert is recorded here with its time, location, photo and who was notified.'}
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centre: { alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.lg, flexGrow: 1 },

  header: { marginBottom: spacing.md },
  title: { ...typography.h1 },
  subtitle: { ...typography.bodyMuted, marginTop: spacing.xs, lineHeight: 22 },

  errorBanner: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: { ...typography.caption, color: colors.dangerDark },

  filters: { flexDirection: 'row', marginTop: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, fontWeight: '600', color: colors.text },
  chipTextActive: { color: colors.textInverse },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.card,
  },
  rowPressed: { opacity: 0.85 },
  separator: { height: spacing.sm },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowBody: { flex: 1, marginRight: spacing.sm },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowStatus: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  rowWhen: { ...typography.caption, fontSize: 12 },
  rowTitle: { ...typography.label, marginTop: 2 },
  rowPlace: { ...typography.caption, marginTop: 2 },
  thumb: { width: 44, height: 44, borderRadius: radius.sm, marginRight: spacing.sm },

  empty: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...typography.h3, marginTop: spacing.md },
  emptyText: { ...typography.bodyMuted, textAlign: 'center', marginTop: spacing.xs, lineHeight: 22 },
});
