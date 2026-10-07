import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Platform, ActivityIndicator, TextInput, ScrollView, KeyboardAvoidingView } from 'react-native';
import { Alert } from '../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import PasswordInput from '../components/PasswordInput';
import { useTheme } from '../theme/ThemeContext';

const MIN_PASSWORD_LENGTH = 8;

export default function AuthScreen() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  // Emails a reset link. The link returns to this site; Supabase then fires PASSWORD_RECOVERY,
  // and App.tsx shows ResetPasswordScreen (see AuthContext `recovering`).
  const handleForgotPassword = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setResetMessage('Enter your email address above, then tap "Forgot password?" again.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo: window.location.origin });
    setLoading(false);
    // Same message whether or not the address has an account, so the form can't be used to
    // discover who is registered.
    setResetMessage(error
      ? `Could not send the reset email: ${error.message}`
      : `If an account exists for ${trimmed}, we've emailed a link to reset your password.`);
  };

  // Sign-up asks for the password twice so a typo can't lock the user out of a new account.
  const signUpPasswordError =
    !isSignUp ? null
    : password && password.length < MIN_PASSWORD_LENGTH ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    : confirmPassword && confirmPassword !== password ? "The passwords don't match."
    : null;

  const handleEmailAuth = async () => {
    if (!email || !password || (isSignUp && (!name || !confirmPassword))) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (signUpPasswordError) {
      Alert.alert('Check your password', signUpPasswordError);
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            // Send the confirmation link back to whichever deployment the user signed up on
            // (live site or localhost). Must be listed in Supabase → Auth → Redirect URLs,
            // otherwise Supabase falls back to the project's Site URL.
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (!data.session) {
          Alert.alert('Success', 'Please check your email for the confirmation link.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      console.error('[Auth] Email auth error:', err);
      Alert.alert('Authentication Error', err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgApp }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.brandWrap}>
            <View style={[styles.logoCircle, { backgroundColor: colors.actionPrimary }]}>
              <MaterialCommunityIcons name="map-marker-radius" size={36} color={colors.onActionPrimary} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>HomeCart</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Your AI grocery companion for navigating American shelves with home in mind.
            </Text>
          </View>

          <View style={styles.form}>
            {isSignUp && (
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Full Name</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault, color: colors.textPrimary }]}
                  placeholder="Jane Doe"
                  placeholderTextColor={colors.textPlaceholder}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Email Address</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault, color: colors.textPrimary }]}
                placeholder="name@example.com"
                placeholderTextColor={colors.textPlaceholder}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Password</Text>
              <PasswordInput
                value={password}
                onChangeText={setPassword}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                accessibilityLabel="Password"
              />
              {isSignUp && (
                <>
                  <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>Confirm password</Text>
                  <PasswordInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    autoComplete="new-password"
                    accessibilityLabel="Confirm password"
                  />
                  <Text style={[styles.resetMessage, { color: signUpPasswordError ? colors.errorText : colors.textSecondary }]}>
                    {signUpPasswordError
                      ?? (confirmPassword && confirmPassword === password ? 'Passwords match.' : `At least ${MIN_PASSWORD_LENGTH} characters.`)}
                  </Text>
                </>
              )}
              {!isSignUp && (
                <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotLink} accessibilityRole="button">
                  <Text style={[styles.forgotText, { color: colors.textAccent }]}>Forgot password?</Text>
                </TouchableOpacity>
              )}
              {!!resetMessage && !isSignUp && (
                <Text style={[styles.resetMessage, { color: colors.textSecondary }]}>{resetMessage}</Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.actionPrimary }]}
              onPress={handleEmailAuth}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color={colors.onActionPrimary} /> : (
                <Text style={[styles.buttonText, { color: colors.onActionPrimary }]}>{isSignUp ? 'Create Account' : 'Sign In'}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.toggleButton} onPress={() => { setIsSignUp(!isSignUp); setConfirmPassword(''); setResetMessage(null); }}>
              <Text style={[styles.toggleText, { color: colors.textAccent }]}>
                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            By continuing, you agree to the{'\n'}
            <Text style={[styles.link, { color: colors.textAccent }]}>Terms of Service</Text> and{' '}
            <Text style={[styles.link, { color: colors.textAccent }]}>Privacy Policy</Text>.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  forgotLink: { alignSelf: 'flex-end', marginTop: 10, paddingVertical: 4 },
  forgotText: { fontSize: 13, fontWeight: '600' },
  resetMessage: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  brandWrap: { alignItems: 'center', marginBottom: 36 },
  logoCircle: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 32, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 16 },
  form: { width: '100%' },
  inputContainer: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: { height: 52, borderRadius: 14, paddingHorizontal: 16, fontSize: 15, borderWidth: 1 },
  button: { height: 54, borderRadius: 14, justifyContent: 'center', alignItems: 'center', width: '100%', marginTop: 6 },
  buttonText: { fontSize: 16, fontWeight: '700', },
  toggleButton: { marginTop: 20, alignItems: 'center' },
  toggleText: { fontSize: 14, fontWeight: '600' },
  footerText: { marginTop: 32, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  link: { fontWeight: '500' },
});
