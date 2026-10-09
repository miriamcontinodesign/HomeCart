import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Image, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { residenceInText } from '../lib/residence';
import { typo } from '../theme/typography';
import { useTheme } from '../theme/ThemeContext';
import { countryFlag, countryName } from '../lib/countries';
import { supabase } from '../lib/supabase';
import { Alert } from '../lib/alert';
import BrandLogo from '../components/BrandLogo';
import ServerWakeBanner from '../components/ServerWakeBanner';


interface RecentScan {
  id: string;
  detected_product: string;
  cultural_equivalent: string;
  match_score: number;
  image_url: string | null;
  created_at: string;
}

interface RecentList {
  id: string;
  title: string;
  source_dish: string;
  created_at: string;
}

const EXAMPLE_PRODUCTS = ['mascarpone', 'gochujang', 'queso fresco', 'paneer'];

export default function HomeScreen({ navigation }: any) {
  const { user, profile, signOut } = useAuth();
  const { colors, tones, matchTone } = useTheme();
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [recentLists, setRecentLists] = useState<RecentList[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  // The search runs on the Magic Lens screen, which shows progress and the result.
  const search = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setQuery('');
    navigation?.navigate('MagicLens', { searchQuery: trimmed, requestedAt: Date.now() });
  };

  const loadRecent = useCallback(async () => {
    if (!user) return;
    try {
      const [scansRes, listsRes] = await Promise.all([
        supabase.from('scans').select('id, detected_product, cultural_equivalent, match_score, image_url, created_at')
          .eq('user_id', user.id).order('created_at', { ascending: false }).limit(3),
        supabase.from('shopping_lists').select('id, title, source_dish, created_at')
          .eq('user_id', user.id).order('created_at', { ascending: false }).limit(3),
      ]);
      if (scansRes.data) setRecentScans(scansRes.data);
      if (listsRes.data) setRecentLists(listsRes.data);
    } catch (e) {
      console.error('Home data fetch failed:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Tabs stay mounted, so reload whenever Home comes back into view — otherwise a scan or
  // recipe made a moment ago wouldn't show up until a full page reload.
  useEffect(() => {
    loadRecent();
    return navigation?.addListener?.('focus', loadRecent);
  }, [loadRecent, navigation]);

  // Deletes go through the anon client: the users_own_scans RLS policy limits them to the
  // signed-in user's rows.
  const deleteScan = async (id: string) => {
    const previous = recentScans;
    setRecentScans(scans => scans.filter(s => s.id !== id));
    const { error } = await supabase.from('scans').delete().eq('id', id);
    if (error) {
      setRecentScans(previous);
      Alert.alert('Could not delete', error.message);
    } else {
      loadRecent();  // pull in the next-most-recent scan to keep three showing
    }
  };

  const clearAllScans = () => {
    if (!user) return;
    Alert.alert(
      'Clear all scans?',
      'This permanently deletes your whole scan history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('scans').delete().eq('user_id', user.id);
            if (error) Alert.alert('Could not clear scans', error.message);
            else setRecentScans([]);
          },
        },
      ],
    );
  };

  const firstName = (user?.user_metadata?.full_name || profile?.full_name || 'there').split(' ')[0];
  const flag = countryFlag(profile?.home_country);
  const cuisineLabel = profile?.home_region
    ? `${profile.home_region} cuisine`
    : profile?.home_country
    ? `${countryName(profile.home_country)} cuisine`
    : 'your cuisine';

  const QUICK_ACTIONS = [
    { id: 'recipe', label: 'New recipe', icon: 'silverware-fork-knife' as const, color: colors.accentIcon, onPress: () => navigation?.navigate('List') },
    { id: 'stores', label: 'Find stores', icon: 'store-marker' as const, color: colors.accentIcon, onPress: () => navigation?.navigate('Map', {}) },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgApp }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* App bar: logo + profile shortcut */}
        <View style={styles.appBar}>
          <BrandLogo height={34} />
          <TouchableOpacity onPress={() => navigation?.navigate('Profile')} style={[styles.avatar, { backgroundColor: colors.actionPrimary }]} accessibilityLabel="Open profile">
            <Text style={[styles.avatarText, { color: colors.onActionPrimary }]}>{firstName.charAt(0).toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        {/* Greeting */}
        <View style={styles.header}>
          <Text style={[styles.greeting, { color: colors.textPrimary }]}>Hi, {firstName} <Text style={{ fontSize: 22 }}>{flag}</Text></Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Mapping {cuisineLabel} to your local stores</Text>
        </View>

        <ServerWakeBanner />

        {/* Scan on one side, search on the other */}
        <View style={styles.entryRow}>
          <TouchableOpacity
            onPress={() => navigation?.navigate('MagicLens')}
            style={[styles.entryCard, { backgroundColor: colors.actionPrimary }]}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Scan a product with Magic Lens"
          >
            <MaterialCommunityIcons name="scan-helper" size={30} color={colors.onActionPrimary} />
            <Text style={[styles.entryTitle, { color: colors.onActionPrimary }]}>Scan</Text>
            <Text style={[styles.entrySub, { color: colors.onActionPrimary }]}>
              Photo of a product in {residenceInText(profile?.residence_country)} → {cuisineLabel}
            </Text>
          </TouchableOpacity>

          <View style={[styles.entryCard, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault, borderWidth: 1 }]}>
            <MaterialCommunityIcons name="magnify" size={30} color={colors.accentIcon} />
            <Text style={[styles.entryTitle, { color: colors.textPrimary }]}>Search</Text>
            <Text style={[styles.entrySub, { color: colors.textSecondary }]}>A product from home → its version in {residenceInText(profile?.residence_country)}</Text>
            <View style={styles.searchRow}>
              <TextInput
                style={[styles.searchInput, { backgroundColor: colors.bgApp, borderColor: colors.borderDefault, color: colors.textPrimary }]}
                placeholder="e.g. paneer"
                placeholderTextColor={colors.textPlaceholder}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => search(query)}
                returnKeyType="search"
                accessibilityLabel="Search a product from home"
              />
              <TouchableOpacity
                onPress={() => search(query)}
                disabled={!query.trim()}
                style={[styles.searchGo, { backgroundColor: colors.actionPrimary, opacity: query.trim() ? 1 : 0.5 }]}
                accessibilityLabel="Find the local version"
              >
                <MaterialCommunityIcons name="arrow-right" size={18} color={colors.onActionPrimary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.exampleRow}>
          <Text style={[styles.exampleLabel, { color: colors.textSecondary }]}>Try:</Text>
          {EXAMPLE_PRODUCTS.map(p => (
            <TouchableOpacity
              key={p}
              onPress={() => search(p)}
              style={[styles.exampleChip, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}
            >
              <Text style={[styles.exampleText, { color: colors.textPrimary }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* More actions (scanning lives in the hero card above, Profile in the tab bar) */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>More actions</Text>
        <View style={styles.actionGrid}>
          {QUICK_ACTIONS.map(action => (
            <TouchableOpacity
              key={action.id}
              onPress={action.onPress}
              style={[styles.actionCard, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, { backgroundColor: colors.accentSubtle }]}>
                <MaterialCommunityIcons name={action.icon} size={26} color={action.color} />
              </View>
              <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent scans */}
        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <ActivityIndicator color={colors.accentIcon} />
          </View>
        ) : recentScans.length > 0 ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent searches</Text>
              <View style={styles.headerActions}>
                <TouchableOpacity onPress={clearAllScans} accessibilityRole="button" accessibilityLabel="Clear all scans">
                  <Text style={{ ...typo.label, color: colors.textSecondary }}>Clear all</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation?.navigate('MagicLens')}>
                  <Text style={{ ...typo.label, color: colors.textAccent }}>+ New</Text>
                </TouchableOpacity>
              </View>
            </View>
            {recentScans.map(scan => (
              <View key={scan.id} style={[styles.scanCard, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}>
                {scan.image_url ? (
                  <Image source={{ uri: scan.image_url }} style={styles.scanThumb} accessibilityLabel={scan.detected_product} />
                ) : (
                  // Scans saved before thumbnails existed.
                  <View style={[styles.scanThumb, styles.scanThumbEmpty, { backgroundColor: colors.accentSubtle }]}>
                    <MaterialCommunityIcons name="image-outline" size={24} color={colors.accentIcon} />
                  </View>
                )}
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={[styles.scanProduct, { color: colors.textPrimary }]} numberOfLines={1}>{scan.detected_product}</Text>
                  <Text style={[styles.scanCultural, { color: colors.textSecondary }]} numberOfLines={2}>{scan.cultural_equivalent}</Text>
                </View>
                <View style={[styles.scoreBadge, { backgroundColor: matchTone(scan.match_score).bg }]}>
                  <Text style={[styles.scoreText, { color: matchTone(scan.match_score).text }]}>{scan.match_score}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => deleteScan(scan.id)}
                  style={styles.deleteButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete scan: ${scan.detected_product}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}
          </>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}>
            <MaterialCommunityIcons name="camera-iris" size={32} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No scans yet</Text>
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>Tap Magic Lens to scan your first product</Text>
          </View>
        )}

        {/* Recent recipe lists */}
        {recentLists.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recipe lists</Text>
              <TouchableOpacity onPress={() => navigation?.navigate('List')}>
                <Text style={{ ...typo.label, color: colors.textAccent }}>+ New</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {recentLists.map(list => (
                <TouchableOpacity
                  key={list.id}
                  onPress={() => navigation?.navigate('List', { openListId: list.id, title: list.source_dish || list.title, requestedAt: Date.now() })}
                  style={[styles.listCard, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}
                >
                  <MaterialCommunityIcons name="clipboard-list" size={24} color={colors.accentIcon} />
                  <Text style={[styles.listTitle, { color: colors.textPrimary }]} numberOfLines={2}>{list.source_dish || list.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* Cultural identity card */}
        {profile?.home_country && (
          <View style={[styles.identityCard, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}>
            <Text style={[styles.identityFlag]}>{flag}</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={[styles.identityLabel, { color: colors.textSecondary }]}>Your cuisine profile</Text>
              <Text style={[styles.identityValue, { color: colors.textPrimary }]} numberOfLines={1}>
                {countryName(profile.home_country)}
                {profile.home_region ? ` · ${profile.home_region}` : ''}
              </Text>
              {!!profile.dietary_preferences?.length && (
                <Text style={[styles.identityDiet, { color: colors.textSecondary }]} numberOfLines={1}>
                  {profile.dietary_preferences.join(' · ')}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => navigation?.navigate('Profile')}>
              <MaterialCommunityIcons name="cog-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  appBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  header: { marginBottom: 24 },
  greeting: { ...typo.display },
  subtitle: { ...typo.body, marginTop: 4 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { ...typo.heading },
  entryRow: { gap: 12, marginTop: 4 },   // Scan above Search, each full width
  entryCard: { borderRadius: 18, padding: 16, gap: 4 },
  entryTitle: { ...typo.heading, marginTop: 6 },
  entrySub: { ...typo.caption },
  searchRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  searchInput: { ...typo.body, flex: 1, minWidth: 0, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  searchGo: { width: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  exampleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 8 },
  exampleLabel: { ...typo.caption, marginRight: 2 },
  exampleChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  exampleText: { ...typo.label },
  sectionTitle: { ...typo.heading, marginBottom: 14, marginTop: 6 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 10 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  actionCard: {
    // Two per row inside the app column (window width would overflow the 640px frame).
    flexBasis: '40%',
    flexGrow: 1,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  iconWrap: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  actionLabel: { ...typo.label },
  scanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  scanProduct: { ...typo.heading },
  scanCultural: { ...typo.caption, marginTop: 4 },
  scoreBadge: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  scoreText: { ...typo.pill },
  scanThumb: { width: 56, height: 56, borderRadius: 10, marginRight: 12 },
  scanThumbEmpty: { justifyContent: 'center', alignItems: 'center' },
  deleteButton: { marginLeft: 8, padding: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  emptyCard: {
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: { ...typo.bodyStrong, marginTop: 10 },
  emptyHint: { ...typo.caption, marginTop: 4, textAlign: 'center' },
  listCard: {
    width: 160,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 100,
    justifyContent: 'space-between',
  },
  listTitle: { ...typo.bodyStrong, marginTop: 10 },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 16,
  },
  identityFlag: { fontSize: 32 },
  identityLabel: { ...typo.caption },
  identityValue: { ...typo.bodyStrong, marginTop: 4 },
  identityDiet: { ...typo.caption, marginTop: 2 },
});
