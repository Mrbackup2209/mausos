import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Switch, Pressable, StyleSheet, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Segmented from '../../components/Segmented';
import { useAuth } from '../../context/AuthContext';
import { useStealth } from '../../context/StealthContext';
import { logout, resetPassword } from '../../services/authService';
import { isShakeAvailable } from '../../services/shakeDetector';
import { setStealthEnabled, canSwitchIcon } from '../../services/stealthService';
import { ALERT } from '../../utils/constants';
import { formatPhoneForDisplay } from '../../utils/validators';
import { colors, spacing, typography, radius, shadow } from '../../utils/theme';
import appConfig from '../../../app.json';

// ---------------------------------------------------------------------------
// Settings.
//
// Every choice saves the moment it is made, there is no Save button to
// forget. Settings live on the user's Firestore profile rather than only on
// the phone, so they survive a reinstall or a new phone.
//
// Each setting says in plain words what it changes, because the person
// adjusting them is deciding how the app behaves in an emergency.
// ---------------------------------------------------------------------------

const COUNTDOWN_OPTIONS = [3, 5, 10, 15]
  .filter((n) => n >= ALERT.MIN_COUNTDOWN_S && n <= ALERT.MAX_COUNTDOWN_S)
  .map((n) => ({ value: n, label: `${n} s`, a11y: `${n} seconds` }));

const SENSITIVITY_OPTIONS = [
  { value: 'low', label: 'Low', a11y: 'Low: needs the hardest shake' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High', a11y: 'High: a lighter shake is enough' },
];

const CAMERA_OPTIONS = [
  { value: 'back', label: 'Back camera' },
  { value: 'front', label: 'Front camera' },
];

function Section({ title, children, footer }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

function SwitchRow({ title, detail, value, onChange, disabled, divider }) {
  return (
    <View style={[styles.row, divider && styles.divider]}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.borderStrong, true: colors.primary }}
        thumbColor={colors.surface}
        accessibilityLabel={title}
      />
    </View>
  );
}

function LinkRow({ icon, title, detail, onPress, danger, divider }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.primary} style={styles.linkIcon} />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, danger && { color: colors.danger }]}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {!danger ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null}
    </Pressable>
  );
}

