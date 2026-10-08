import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme, ThemePreference } from '../theme/ThemeContext';
import SettingsScreen from './SettingsScreen';
import CountryPicker from '../components/CountryPicker';
import { countryFlag, countryName, homeCuisinesFor } from '../lib/countries';
import { supabase } from '../lib/supabase';
import PasswordInput from '../components/PasswordInput';
import Captcha, { CaptchaHandle } from '../components/Captcha';
import AreaSearch from '../components/AreaSearch';
import { Area } from '../lib/area';

export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { colors, preference, setPreference } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);
  const isDemo = !!user?.is_anonymous;

  const fullName = user?.user_metadata?.full_name || profile?.full_name || 'Traveler';
  const email = user?.email || '';
  const flag = countryFlag(profile?.home_country);
  const country = countryName(profile?.home_country) || 'Not set';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgApp }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar header */}
        <View style={styles.headerSection}>
          <View style={[styles.avatar, { backgroundColor: colors.actionPrimary }]}>
            <Text style={[styles.avatarText, { color: colors.onActionPrimary }]}>{fullName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={[styles.name, { color: colors.textPrimary }]}>{fullName}</Text>
          {!!email && <Text style={[styles.email, { color: colors.textSecondary }]}>{email}</Text>}
        </View>

        {isDemo && (
          <View style={[styles.demoBanner, { backgroundColor: colors.highlightBg, borderColor: colors.borderDefault }]}>
            <Text style={[styles.demoBannerTitle, { color: colors.highlightText }]}>You're using a demo account</Text>
            <Text style={[styles.demoBannerText, { color: colors.highlightText }]}>
              Explore freely — this profile is temporary. Demos last one hour: after that you're signed out and the demo's history is deleted. You can start a new one anytime.
            </Text>
          </View>
        )}

        {/* Profile info section */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>YOUR PROFILE</Text>

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
          icon="map-marker-outline"
          label="Your Area"
          value={profile?.home_city || 'Not set — tap to add'}
          onPress={() => setAreaOpen(true)}
          accessibilityLabel="Change your area"
          colors={colors}
        />
        <InfoRow
          icon="leaf"
          label="Dietary Restrictions"
          value={profile?.dietary_preferences?.length ? profile.dietary_preferences.join(', ') : 'None'}
          colors={colors}
        />

        {/* Settings (API keys / BYOK) */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 28 }]}>SETTINGS</Text>
        <InfoRow
          icon="translate"
          label="Preferred Language"
          value={profile?.preferred_language || 'English'}
          colors={colors}
        />
        <View style={[styles.settingsRow, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault, marginBottom: 10, flexWrap: 'wrap' }]}>
          <View style={[styles.infoIconWrap, { backgroundColor: colors.accentSubtle }]}>
            <MaterialCommunityIcons name="theme-light-dark" size={18} color={colors.accentIcon} />
          </View>
          <Text style={[styles.infoValue, { color: colors.textPrimary, marginTop: 0, flex: 1 }]}>Appearance</Text>
          <View style={[styles.segment, { backgroundColor: colors.bgMuted }]} accessibilityRole="radiogroup">
            {APPEARANCE_OPTIONS.map(o => {
              const selected = preference === o.value;
              return (
                <TouchableOpacity
                  key={o.value}
                  onPress={() => setPreference(o.value)}
                  style={[styles.segmentItem, selected && { backgroundColor: colors.actionPrimary }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.segmentText, { color: selected ? colors.onActionPrimary : colors.textPrimary }]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setSettingsOpen(true)}
          style={[styles.settingsRow, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}
        >
          <View style={[styles.infoIconWrap, { backgroundColor: colors.accentSubtle }]}>
            <MaterialCommunityIcons name="key-variant" size={18} color={colors.accentIcon} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoValue, { color: colors.textPrimary, marginTop: 0 }]}>API Keys (BYOK)</Text>
            <Text style={[styles.infoLabel, { color: colors.textSecondary, fontWeight: '400', letterSpacing: 0 }]}>
              Use your own AI key for unlimited scans and recipes
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Demo (anonymous) accounts have no password to change. */}
        {!isDemo && (
          <TouchableOpacity
            onPress={() => setPasswordOpen(true)}
            style={[styles.settingsRow, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault, marginTop: 10 }]}
          >
            <View style={[styles.infoIconWrap, { backgroundColor: colors.accentSubtle }]}>
              <MaterialCommunityIcons name="lock-reset" size={18} color={colors.accentIcon} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoValue, { color: colors.textPrimary, marginTop: 0 }]}>Change password</Text>
              <Text style={[styles.infoLabel, { color: colors.textSecondary, fontWeight: '400', letterSpacing: 0 }]}>
                Update the password you sign in with
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        {/* Sign out */}
        <TouchableOpacity
          onPress={signOut}
          style={[styles.signOutButton, { backgroundColor: colors.errorBg, borderColor: colors.borderDefault }]}
        >
          <MaterialCommunityIcons name="logout" size={20} color={colors.errorText} />
          <Text style={[styles.signOutText, { color: colors.errorText }]}>{isDemo ? 'End demo' : 'Sign Out'}</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      <SettingsScreen visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AreaSheet
        visible={areaOpen}
        onClose={() => setAreaOpen(false)}
        userId={user?.id}
        current={profile?.home_city || null}
        onSaved={refreshProfile}
      />
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
      <View style={[styles.infoIconWrap, { backgroundColor: colors.accentSubtle }]}>
        <MaterialCommunityIcons name={icon} size={18} color={colors.accentIcon} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{value}</Text>
      </View>
      {onPress && <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />}
    </>
  );
  const rowStyle = [styles.infoRow, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }];
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
const APPEARANCE_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

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
  const captcha = useRef<CaptchaHandle>(null);

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
      // Re-checking the current password is a sign-in, so it needs a CAPTCHA token too.
      const captchaToken = await captcha.current?.getToken();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password: current, options: { captchaToken } });
      if (authError) {
        setError(/captcha/i.test(authError.message) ? 'The security check failed. Please try again.' : 'Your current password is incorrect.');
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
      <PasswordInput value={value} onChangeText={onChange} autoComplete={autoComplete} placeholder="" accessibilityLabel={label} />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="formSheet">
      <View style={[styles.sheet, { backgroundColor: colors.bgApp }]}>
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Change password</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {done ? (
          <View style={styles.doneWrap}>
            <MaterialCommunityIcons name="check-circle" size={48} color={colors.matchFill} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary, marginTop: 12, fontSize: 18 }]}>Password updated</Text>
            <Text style={[styles.sheetSub, { color: colors.textSecondary, textAlign: 'center' }]}>
              Use your new password the next time you sign in.
            </Text>
            <TouchableOpacity onPress={onClose} style={[styles.saveButton, { backgroundColor: colors.actionPrimary, alignSelf: 'stretch' }]}>
              <Text style={[styles.saveText, { color: colors.onActionPrimary }]}>Done</Text>
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
                <Text style={[styles.sheetError, { color: colors.errorText, marginTop: 14 }]}>{error || validationError}</Text>
              )}
              <Captcha ref={captcha} />
            </ScrollView>
            <TouchableOpacity
              onPress={save}
              disabled={!canSave}
              style={[styles.saveButton, { backgroundColor: colors.actionPrimary, opacity: canSave ? 1 : 0.5 }]}
            >
              {saving ? <ActivityIndicator color={colors.onActionPrimary} /> : <Text style={[styles.saveText, { color: colors.onActionPrimary }]}>Update password</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </Modal>
  );
}

