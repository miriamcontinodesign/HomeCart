import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Platform, ActivityIndicator, TextInput, ScrollView, KeyboardAvoidingView } from 'react-native';
import { Alert } from '../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/ThemeContext';

export default function AuthScreen() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const handleEmailAuth = async () => {
    if (!email || !password || (isSignUp && !name)) {
      Alert.alert('Error', 'Please fill in all fields');
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.brandWrap}>
            <View style={[styles.logoCircle, { backgroundColor: colors.primary }]}>
              <MaterialCommunityIcons name="map-marker-radius" size={36} color="#fff" />
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
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                  placeholder="Jane Doe"
                  placeholderTextColor={colors.textTertiary}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Email Address</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                placeholder="name@example.com"
                placeholderTextColor={colors.textTertiary}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Password</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                placeholder="••••••••"
                placeholderTextColor={colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={handleEmailAuth}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.buttonText}>{isSignUp ? 'Create Account' : 'Sign In'}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.toggleButton} onPress={() => setIsSignUp(!isSignUp)}>
              <Text style={[styles.toggleText, { color: colors.primary }]}>
                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.footerText, { color: colors.textTertiary }]}>
            By continuing, you agree to the{'\n'}
            <Text style={[styles.link, { color: colors.primary }]}>Terms of Service</Text> and{' '}
            <Text style={[styles.link, { color: colors.primary }]}>Privacy Policy</Text>.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  buttonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  toggleButton: { marginTop: 20, alignItems: 'center' },
  toggleText: { fontSize: 14, fontWeight: '600' },
  footerText: { marginTop: 32, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  link: { fontWeight: '500' },
});
