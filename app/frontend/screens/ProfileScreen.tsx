import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import SettingsScreen from './SettingsScreen';
import CountryPicker from '../components/CountryPicker';
import { countryFlag, countryName, homeCuisinesFor } from '../lib/countries';
import { supabase } from '../lib/supabase';

const CONFIDENCE_LABELS: Record<number, string> = {
  1: 'Beginner', 2: 'Casual', 3: 'Home cook', 4: 'Confident', 5: 'Expert',
};

export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { colors, mode, setMode } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);

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
            <Text style={styles.avatarText}>{fullName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={[styles.name, { color: colors.textPrimary }]}>{fullName}</Text>
          {!!email && <Text style={[styles.email, { color: colors.textSecondary }]}>{email}</Text>}
        </View>

        {/* Cuisine identity card */}
        <View style={[styles.cuisineCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.flagLarge}>{flag}</Text>
          <Text style={[styles.country, { color: colors.textPrimary }]}>{country}</Text>
          {!!profile?.home_region && (
            <Text style={[styles.region, { color: colors.textSecondary }]}>{profile.home_region}</Text>
          )}
          <TouchableOpacity
            onPress={() => setCountryOpen(true)}
            style={[styles.changeButton, { borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="pencil-outline" size={14} color={colors.primary} />
            <Text style={[styles.changeText, { color: colors.primary }]}>Change country</Text>
          </TouchableOpacity>
        </View>

        {/* Profile info section */}
        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>YOUR PROFILE</Text>

        <InfoRow
          icon="silverware-fork-knife"
          label="Cooking Confidence"
          value={profile?.cooking_confidence ? `${profile.cooking_confidence}/5 · ${CONFIDENCE_LABELS[profile.cooking_confidence]}` : 'Not set'}
          colors={colors}
        />
        <InfoRow
          icon="translate"
          label="Preferred Language"
          value={profile?.preferred_language || 'English'}
          colors={colors}
        />
        <InfoRow
          icon="leaf"
          label="Dietary Preferences"
          value={profile?.dietary_preferences?.length ? profile.dietary_preferences.join(', ') : 'None'}
          colors={colors}
        />
        <InfoRow
          icon="food-variant"
          label="Cuisines"
          value={profile?.home_cuisines?.length ? profile.home_cuisines.join(', ') : 'Not set'}
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
  icon, label, value, colors,
}: {
  icon: any; label: string; value: string; colors: any;
}) {
  return (
    <View style={[styles.infoRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.infoIconWrap, { backgroundColor: colors.primarySubtle }]}>
        <MaterialCommunityIcons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{value}</Text>
      </View>
    </View>
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
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  changeButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
  },
  changeText: { fontSize: 13, fontWeight: '600' },
  sheet: { flex: 1, padding: 20, width: '100%', maxWidth: 640, alignSelf: 'center' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 22, fontWeight: '700' },
  sheetSub: { fontSize: 14, marginTop: 6, marginBottom: 18, lineHeight: 20 },
  sheetError: { fontSize: 13, marginBottom: 10, textAlign: 'center' },
  saveButton: { padding: 15, borderRadius: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  container: { flex: 1 },
  content: { padding: 20 },
  headerSection: { alignItems: 'center', marginTop: 8, marginBottom: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700' },
  email: { fontSize: 13, marginTop: 4 },
  cuisineCard: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 24,
  },
  flagLarge: { fontSize: 56 },
  country: { fontSize: 18, fontWeight: '700', marginTop: 10 },
  region: { fontSize: 14, marginTop: 4 },
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
