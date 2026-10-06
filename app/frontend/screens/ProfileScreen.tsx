import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Modal, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import SettingsScreen from './SettingsScreen';
import CountryPicker from '../components/CountryPicker';
import { countryFlag, countryName, homeCuisinesFor } from '../lib/countries';
import { supabase } from '../lib/supabase';

export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { colors, mode, setMode } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const fullName = user?.user_metadata?.full_name || profile?.full_name || 'Traveler';
  const email = user?.email || '';
  const flag = countryFlag(profile?.home_country);
  const country = countryName(profile?.home_country) || 'Not set';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar header */}
        <View style={styles.headerSection}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={[styles.avatarText, { color: colors.onPrimary }]}>{fullName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={[styles.name, { color: colors.textPrimary }]}>{fullName}</Text>
          {!!email && <Text style={[styles.email, { color: colors.textSecondary }]}>{email}</Text>}
        </View>

        {/* Profile info section */}
        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>YOUR PROFILE</Text>

        <InfoRow
          icon="earth"
          label="Nationality"
          value={profile?.home_country
            ? `${flag} ${country}${profile.home_region ? ` · ${profile.home_region}` : ''}`
            : 'Not set'}
          onPress={() => setCountryOpen(true)}
          accessibilityLabel="Change your nationality"
          colors={colors}
        />
        <InfoRow
          icon="leaf"
          label="Dietary Restrictions"
          value={profile?.dietary_preferences?.length ? profile.dietary_preferences.join(', ') : 'None'}
          colors={colors}
        />

        {/* Appearance section */}
        <Text style={[styles.sectionLabel, { color: colors.textTertiary, marginTop: 28 }]}>APPEARANCE</Text>
        <View style={[styles.themeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {(['dark', 'light', 'system'] as const).map((option, idx) => (
            <TouchableOpacity
              key={option}
              onPress={() => setMode(option)}
              style={[
                styles.themeOption,
                idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
              ]}
            >
              <MaterialCommunityIcons
                name={option === 'dark' ? 'weather-night' : option === 'light' ? 'weather-sunny' : 'theme-light-dark'}
                size={20}
                color={mode === option ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.themeLabel, { color: mode === option ? colors.primary : colors.textPrimary }]}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </Text>
              {mode === option && (
                <MaterialCommunityIcons name="check" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Settings (API keys / BYOK) */}
        <Text style={[styles.sectionLabel, { color: colors.textTertiary, marginTop: 28 }]}>SETTINGS</Text>
        <InfoRow
          icon="translate"
          label="Preferred Language"
          value={profile?.preferred_language || 'English'}
          colors={colors}
        />
        <TouchableOpacity
          onPress={() => setSettingsOpen(true)}
          style={[styles.settingsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={[styles.infoIconWrap, { backgroundColor: colors.primarySubtle }]}>
            <MaterialCommunityIcons name="key-variant" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoValue, { color: colors.textPrimary, marginTop: 0 }]}>API Keys (BYOK)</Text>
            <Text style={[styles.infoLabel, { color: colors.textTertiary, fontWeight: '400', letterSpacing: 0 }]}>
              Use your own AI key for unlimited scans and recipes
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setPasswordOpen(true)}
          style={[styles.settingsRow, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 10 }]}
        >
          <View style={[styles.infoIconWrap, { backgroundColor: colors.primarySubtle }]}>
            <MaterialCommunityIcons name="lock-reset" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoValue, { color: colors.textPrimary, marginTop: 0 }]}>Change password</Text>
            <Text style={[styles.infoLabel, { color: colors.textTertiary, fontWeight: '400', letterSpacing: 0 }]}>
              Update the password you sign in with
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
        </TouchableOpacity>

        {/* Sign out */}
        <TouchableOpacity
          onPress={signOut}
          style={[styles.signOutButton, { backgroundColor: colors.error + '15', borderColor: colors.error + '40' }]}
        >
          <MaterialCommunityIcons name="logout" size={20} color={colors.error} />
          <Text style={[styles.signOutText, { color: colors.error }]}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      <SettingsScreen visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ChangePasswordSheet
        visible={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        email={user?.email || ''}
      />
      <ChangeCountrySheet
        visible={countryOpen}
        onClose={() => setCountryOpen(false)}
        userId={user?.id}
        initialCountry={profile?.home_country || ''}
        initialRegion={profile?.home_region || ''}
        onSaved={refreshProfile}
      />
    </SafeAreaView>
  );
}

function InfoRow({
  icon, label, value, colors, onPress, accessibilityLabel,
}: {
  icon: any; label: string; value: string; colors: any; onPress?: () => void; accessibilityLabel?: string;
}) {
  const content = (
    <>
      <View style={[styles.infoIconWrap, { backgroundColor: colors.primarySubtle }]}>
        <MaterialCommunityIcons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{value}</Text>
      </View>
      {onPress && <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />}
    </>
  );
  const rowStyle = [styles.infoRow, { backgroundColor: colors.surface, borderColor: colors.border }];
  return onPress ? (
    <TouchableOpacity onPress={onPress} style={rowStyle} accessibilityRole="button" accessibilityLabel={accessibilityLabel || label}>
      {content}
    </TouchableOpacity>
  ) : (
    <View style={rowStyle}>{content}</View>
  );
}

// Supabase lets any signed-in session set a new password, so confirm the current one
// first: a forgotten, still-signed-in browser shouldn't be enough to take over the account.
const MIN_PASSWORD_LENGTH = 8;

function ChangePasswordSheet({
  visible, onClose, email,
}: {
  visible: boolean;
  onClose: () => void;
  email: string;
}) {
  const { colors } = useTheme();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setCurrent(''); setNext(''); setConfirm('');
      setError(null); setDone(false);
    }
  }, [visible]);

  const validationError =
    next && next.length < MIN_PASSWORD_LENGTH ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    : next && next === current ? 'The new password must be different from the current one.'
    : confirm && confirm !== next ? "The new passwords don't match."
    : null;
  const canSave = !!current && !!next && !!confirm && !validationError && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password: current });
      if (authError) {
        setError('Your current password is incorrect.');
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) throw updateError;
      setDone(true);
    } catch (e: any) {
      setError(e?.message || 'Could not change your password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, value: string, onChange: (v: string) => void, autoComplete: 'current-password' | 'new-password') => (
    <View style={{ marginTop: 14 }}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[styles.passwordInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
        value={value}
        onChangeText={onChange}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={autoComplete}
        placeholderTextColor={colors.textTertiary}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="formSheet">
      <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Change password</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {done ? (
          <View style={styles.doneWrap}>
            <MaterialCommunityIcons name="check-circle" size={48} color={colors.scoreHigh} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary, marginTop: 12, fontSize: 18 }]}>Password updated</Text>
            <Text style={[styles.sheetSub, { color: colors.textSecondary, textAlign: 'center' }]}>
              Use your new password the next time you sign in.
            </Text>
            <TouchableOpacity onPress={onClose} style={[styles.saveButton, { backgroundColor: colors.primary, alignSelf: 'stretch' }]}>
              <Text style={[styles.saveText, { color: colors.onPrimary }]}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={[styles.sheetSub, { color: colors.textSecondary }]}>
              Signed in as {email}
            </Text>
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              {field('Current password', current, setCurrent, 'current-password')}
              {field(`New password (at least ${MIN_PASSWORD_LENGTH} characters)`, next, setNext, 'new-password')}
              {field('Confirm new password', confirm, setConfirm, 'new-password')}
              {!!(validationError || error) && (
                <Text style={[styles.sheetError, { color: colors.error, marginTop: 14 }]}>{error || validationError}</Text>
              )}
            </ScrollView>
            <TouchableOpacity
              onPress={save}
              disabled={!canSave}
              style={[styles.saveButton, { backgroundColor: colors.primary, opacity: canSave ? 1 : 0.5 }]}
            >
              {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.saveText, { color: colors.onPrimary }]}>Update password</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </Modal>
  );
}

