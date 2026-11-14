import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { useStealth } from '../../context/StealthContext';
import { configureStealth, validateCodes, CODE_RULES } from '../../services/stealthService';
import { isSilentSendSupported, hasSmsPermission } from '../../services/smsService';
import { colors, spacing, typography, radius } from '../../utils/theme';

// ---------------------------------------------------------------------------
// Sets the two stealth codes. Each is typed twice, since a mistyped unlock
// code would lock the user out of the real app behind the calculator.
// ---------------------------------------------------------------------------

export default function StealthSetupScreen({ navigation }) {
  const { refresh } = useStealth();
  const [unlock, setUnlock] = useState('');
  const [unlockConfirm, setUnlockConfirm] = useState('');
  const [duress, setDuress] = useState('');
  const [duressConfirm, setDuressConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const canSendSilently = isSilentSendSupported() && hasSmsPermission();

  const field = (setter, key) => (v) => {
    setter(v.replace(/\D/g, ''));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: null }));
  };

  async function save() {
    const result = validateCodes(unlock, unlockConfirm, duress, duressConfirm);
    setErrors(result.errors);
    if (!result.isValid) return;

    setSaving(true);
    try {
      await configureStealth(unlock, duress);
      await refresh();
      navigation.goBack();
      Alert.alert(
        'Stealth mode is on',
        'From the next time MauSOS opens, it will look like a calculator. ' +
          'Type your unlock code and press = to open it. You can also lock it now from Settings.'
      );
    } catch (error) {
      Alert.alert('Not saved', 'The codes could not be stored on this phone. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>
            With stealth mode on, MauSOS opens as a working calculator. Nothing on it mentions MauSOS.
          </Text>

          <Text style={styles.heading}>Unlock code</Text>
          <Text style={styles.help}>Type it, then press =, to open MauSOS.</Text>
          <Input
            label={`Unlock code (${CODE_RULES.min}–${CODE_RULES.max} digits)`}
            value={unlock}
            onChangeText={field(setUnlock, 'unlock')}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={CODE_RULES.max}
            error={errors.unlock}
          />
          <Input
            label="Type it again"
            value={unlockConfirm}
            onChangeText={field(setUnlockConfirm, 'unlockConfirm')}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={CODE_RULES.max}
            error={errors.unlockConfirm}
          />

          <Text style={styles.heading}>Duress code</Text>
          <Text style={styles.help}>
            Type it, then press =, to send an alert without anyone seeing. There is no countdown and no photo, and the
            calculator carries on as normal. Your contacts are told not to call you back.
          </Text>
          <Input
            label={`Duress code (${CODE_RULES.min}–${CODE_RULES.max} digits)`}
            value={duress}
            onChangeText={field(setDuress, 'duress')}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={CODE_RULES.max}
            error={errors.duress}
          />
          <Input
            label="Type it again"
            value={duressConfirm}
            onChangeText={field(setDuressConfirm, 'duressConfirm')}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={CODE_RULES.max}
            error={errors.duressConfirm}
          />

          {!canSendSilently ? (
            <View style={styles.warning}>
              <Ionicons name="warning-outline" size={18} color={colors.warning} />
              <Text style={styles.warningText}>
                MauSOS cannot send SMS by itself on this phone right now (allow SMS on the SOS screen). A duress alert
                will be saved to your history, but your contacts will not be messaged — opening the messaging app
                would give it away.
              </Text>
            </View>
          ) : (
            <Text style={styles.note}>
              On some phones the system blocks apps from sending SMS directly. There, a duress alert is saved to your
              history but cannot message your contacts.
            </Text>
          )}

          <Text style={styles.note}>
            Your codes are stored only on this phone, encrypted and as one-way hashes. They are not sent anywhere and
            cannot be shown again — if you forget the unlock code, reinstalling the app turns stealth mode off.
          </Text>

          <Button title="Turn on stealth mode" onPress={save} loading={saving} style={styles.save} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  intro: { ...typography.body, lineHeight: 22, marginBottom: spacing.md },
  heading: { ...typography.h3, marginTop: spacing.md },
  help: { ...typography.caption, marginTop: 2, marginBottom: spacing.md, lineHeight: 18 },
  warning: {
    flexDirection: 'row',
    backgroundColor: colors.warningLight,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  warningText: { ...typography.caption, color: colors.text, marginLeft: spacing.sm, flex: 1, lineHeight: 18 },
  note: { ...typography.caption, marginTop: spacing.md, lineHeight: 18 },
  save: { marginTop: spacing.lg },
});
