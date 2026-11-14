import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { resetPassword } from '../../services/authService';
import { validateEmail } from '../../utils/validators';
import { colors, spacing, typography, radius } from '../../utils/theme';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    const validationError = validateEmail(email);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setLoading(true);
    const result = await resetPassword(email);
    setLoading(false);

    // Note: we show the same confirmation whether or not an account exists.
    // Saying "no account found" would let anyone test which email addresses
    // are registered, which is an account-enumeration weakness.
    if (result.success) setSent(true);
    else setError(result.error);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {sent ? (
          <View style={styles.centre}>
            <View style={styles.successBadge}>
              <Text style={styles.successMark}>✓</Text>
            </View>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.subtitle}>
              If an account exists for {email.trim()}, a password reset link has
              been sent. The link expires after one hour.
            </Text>
            <Button
              title="Back to sign in"
              onPress={() => navigation.goBack()}
              style={styles.action}
            />
          </View>
        ) : (
          <View>
            <Text style={styles.title}>Reset your password</Text>
            <Text style={styles.subtitle}>
              Enter the email address you registered with and we will send you a
              link to set a new password.
            </Text>

            <View style={styles.form}>
              <Input
                label="Email"
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (error) setError('');
                }}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoComplete="email"
                error={error}
              />

              <Button
                title="Send reset link"
                onPress={handleReset}
                loading={loading}
              />
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => navigation.goBack()}
                style={styles.cancel}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    justifyContent: 'center',
  },
  centre: { alignItems: 'center' },

  successBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  successMark: { fontSize: 30, color: colors.success, fontWeight: '700' },

  title: { ...typography.h1, marginBottom: spacing.sm, textAlign: 'center' },
  subtitle: {
    ...typography.bodyMuted,
    lineHeight: 22,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },

  form: { marginTop: spacing.sm },
  cancel: { marginTop: spacing.sm },
  action: { marginTop: spacing.md, alignSelf: 'stretch' },
});
