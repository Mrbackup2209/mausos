import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { register } from '../../services/authService';
import {
  validateEmail,
  validatePassword,
  validateConfirmPassword,
  validateFullName,
  validatePhone,
  runValidators,
} from '../../utils/validators';
import { colors, spacing, typography, radius } from '../../utils/theme';

export default function RegisterScreen({ navigation }) {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear a field's error as soon as the user starts correcting it, rather
    // than leaving stale red text under a field they are actively fixing.
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
  }

  async function handleRegister() {
    setSubmitError('');

    const { isValid, errors: fieldErrors } = runValidators({
      fullName: validateFullName(form.fullName),
      email: validateEmail(form.email),
      phone: validatePhone(form.phone),
      password: validatePassword(form.password),
      confirmPassword: validateConfirmPassword(form.password, form.confirmPassword),
    });

    setErrors(fieldErrors);
    if (!isValid) return;

    setLoading(true);
    const result = await register({
      fullName: form.fullName,
      email: form.email,
      password: form.password,
      phone: form.phone,
    });
    setLoading(false);

    // Success needs no navigation — AuthContext picks up the new session and
    // RootNavigator switches stacks automatically.
    if (!result.success) setSubmitError(result.error);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>
              Your emergency contacts and alert history are tied to this account,
              so they survive a lost or replaced phone.
            </Text>
          </View>

          <Input
            label="Full name"
            value={form.fullName}
            onChangeText={(v) => setField('fullName', v)}
            placeholder="Your name"
            autoCapitalize="words"
            autoComplete="name"
            maxLength={60}
            error={errors.fullName}
          />

          <Input
            label="Email"
            value={form.email}
            onChangeText={(v) => setField('email', v)}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
            error={errors.email}
          />

          <Input
            label="Phone number"
            value={form.phone}
            onChangeText={(v) => setField('phone', v)}
            placeholder="5789 1234"
            keyboardType="phone-pad"
            autoComplete="tel"
            error={errors.phone}
          />
          <Text style={styles.hint}>
            Included in alerts so your contacts know who to call back.
          </Text>

          <Input
            label="Password"
            value={form.password}
            onChangeText={(v) => setField('password', v)}
            placeholder="At least 8 characters"
            secureTextEntry
            error={errors.password}
          />

          <Input
            label="Confirm password"
            value={form.confirmPassword}
            onChangeText={(v) => setField('confirmPassword', v)}
            placeholder="Re-enter your password"
            secureTextEntry
            error={errors.confirmPassword}
          />

          {submitError ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{submitError}</Text>
            </View>
          ) : null}

          <Button title="Create account" onPress={handleRegister} loading={loading} />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },

  header: { marginBottom: spacing.lg },
  title: { ...typography.h1, marginBottom: spacing.sm },
  subtitle: { ...typography.bodyMuted, lineHeight: 22 },

  hint: {
    ...typography.caption,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    marginLeft: spacing.xs,
  },

  banner: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  bannerText: { ...typography.caption, color: colors.dangerDark },

  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  footerText: { ...typography.body, color: colors.textMuted },
  footerLink: { ...typography.body, color: colors.primary, fontWeight: '600' },
});
