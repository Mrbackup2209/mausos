import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../../components/Button';
import Input from '../../components/Input';
import { useAuth } from '../../context/AuthContext';
import { logout, testFirestoreConnection } from '../../services/authService';
import {
  isSilentSendSupported,
  hasSmsPermission,
  requestSmsPermission,
  sendSms,
  countParts,
  buildAlertMessage,
  openComposer,
} from '../../services/smsService';
import { colors, spacing, typography, radius, shadow } from '../../utils/theme';
import { APP_NAME } from '../../utils/constants';

// ---------------------------------------------------------------------------
// Developer tools.
//
// Diagnostics used while building the app: account state, a Firestore round
// trip, and the SMS spike that established which sending routes this device
// accepts. Reachable only in development builds (__DEV__), so it never appears
// in the release APK.
// ---------------------------------------------------------------------------

export default function DevToolsScreen() {
  const { user, profile, profileError, refreshProfile } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState(null);

  // Temporary diagnostic. Removed once the Firestore connection is confirmed.
  async function runConnectionTest() {
    setTesting(true);
    const result = await testFirestoreConnection();
    setTesting(false);

    console.log('[MauSOS] Firestore connection test:', JSON.stringify(result, null, 2));

    if (result.ok) {
      await refreshProfile();
      Alert.alert(
        'Firestore reachable',
        'A write and read both completed. Check the Firebase console — the ' +
          'users collection should now contain your document.'
      );
    } else {
      Alert.alert(
        'Firestore failed at: ' + result.stage,
        'code: ' + (result.code || 'none') + '\n\n' + (result.detail || ''),
        [{ text: 'OK' }]
      );
    }
  }

  // -------------------------------------------------------------------------
  // SMS spike.
  //
  // The purpose is to establish, before anything is built on top of it, that
  // this device can send an SMS with no user interaction. If it cannot, the
  // alert pipeline has to be designed around the system composer instead, and
  // it is far better to know that now than in week three.
  // -------------------------------------------------------------------------
  async function runSmsTest() {
    if (!testNumber.trim()) {
      Alert.alert('Enter a number', 'Type a number you are happy to receive a real SMS on.');
      return;
    }

    if (!isSilentSendSupported()) {
      Alert.alert(
        'Not supported',
        'This device reports no telephony hardware, so it cannot send SMS.'
      );
      return;
    }

    const permission = await requestSmsPermission();
    if (!permission.granted) {
      Alert.alert(
        'Permission refused',
        permission.neverAskAgain
          ? 'SMS permission was permanently refused. Enable it in Android Settings > Apps > MauSOS > Permissions.'
          : 'MauSOS cannot send the alert without SMS permission.'
      );
      return;
    }

    // Built with the real alert formatter and plausible coordinates, so the
    // test exercises the actual message length and multipart splitting rather
    // than a short string that would hide both.
    const message = buildAlertMessage({
      userName: profile?.fullName || user?.email || 'Test user',
      userPhone: profile?.phone,
      latitude: -20.23889,
      longitude: 57.49556,
      address: 'Rose Hill, Plaines Wilhems',
      triggerMethod: 'button',
    });

    const parts = countParts(message);

    Alert.alert(
      'Send a real SMS?',
      `To: ${testNumber}\n\n${message}\n\nThis will be ${parts} SMS part(s) and will be charged by your network.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'destructive',
          onPress: async () => {
            setSmsSending(true);
            const started = Date.now();
            const result = await sendSms(testNumber, message);
            const elapsed = Date.now() - started;
            setSmsSending(false);

            console.log('[MauSOS] SMS test:', JSON.stringify({ ...result, elapsed }, null, 2));
            setSmsResult({ ...result, elapsed, parts });

            if (result.success) {
              Alert.alert(
                'Sent',
                `Android confirmed ${result.parts} part(s) left the device in ${elapsed}ms ` +
                  `via the "${result.strategy}" route.\n\n` +
                  'Check the receiving phone.'
              );
            } else {
              // Offer the fallback the real alert pipeline will use, so both
              // channels are proven before anything is built on them.
              Alert.alert(
                'Silent send refused',
                `${result.code}\n\n${result.error}\n\n` +
                  'MauSOS falls back to opening the messaging app with the alert ' +
                  'already filled in. Try that now?',
                [
                  { text: 'Not now', style: 'cancel' },
                  {
                    text: 'Open messaging app',
                    onPress: async () => {
                      const fallback = await openComposer([testNumber], message);
                      console.log('[MauSOS] Composer fallback:', JSON.stringify(fallback));
                      setSmsResult((prev) => ({ ...prev, fallback: fallback.outcome || fallback.code }));
                    },
                  },
                ]
              );
            }
          },
        },
      ]
    );
  }

  function confirmLogout() {
    Alert.alert(
      'Sign out?',
      'You will need to sign in again before you can send an alert.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            await logout();
            setLoggingOut(false);
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Text style={styles.greeting}>
            {profile?.fullName ? `Hello, ${profile.fullName.split(' ')[0]}` : 'Hello'}
          </Text>
          <Text style={styles.subtitle}>{APP_NAME} is set up and signed in.</Text>
        </View>



        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account</Text>
          <Row label="Email" value={user?.email || '—'} />
          <Row label="Phone" value={profile?.phone || '—'} />
          <Row label="User ID" value={user?.uid ? `${user.uid.slice(0, 12)}…` : '—'} />
          <Row
            label="Profile loaded"
            value={profile ? 'Yes' : `No${profileError ? ` (${profileError})` : ''}`}
          />
        </View>

        <View style={styles.footer}>
          <Button
            title="Test Firestore connection"
            variant="secondary"
            onPress={runConnectionTest}
            loading={testing}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>SMS spike</Text>
          <Row
            label="Telephony"
            value={isSilentSendSupported() ? 'Available' : 'Not available'}
          />
          <Row
            label="SEND_SMS granted"
            value={hasSmsPermission() ? 'Yes' : 'No'}
          />
          <Row
            label="Device"
            value={`${Platform.constants?.Manufacturer ?? '?'} ${Platform.constants?.Model ?? ''}`}
          />
          <Row label="Android API" value={String(Platform.Version)} />
          {smsResult ? (
            <>
              <Row
                label="Last result"
                value={smsResult.success ? `Sent (${smsResult.parts} parts)` : smsResult.code}
              />
              {smsResult.strategy ? (
                <Row label="Route used" value={smsResult.strategy} />
              ) : null}
              {smsResult.fallback ? (
                <Row label="Fallback" value={smsResult.fallback} />
              ) : null}
              <Row label="Round trip" value={`${smsResult.elapsed} ms`} />
            </>
          ) : null}

          <View style={styles.spikeInput}>
            <Input
              label="Send a real test SMS to"
              value={testNumber}
              onChangeText={setTestNumber}
              placeholder="5789 1234"
              keyboardType="phone-pad"
            />
            <Text style={styles.warn}>
              This sends a real message and your network will charge for it. Use
              your own number.
            </Text>
            <Button
              title="Send test SMS"
              variant="danger"
              onPress={runSmsTest}
              loading={smsSending}
            />
          </View>
        </View>

        <View style={styles.footer}>
          <Button
            title="Sign out"
            variant="secondary"
            onPress={confirmLogout}
            loading={loggingOut}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, padding: spacing.lg },
  spikeInput: { marginTop: spacing.md },
  setupBanner: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  setupTitle: { ...typography.label, color: colors.dangerDark, marginBottom: spacing.xs },
  setupText: { ...typography.caption, color: colors.dangerDark, lineHeight: 19 },
  readyBanner: {
    backgroundColor: colors.successLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  readyText: { ...typography.label, color: colors.success },
  warn: {
    ...typography.caption,
    color: colors.dangerDark,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },

  greeting: { ...typography.h1 },
  subtitle: { ...typography.bodyMuted, marginTop: spacing.xs },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    ...shadow.card,
  },
  cardTitle: { ...typography.h3, marginBottom: spacing.sm },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: { ...typography.caption },
  rowValue: { ...typography.caption, color: colors.text, flexShrink: 1, marginLeft: spacing.md },

  notice: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  noticeTitle: { ...typography.label, color: colors.primaryDark, marginBottom: spacing.xs },
  noticeText: { ...typography.caption, color: colors.primaryDark, lineHeight: 19 },

  footer: { marginTop: 'auto' },
});