function ChangeCountrySheet({
  visible, onClose, userId, initialCountry, initialRegion, onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  userId?: string;
  initialCountry: string;
  initialRegion: string;
  onSaved: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const [countryId, setCountryId] = useState(initialCountry);
  const [region, setRegion] = useState(initialRegion);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the saved values each time the sheet opens.
  React.useEffect(() => {
    if (visible) {
      setCountryId(initialCountry);
      setRegion(initialRegion);
      setError(null);
    }
  }, [visible, initialCountry, initialRegion]);

  const unchanged = countryId === initialCountry && region === initialRegion;

  const save = async () => {
    if (!userId || !countryId) return;
    setSaving(true);
    setError(null);
    try {
      const { error: dbError } = await supabase.from('profiles').update({
        home_country: countryId,
        home_region: region || null,
        home_cuisines: homeCuisinesFor(countryId, region),
        updated_at: new Date().toISOString(),
      }).eq('id', userId);
      if (dbError) throw dbError;
      await onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="formSheet">
      <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Home country</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.sheetSub, { color: colors.textSecondary }]}>
          Scans, recipes and store searches are tailored to this cuisine.
        </Text>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <CountryPicker
            countryId={countryId}
            region={region}
            onChangeCountry={setCountryId}
            onChangeRegion={setRegion}
          />
        </ScrollView>
        {!!error && <Text style={[styles.sheetError, { color: colors.error }]}>{error}</Text>}
        <TouchableOpacity
          onPress={save}
          disabled={saving || unchanged || !countryId}
          style={[styles.saveButton, { backgroundColor: colors.primary, opacity: saving || unchanged || !countryId ? 0.5 : 1 }]}
        >
          {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.saveText, { color: colors.onPrimary }]}>Save</Text>}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, padding: 20, width: '100%', maxWidth: 640, alignSelf: 'center' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 22, fontWeight: '700' },
  sheetSub: { fontSize: 14, marginTop: 6, marginBottom: 18, lineHeight: 20 },
  sheetError: { fontSize: 13, marginBottom: 10, textAlign: 'center' },
  saveButton: { padding: 15, borderRadius: 14, alignItems: 'center' },
  saveText: { fontWeight: '700', fontSize: 15 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  passwordInput: { height: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  container: { flex: 1 },
  content: { padding: 20 },
  headerSection: { alignItems: 'center', marginTop: 8, marginBottom: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { fontSize: 32, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700' },
  email: { fontSize: 13, marginTop: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  infoIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  infoLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  infoValue: { fontSize: 14, fontWeight: '500', marginTop: 2 },
  themeCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  themeLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 24,
    gap: 8,
  },
  signOutText: { fontSize: 15, fontWeight: '700' },
});
