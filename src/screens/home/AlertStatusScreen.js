import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
  Linking,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Button from '../../components/Button';
import { useAuth } from '../../context/AuthContext';
import { useContacts } from '../../context/ContactsContext';
import { sendAlert, resolveAlert } from '../../services/alertService';
import { describeFix } from '../../services/locationService';
import { formatPhoneForDisplay } from '../../utils/validators';
import { colors, spacing, typography, radius, shadow } from '../../utils/theme';

// ---------------------------------------------------------------------------
// Live progress of an alert, then its outcome.
//
// Each stage — location, photo, sending, saving — is shown as it happens, so the user
// knows exactly what has and has not reached their contacts. While the alert
// is still sending, leaving the screen is blocked; afterwards the user can
// call their first contact directly or confirm they are safe, which sends an
// all-clear to everyone who received the alert.
// ---------------------------------------------------------------------------

function StepIcon({ state }) {
  if (state === 'working') return <ActivityIndicator size="small" color={colors.primary} />;
  if (state === 'done') return <Ionicons name="checkmark-circle" size={22} color={colors.success} />;
  if (state === 'failed') return <Ionicons name="close-circle" size={22} color={colors.danger} />;
  if (state === 'pending') return <Ionicons name="time-outline" size={22} color={colors.warning} />;
  return <Ionicons name="ellipse-outline" size={22} color={colors.borderStrong} />;
}

// Read aloud by screen readers in place of the icons.
const STATE_WORDS = { working: 'in progress', done: 'done', failed: 'failed', pending: 'waiting', idle: 'not started' };

function Step({ title, detail, state, imageUri }) {
  return (
    <View
      style={styles.step}
      accessible
      accessibilityLabel={`${title}: ${STATE_WORDS[state] || ''}${detail ? `. ${detail}` : ''}`}
    >
      <View style={styles.stepIcon}>
        <StepIcon state={state} />
      </View>
      <View style={styles.stepBody}>
        <Text style={styles.stepTitle}>{title}</Text>
        {detail ? <Text style={styles.stepDetail}>{detail}</Text> : null}
      </View>
      {imageUri ? <Image source={{ uri: imageUri }} style={styles.thumb} /> : null}
    </View>
  );
}

function photoDetail(p) {
  if (!p) return null;
  switch (p.state) {
    case 'working':
      return 'Uploading photo…';
    case 'done':
      return 'Included in the alert';
    case 'late':
      return p.followUp === 'sent'
        ? 'Uploaded after the alert and sent separately'
        : 'Uploaded after the alert and saved to history';
    case 'skipped':
      return p.reason === 'disabled' ? 'Photos are turned off' : 'Camera permission not granted';
    case 'failed':
      return p.reason === 'not-configured'
        ? 'Photo upload is not set up yet'
        : ['not-ready', 'camera-timeout', 'camera', 'capture'].includes(p.reason)
          ? 'The camera was not ready in time'
          : 'The photo could not be uploaded';
    default:
      return null;
  }
}

// 'late' is a success that arrived after the alert; show it as done.
const photoIconState = (state) => (state === 'late' ? 'done' : state === 'skipped' ? 'idle' : state);

function dispatchDetail(d) {
  if (!d || d.state === 'idle') return null;
  if (d.state === 'working') return `Sending to ${d.total} contact${d.total === 1 ? '' : 's'}…`;
  const via =
    d.channel === 'silent'
      ? 'sent automatically'
      : d.channel === 'composer'
        ? 'via your messaging app'
        : 'partly via your messaging app';
  const secs = d.durationMs != null ? ` in ${(d.durationMs / 1000).toFixed(1)} s` : '';
  return `${d.reached} of ${d.total} reached, ${via}${secs}`;
}

