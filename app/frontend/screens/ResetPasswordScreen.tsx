import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';

// Shown after the user opens a password-reset email link (Supabase PASSWORD_RECOVERY).
// The link already signed them in, so this only needs the new password.
const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordScreen() {
  const { finishRecovery, user } = useAuth();
  const { colors } = useTheme();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const validation =
    next && next.length < MIN_PASSWORD_LENGTH ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    : confirm && confirm !== next ? "The passwords don't match."
    : null;
  const canSave = !!next && !!confirm && !validation && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    setSaving(false);
    if (updateError) setError(updateError.message);
    else setDone(true);
  };

  const input = (value: string, onChange: (v: string) => void, label: string) => (
    <View style={{ marginTop: 16 }}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault, color: colors.textPrimary }]}
        value={value}
        onChangeText={onChange}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgApp }]}>
      <View style={styles.body}>
        <View style={[styles.iconWrap, { backgroundColor: colors.accentSubtle }]}>
          <MaterialCommunityIcons name={done ? 'check-circle' : 'lock-reset'} size={32} color={done ? colors.matchFill : colors.accentIcon} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{done ? 'Password updated' : 'Set a new password'}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          {done ? "You're signed in and can keep using HomeCart." : `For ${user?.email ?? 'your account'}`}
        </Text>

        {done ? (
          <TouchableOpacity onPress={finishRecovery} style={[styles.button, { backgroundColor: colors.actionPrimary }]}>
            <Text style={[styles.buttonText, { color: colors.onActionPrimary }]}>Continue</Text>
          </TouchableOpacity>
        ) : (
          <>
            {input(next, setNext, `New password (at least ${MIN_PASSWORD_LENGTH} characters)`)}
            {input(confirm, setConfirm, 'Confirm new password')}
            {!!(validation || error) && (
              <Text style={[styles.error, { color: colors.errorText }]}>{error || validation}</Text>
            )}
            <TouchableOpacity
              onPress={save}
              disabled={!canSave}
              style={[styles.button, { backgroundColor: colors.actionPrimary, opacity: canSave ? 1 : 0.5 }]}
            >
              {saving
                ? <ActivityIndicator color={colors.onActionPrimary} />
                : <Text style={[styles.buttonText, { color: colors.onActionPrimary }]}>Update password</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', padding: 24, width: '100%', maxWidth: 420, alignSelf: 'center' },
  iconWrap: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: 16 },
  sub: { fontSize: 14, textAlign: 'center', marginTop: 6 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { height: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  error: { fontSize: 13, marginTop: 12, textAlign: 'center' },
  button: { height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  buttonText: { fontSize: 16, fontWeight: '700' },
});
