import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import SOSButton from '../../components/SOSButton';
import Button from '../../components/Button';
import { useAuth } from '../../context/AuthContext';
import { useContacts } from '../../context/ContactsContext';
import { beginAlert } from '../../services/alertService';
import { getLocationPermission, requestLocationPermission } from '../../services/locationService';
import { hasSmsPermission, requestSmsPermission } from '../../services/smsService';
import { getCameraPermission, requestCameraPermission } from '../../services/mediaService';
import { TRIGGER_METHOD } from '../../utils/constants';
import { colors, spacing, typography, radius } from '../../utils/theme';

// ---------------------------------------------------------------------------
// The SOS screen — the screen the app opens on.
//
// Everything here serves one action. The button sits in the centre, large
// enough to find by feel. Above it, three status pills say at a glance whether
// an alert would work right now: contacts, location, SMS and camera. Anything missing
// is surfaced as a card with a single button to fix it, so permission prompts
// happen here, calmly, and never on top of a countdown in an emergency.
// ---------------------------------------------------------------------------

function Pill({ ok, icon, label }) {
  return (
    <View
      style={[styles.pill, ok ? styles.pillOk : styles.pillWarn]}
      accessible
      accessibilityLabel={`${label}${ok ? '' : ', needs attention'}`}
    >
      <Ionicons name={icon} size={14} color={ok ? colors.success : colors.warning} />
      <Text style={[styles.pillText, { color: ok ? colors.success : colors.warning }]}>{label}</Text>
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const { profile } = useAuth();
  const { contacts, loading } = useContacts();
  const [perm, setPerm] = useState({
    location: null,
    sms: null,
    camera: null,
    canAskLocation: true,
    canAskCamera: true,
  });

  const refreshPermissions = useCallback(async () => {
    const [location, camera] = await Promise.all([getLocationPermission(), getCameraPermission()]);
    setPerm({
      location: location.granted,
      canAskLocation: location.canAskAgain,
      camera: camera.granted,
      canAskCamera: camera.canAskAgain,
      sms: Platform.OS === 'android' ? hasSmsPermission() : true,
    });
  }, []);

  // Re-checked whenever the tab regains focus, e.g. after returning from
  // Android settings where the user may have granted a permission.
  useFocusEffect(
    useCallback(() => {
      refreshPermissions();
    }, [refreshPermissions])
  );

  // Asks for each missing permission in turn. Any that Android will no longer
  // prompt for ("Don't ask again") can only be granted in settings.
  async function grantPermissions() {
    let needSettings = false;
    if (!perm.location) {
      if (perm.canAskLocation) await requestLocationPermission();
      else needSettings = true;
    }
    if (!perm.sms) await requestSmsPermission();
    if (!perm.camera) {
      if (perm.canAskCamera) await requestCameraPermission();
      else needSettings = true;
    }
    if (needSettings) Linking.openSettings();
    refreshPermissions();
  }

  function activate() {
    beginAlert(TRIGGER_METHOD.BUTTON);
    navigation.navigate('Countdown');
  }

  const hasContacts = contacts.length > 0;
  const permsKnown = perm.location !== null;
  const needsPermissions = permsKnown && (!perm.location || !perm.sms || !perm.camera);
  const onlySettingsLeft =
    (perm.location || !perm.canAskLocation) &&
    (perm.camera || !perm.canAskCamera) &&
    perm.sms &&
    (!perm.location || !perm.camera);
  const firstName = profile?.fullName?.split(' ')[0];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <View>
          <Text style={styles.greeting}>{firstName ? `Hi, ${firstName}` : 'MauSOS'}</Text>
          <Text style={styles.subtitle}>Hold the button if you need help.</Text>

          <View style={styles.pills}>
            <Pill
              ok={hasContacts}
              icon="people"
              label={loading ? 'Contacts…' : `${contacts.length} contact${contacts.length === 1 ? '' : 's'}`}
            />
            <Pill
              ok={perm.location === true}
              icon="location"
              label={perm.location ? 'Location on' : 'No location'}
            />
            <Pill ok={perm.sms === true} icon="chatbubble" label={perm.sms ? 'SMS ready' : 'No SMS'} />
            <Pill ok={perm.camera === true} icon="camera" label={perm.camera ? 'Camera on' : 'No camera'} />
          </View>

          {needsPermissions ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Allow MauSOS to help you</Text>
              <Text style={styles.cardText}>
                {!perm.location ? 'Location lets your contacts find you. ' : ''}
                {!perm.sms ? 'SMS lets alerts send without opening another app. ' : ''}
                {!perm.camera ? 'The camera adds a photo of your surroundings to the alert.' : ''}
              </Text>
              <Button
                title={onlySettingsLeft ? 'Open settings' : 'Allow'}
                onPress={grantPermissions}
                style={styles.cardButton}
              />
            </View>
          ) : null}
        </View>

        <View style={styles.centre}>
          <SOSButton onActivate={activate} disabled={!loading && !hasContacts} />
          {hasContacts ? (
            <Text style={styles.recipients} numberOfLines={2}>
              Alerts go to {contacts.map((c) => c.name).join(', ')}
            </Text>
          ) : !loading ? (
            <Pressable onPress={() => navigation.navigate('Contacts')} style={styles.addLink}>
              <Text style={styles.addLinkText}>Add an emergency contact to arm the button</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.primary} />
            </Pressable>
          ) : null}
          {hasContacts && profile?.settings?.shakeEnabled ? (
            <View style={styles.shakeHint}>
              <Ionicons name="phone-portrait-outline" size={14} color={colors.textMuted} />
              <Text style={styles.shakeHintText}>Or shake your phone firmly</Text>
            </View>
          ) : null}
        </View>

        {__DEV__ ? (
          <Pressable onPress={() => navigation.navigate('DevTools')} style={styles.dev}>
            <Text style={styles.devText}>Developer tools</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg },

  greeting: { ...typography.h1 },
  subtitle: { ...typography.bodyMuted, marginTop: spacing.xs },

  pills: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md, marginHorizontal: -4 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    margin: 4,
  },
  pillOk: { backgroundColor: colors.successLight },
  pillWarn: { backgroundColor: colors.warningLight },
  pillText: { fontSize: 12, fontWeight: '600', marginLeft: 4 },

  card: {
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  cardTitle: { ...typography.label, color: colors.text },
  cardText: { ...typography.caption, marginTop: spacing.xs, lineHeight: 19 },
  cardButton: { marginTop: spacing.md, height: 44 },

  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  recipients: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  shakeHint: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  shakeHintText: { ...typography.caption, marginLeft: 4 },
  addLink: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  addLinkText: { ...typography.label, color: colors.primary, marginRight: spacing.xs },

  dev: { alignSelf: 'center', padding: spacing.sm },
  devText: { ...typography.caption, color: colors.textFaint },
});