export default function SettingsScreen({ navigation }) {
  const { user, profile, updateSettings } = useAuth();
  const stealth = useStealth();
  const [saveNote, setSaveNote] = useState(null);
  const [shakeSupported, setShakeSupported] = useState(true);

  useEffect(() => {
    isShakeAvailable().then(setShakeSupported);
  }, []);

  const settings = profile?.settings || {};
  const countdown = settings.countdownSeconds ?? ALERT.DEFAULT_COUNTDOWN_S;
  const capturePhoto = settings.capturePhoto !== false;
  const camera = settings.preferredCamera === 'front' ? 'front' : 'back';
  const shakeEnabled = settings.shakeEnabled === true;
  const sensitivity = settings.shakeSensitivity || 'medium';

  async function change(patch) {
    const result = await updateSettings(patch);
    if (result.pending) setSaveNote('Saved on this phone. It will sync when you are back online.');
    else if (!result.success) Alert.alert('Not saved', result.error || 'Please try again.');
    else setSaveNote(null);
  }

  function confirmPasswordReset() {
    const email = profile?.email || user?.email;
    Alert.alert('Change password', `We will email a link to ${email} so you can choose a new password.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send link',
        onPress: async () => {
          const result = await resetPassword(email);
          Alert.alert(
            result.success ? 'Email sent' : 'Could not send',
            result.success ? 'Check your inbox for the reset link.' : result.error
          );
        },
      },
    ]);
  }

  function confirmSignOut() {
    Alert.alert(
      'Sign out?',
      'While you are signed out, the SOS button and alerts will not work on this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => logout() },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>

        {/* Profile */}
        <Pressable
          onPress={() => navigation.navigate('EditProfile')}
          style={({ pressed }) => [styles.profile, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Edit your details"
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(profile?.fullName || '?')
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </Text>
          </View>
          <View style={styles.rowText}>
            <Text style={styles.profileName}>{profile?.fullName || 'Your name'}</Text>
            <Text style={styles.rowDetail}>{profile?.email || user?.email}</Text>
            <Text style={[styles.rowDetail, !profile?.phone && { color: colors.warning }]}>
              {profile?.phone ? formatPhoneForDisplay(profile.phone) : 'Add your phone number'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Pressable>

        {saveNote ? <Text style={styles.saveNote}>{saveNote}</Text> : null}

        {/* Alert behaviour */}
        <Section
          title="When you raise an alert"
          footer="A longer countdown gives more time to cancel an accidental alert; a shorter one gets help sooner."
        >
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Countdown before sending</Text>
              <Text style={styles.rowDetail}>Time to cancel after holding the SOS button.</Text>
              <Segmented options={COUNTDOWN_OPTIONS} value={countdown} onChange={(v) => change({ countdownSeconds: v })} />
            </View>
          </View>

          <SwitchRow
            divider
            title="Take a photo"
            detail="Silently photographs your surroundings during the countdown and adds a link to the alert."
            value={capturePhoto}
            onChange={(v) => change({ capturePhoto: v })}
          />

          <View style={[styles.row, styles.divider]}>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, !capturePhoto && styles.faded]}>Camera</Text>
              <Text style={[styles.rowDetail, !capturePhoto && styles.faded]}>
                The back camera shows where you are and who is around you. The front camera shows you.
              </Text>
              <Segmented
                options={CAMERA_OPTIONS}
                value={camera}
                disabled={!capturePhoto}
                onChange={(v) => change({ preferredCamera: v })}
              />
            </View>
          </View>
        </Section>

        {/* Other ways to trigger */}
        <Section
          title="Other ways to raise an alert"
          footer={
            shakeSupported
              ? 'Works while MauSOS is open on screen. A shake starts the same countdown as the button, so it can still be cancelled.'
              : 'This phone has no motion sensor that MauSOS can use.'
          }
        >
          <SwitchRow
            title="Shake to alert"
            detail="Shake the phone firmly for about a second."
            value={shakeEnabled && shakeSupported}
            disabled={!shakeSupported}
            onChange={(v) => change({ shakeEnabled: v })}
          />
          <View style={[styles.row, styles.divider]}>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, !shakeEnabled && styles.faded]}>Sensitivity</Text>
              <Text style={[styles.rowDetail, !shakeEnabled && styles.faded]}>
                Higher reacts to a lighter shake, but is more likely to trigger by accident.
              </Text>
              <Segmented
                options={SENSITIVITY_OPTIONS}
                value={sensitivity}
                disabled={!shakeEnabled || !shakeSupported}
                onChange={(v) => change({ shakeSensitivity: v })}
              />
            </View>
          </View>
        </Section>

        {/* Stealth */}
        <Section
          title="Stealth mode"
          footer={
            stealth.enabled
              ? `MauSOS opens as a calculator${canSwitchIcon() ? ', and its home-screen icon is a calculator named "Calculator"' : ''}. Type your unlock code and press = to open it; type your duress code and press = to send a silent alert. The icon can take a few seconds to change.`
              : 'Disguises MauSOS as a working calculator, including its home-screen icon, with a secret code to open it and another to send an alert without anyone noticing. Turning it off brings back the MauSOS icon.'
          }
        >
          <SwitchRow
            title="Disguise as a calculator"
            detail={stealth.configured ? null : 'You will choose an unlock code and a duress code.'}
            value={stealth.enabled}
            onChange={async (v) => {
              if (v && !stealth.configured) {
                navigation.navigate('StealthSetup');
                return;
              }
              await setStealthEnabled(v);
              await stealth.refresh();
            }}
          />
          {stealth.configured ? (
            <LinkRow divider icon="keypad-outline" title="Change codes" onPress={() => navigation.navigate('StealthSetup')} />
          ) : null}
          {stealth.enabled ? (
            <LinkRow divider icon="calculator-outline" title="Lock now" detail="Show the calculator straight away." onPress={stealth.lock} />
          ) : null}
        </Section>

        {/* Phone */}
        <Section title="This phone">
          <LinkRow
            icon="lock-open-outline"
            title="App permissions"
            detail="Location, SMS and camera, in Android settings."
            onPress={() => Linking.openSettings()}
          />
        </Section>

        {/* Account */}
        <Section title="Account">
          <LinkRow icon="key-outline" title="Change password" onPress={confirmPasswordReset} />
          <LinkRow icon="log-out-outline" title="Sign out" danger divider onPress={confirmSignOut} />
        </Section>

        <Text style={styles.about}>
          {appConfig.expo.name} {appConfig.expo.version}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { ...typography.h1, marginBottom: spacing.md },

  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.card,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: colors.primary },
  profileName: { ...typography.h3 },
  saveNote: { ...typography.caption, color: colors.warning, marginTop: spacing.sm },

  section: { marginTop: spacing.lg },
  sectionTitle: {
    ...typography.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  sectionFooter: { ...typography.caption, marginTop: spacing.sm, lineHeight: 18 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, ...shadow.card },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { opacity: 0.7 },
  rowText: { flex: 1, marginRight: spacing.sm },
  rowTitle: { ...typography.label },
  rowDetail: { ...typography.caption, marginTop: 2, lineHeight: 18 },
  faded: { opacity: 0.45 },
  linkIcon: { marginRight: spacing.md },

  about: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl, color: colors.textFaint },
});