export default function AlertStatusScreen({ navigation }) {
  const { user, profile } = useAuth();
  const { contacts } = useContacts();

  const [steps, setSteps] = useState({
    location: { state: 'working' },
    photo: { state: 'working' },
    dispatch: { state: 'idle' },
    record: { state: 'idle' },
  });
  const [outcome, setOutcome] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState(false);
  const started = useRef(false);

  // Snapshot the contacts at the moment of the alert, so a contact edited
  // elsewhere mid-send cannot change who this alert went to.
  const recipients = useRef(contacts).current;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    sendAlert({
      uid: user.uid,
      profile,
      contacts: recipients,
      onProgress: (patch) => setSteps((prev) => ({ ...prev, ...patch })),
    }).then(setOutcome);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Block hardware back until the alert has finished sending.
  useEffect(() => {
    // While sending, back is blocked. Afterwards it goes home, skipping the
    // countdown screen that stays underneath to finish the photo.
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (outcome) navigation.navigate('Tabs');
      return true;
    });
    return () => sub.remove();
  }, [outcome]);

  const d = steps.dispatch;
  const sending = !outcome;
  const succeeded = outcome && d.reached > 0;
  const first = recipients[0];

  function callFirst() {
    if (!first) return;
    Linking.openURL(`tel:${first.phone}`).catch(() =>
      Alert.alert('Could not start a call', `Dial ${formatPhoneForDisplay(first.phone)} manually.`)
    );
  }

  function confirmSafe() {
    Alert.alert(
      'Send an all-clear?',
      'Everyone who received your alert will get a message saying you are safe.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'I am safe',
          onPress: async () => {
            setResolving(true);
            await resolveAlert({
              uid: user.uid,
              alertId: outcome.alertId,
              profile,
              notified: d.notified,
            });
            setResolving(false);
            setResolved(true);
          },
        },
      ]
    );
  }

  let headIcon = <ActivityIndicator size="large" color={colors.danger} />;
  let headTitle = 'Sending your alert…';
  let headText = 'Keep the app open until this finishes.';
  if (outcome && succeeded) {
    headIcon = <Ionicons name="shield-checkmark" size={48} color={colors.success} />;
    headTitle = resolved ? 'All-clear sent' : 'Alert sent';
    headText = resolved
      ? 'Your contacts have been told you are safe.'
      : 'Your contacts have your location. Stay where you are if it is safe to do so.';
  } else if (outcome) {
    headIcon = <Ionicons name="warning" size={48} color={colors.danger} />;
    headTitle = 'Alert not delivered';
    headText = 'No contact could be reached. Call for help directly.';
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.head}>
          {headIcon}
          <Text style={styles.headTitle}>{headTitle}</Text>
          <Text style={styles.headText}>{headText}</Text>
        </View>

        <View style={styles.card}>
          <Step
            title="Location"
            state={steps.location.state}
            detail={steps.location.fix ? describeFix(steps.location.fix) : 'Finding your location…'}
          />
          <Step
            title="Photo"
            state={photoIconState(steps.photo.state)}
            detail={photoDetail(steps.photo)}
            imageUri={steps.photo.localUri}
          />
          <Step title="Contacts" state={d.state} detail={dispatchDetail(d)} />
          <Step
            title="Saved to history"
            state={steps.record.state}
            detail={
              steps.record.state === 'pending'
                ? 'Will save when your connection returns'
                : steps.record.state === 'done'
                  ? 'Saved'
                  : steps.record.state === 'failed'
                    ? `Could not be saved (${steps.record.code})`
                    : null
            }
          />
        </View>

        {d.notified && d.notified.length > 0 ? (
          <View style={styles.card}>
            {d.notified.map((n) => (
              <View key={n.phone} style={styles.person}>
                <Ionicons
                  name={n.success ? 'checkmark' : 'close'}
                  size={18}
                  color={n.success ? colors.success : colors.danger}
                />
                <Text style={styles.personName} numberOfLines={1}>
                  {n.name}
                </Text>
                <Text style={styles.personMeta}>
                  {n.success ? (n.channel === 'silent' ? 'Sent' : 'Opened in messages') : 'Failed'}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          {first ? (
            <Button
              title={`Call ${first.name}`}
              variant="danger"
              onPress={callFirst}
              disabled={sending}
            />
          ) : null}
          {succeeded && !resolved ? (
            <Button
              title="I'm safe now"
              variant="secondary"
              onPress={confirmSafe}
              loading={resolving}
              style={styles.gap}
            />
          ) : null}
          <Button
            title="Back to home"
            variant="ghost"
            onPress={() => navigation.navigate('Tabs')}
            disabled={sending}
            style={styles.gap}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg },

  head: { alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.lg },
  headTitle: { ...typography.h1, marginTop: spacing.md, textAlign: 'center' },
  headText: { ...typography.bodyMuted, textAlign: 'center', marginTop: spacing.xs, lineHeight: 22 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  step: { flexDirection: 'row', paddingVertical: spacing.sm },
  stepIcon: { width: 28, alignItems: 'center', paddingTop: 1 },
  stepBody: { flex: 1, marginLeft: spacing.sm },
  stepTitle: { ...typography.label },
  stepDetail: { ...typography.caption, marginTop: 2, lineHeight: 18 },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, marginLeft: spacing.sm },

  person: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  personName: { ...typography.body, flex: 1, marginLeft: spacing.sm },
  personMeta: { ...typography.caption },

  actions: { marginTop: spacing.sm },
  gap: { marginTop: spacing.sm },
});
