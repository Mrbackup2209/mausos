import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { useAuth } from '../../context/AuthContext';
import { useContacts } from '../../context/ContactsContext';
import {
  validateFullName,
  validatePhone,
  normalisePhone,
  sanitiseText,
  runValidators,
  formatPhoneForDisplay,
} from '../../utils/validators';
import { colors, spacing, typography } from '../../utils/theme';

// ---------------------------------------------------------------------------
// The user's own details. The name opens every alert ("… needs help") and the
// phone number lets contacts call back, so both are validated the same way as
// at registration. The email is the sign-in identity and is shown, not edited.
// ---------------------------------------------------------------------------

export default function EditProfileScreen({ navigation }) {
  const { user, profile, updateProfile } = useAuth();
  const { contacts } = useContacts();
  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [phone, setPhone] = useState(formatPhoneForDisplay(profile?.phone || ''));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  function clearError(field) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
  }

  async function save() {
    const normalised = phone.trim() ? normalisePhone(phone) : '';
    const clash = contacts.find((c) => c.phone === normalised);
    const { isValid, errors: fieldErrors } = runValidators({
      fullName: validateFullName(fullName),
      phone:
        validatePhone(phone) ||
        (clash ? `${clash.name} has this number. Your own number cannot also be a contact.` : null),
    });
    setErrors(fieldErrors);
    if (!isValid) return;

    setSaving(true);
    const result = await updateProfile({ fullName: sanitiseText(fullName, 60), phone: normalised });
    setSaving(false);

    if (result.success || result.pending) navigation.goBack();
    else Alert.alert('Not saved', result.error);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Input
            label="Full name"
            value={fullName}
            onChangeText={(v) => {
              setFullName(v);
              clearError('fullName');
            }}
            autoCapitalize="words"
            maxLength={60}
            error={errors.fullName}
          />
          <Text style={styles.help}>Alerts begin with this name, so contacts know who needs help.</Text>

          <Input
            label="Your phone number"
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              clearError('phone');
            }}
            placeholder="5789 1234"
            keyboardType="phone-pad"
            error={errors.phone}
          />
          <Text style={styles.help}>Included in alerts so contacts can call you back.</Text>

          <View style={styles.emailBox}>
            <Text style={styles.emailLabel}>Email</Text>
            <Text style={styles.emailValue}>{profile?.email || user?.email}</Text>
            <Text style={styles.help}>Your sign-in email cannot be changed here.</Text>
          </View>

          <Button title="Save" onPress={save} loading={saving} style={styles.save} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { padding: spacing.lg },
  help: { ...typography.caption, marginTop: -spacing.sm, marginBottom: spacing.md, lineHeight: 18 },
  emailBox: { marginTop: spacing.sm },
  emailLabel: { ...typography.label, marginBottom: spacing.xs },
  emailValue: { ...typography.body, color: colors.textMuted, marginBottom: spacing.sm },
  save: { marginTop: spacing.lg },
});