// "Your area": the city / ZIP the map starts from when location isn't available. Saved to
// profiles.home_city / home_lat / home_lng (temporary map areas never touch these).
function AreaSheet({
  visible, onClose, userId, current, onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  userId?: string;
  current: string | null;
  onSaved: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => { if (visible) setError(null); }, [visible]);

  const save = async (area: Area | null) => {
    if (!userId) return;
    setSaving(true);
    setError(null);
    const { error: dbError } = await supabase.from('profiles').update({
      home_city: area ? (area.current ? 'Current location' : area.label) : null,
      home_lat: area?.lat ?? null,
      home_lng: area?.lon ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', userId);
    setSaving(false);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    await onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="formSheet">
      <View style={[styles.sheet, { backgroundColor: colors.bgApp }]}>
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Your area</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.sheetSub, { color: colors.textSecondary }]}>
          Where you usually shop. The map starts here when your current location isn't available.
          {current ? `\nNow: ${current}` : ''}
        </Text>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          <AreaSearch onPick={save} />
          {saving && <ActivityIndicator color={colors.accentIcon} style={{ marginTop: 16 }} />}
          {!!error && <Text style={[styles.sheetError, { color: colors.errorText, marginTop: 12 }]}>{error}</Text>}
          {!!current && !saving && (
            <TouchableOpacity onPress={() => save(null)} style={{ marginTop: 20, alignSelf: 'flex-start' }}>
              <Text style={{ color: colors.textAccent, fontWeight: '700' }}>Remove my area</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
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
      <View style={[styles.sheet, { backgroundColor: colors.bgApp }]}>
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
        {!!error && <Text style={[styles.sheetError, { color: colors.errorText }]}>{error}</Text>}
        <TouchableOpacity
          onPress={save}
          disabled={saving || unchanged || !countryId}
          style={[styles.saveButton, { backgroundColor: colors.actionPrimary, opacity: saving || unchanged || !countryId ? 0.5 : 1 }]}
        >
          {saving ? <ActivityIndicator color={colors.onActionPrimary} /> : <Text style={[styles.saveText, { color: colors.onActionPrimary }]}>Save</Text>}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 2 },
  segmentItem: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  segmentText: { fontSize: 13, fontWeight: '600' },
  demoBanner: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  demoBannerTitle: { fontSize: 15, fontWeight: '800' },
  demoBannerText: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  sheet: { flex: 1, padding: 20, width: '100%', maxWidth: 640, alignSelf: 'center' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 22, fontWeight: '700' },
  sheetSub: { fontSize: 14, marginTop: 6, marginBottom: 18, lineHeight: 20 },
  sheetError: { fontSize: 13, marginBottom: 10, textAlign: 'center' },
  saveButton: { padding: 15, borderRadius: 14, alignItems: 'center' },
  saveText: { fontWeight: '700', fontSize: 15 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
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
