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
import Logo from '../../components/Logo';
import { login } from '../../services/authService';
import { validateEmail, runValidators } from '../../utils/validators';
import { colors, spacing, typography, radius } from '../../utils/theme';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setSubmitError('');

    // Login validation is deliberately lighter than registration: we only check
    // the fields are present and the email is shaped correctly. Firebase
    // decides whether the credentials are actually right.
    const { isValid, errors: fieldErrors } = runValidators({
      email: validateEmail(email),
      password: password ? null : 'Password is required',
    });

    setErrors(fieldErrors);
    if (!isValid) return;

    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    // On success we do nothing here. onAuthStateChanged in AuthContext fires,
    // RootNavigator swaps the auth stack for the main app, and this screen
    // unmounts on its own.
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
            {/* The logo carries the wordmark, so no app-name heading here. */}
            <Logo size={96} />
            <Text style={styles.subtitle}>
              Sign in to reach your emergency contacts
            </Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoComplete="email"
              error={errors.email}
            />

            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry
              autoComplete="password"
              error={errors.password}
            />

            <TouchableOpacity
              onPress={() => navigation.navigate('ForgotPassword')}
              style={styles.forgot}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {submitError ? (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>{submitError}</Text>
              </View>
            ) : null}

            <Button title="Sign in" onPress={handleLogin} loading={loading} />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.footerLink}>Create one</Text>
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
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },

  header: { alignItems: 'center', marginBottom: spacing.xl },
  subtitle: { ...typography.bodyMuted, textAlign: 'center', marginTop: spacing.md },

  form: { marginBottom: spacing.lg },

  forgot: { alignSelf: 'flex-end', marginBottom: spacing.md },
  forgotText: { ...typography.caption, color: colors.primary, fontWeight: '600' },

  banner: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  bannerText: { ...typography.caption, color: colors.dangerDark },

  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 'auto' },
  footerText: { ...typography.body, color: colors.textMuted },
  footerLink: { ...typography.body, color: colors.primary, fontWeight: '600' },
});
