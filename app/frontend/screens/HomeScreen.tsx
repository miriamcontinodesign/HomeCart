import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { countryFlag, countryName } from '../lib/countries';
import { supabase } from '../lib/supabase';
import { Alert } from '../lib/alert';


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

export default function HomeScreen({ navigation }: any) {
  const { user, profile, signOut } = useAuth();
  const { colors } = useTheme();
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [recentLists, setRecentLists] = useState<RecentList[]>([]);
  const [loading, setLoading] = useState(true);

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
    { id: 'recipe', label: 'New Recipe', icon: 'silverware-fork-knife' as const, color: colors.scoreMid, onPress: () => navigation?.navigate('List') },
    { id: 'stores', label: 'Find Stores', icon: 'store-marker' as const, color: colors.scoreLow, onPress: () => navigation?.navigate('Map', {}) },
  ];

  const scoreColor = (s: number) => s >= 80 ? colors.scoreHigh : s >= 50 ? colors.scoreMid : colors.scoreLow;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Greeting */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { color: colors.textPrimary }]}>Hi, {firstName} <Text style={{ fontSize: 22 }}>{flag}</Text></Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Mapping {cuisineLabel} to your local stores</Text>
          </View>
          <TouchableOpacity onPress={() => navigation?.navigate('Profile')} style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={[styles.avatarText, { color: colors.onPrimary }]}>{firstName.charAt(0).toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        {/* Magic Lens hero CTA */}
        <TouchableOpacity
          onPress={() => navigation?.navigate('MagicLens')}
          style={[styles.heroCard, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <View style={styles.heroLeft}>
            <Text style={[styles.heroEyebrow, { color: colors.onPrimary }]}>MAGIC LENS</Text>
            <Text style={[styles.heroTitle, { color: colors.onPrimary }]}>Scan any product</Text>
            <Text style={[styles.heroSub, { color: colors.onPrimary }]}>Translate it to {cuisineLabel} in seconds</Text>
          </View>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons name="scan-helper" size={56} color={colors.onPrimary} />
          </View>
        </TouchableOpacity>

        {/* More actions (scanning lives in the hero card above, Profile in the tab bar) */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>More actions</Text>
        <View style={styles.actionGrid}>
          {QUICK_ACTIONS.map(action => (
            <TouchableOpacity
              key={action.id}
              onPress={action.onPress}
              style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, { backgroundColor: action.color + '22' }]}>
                <MaterialCommunityIcons name={action.icon} size={26} color={action.color} />
              </View>
              <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent scans */}
        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : recentScans.length > 0 ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent Scans</Text>
              <View style={styles.headerActions}>
                <TouchableOpacity onPress={clearAllScans} accessibilityRole="button" accessibilityLabel="Clear all scans">
                  <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '600' }}>Clear all</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation?.navigate('MagicLens')}>
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>+ New</Text>
                </TouchableOpacity>
              </View>
            </View>
            {recentScans.map(scan => (
              <View key={scan.id} style={[styles.scanCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {scan.image_url ? (
                  <Image source={{ uri: scan.image_url }} style={styles.scanThumb} accessibilityLabel={scan.detected_product} />
                ) : (
                  // Scans saved before thumbnails existed.
                  <View style={[styles.scanThumb, styles.scanThumbEmpty, { backgroundColor: colors.primarySubtle }]}>
                    <MaterialCommunityIcons name="image-outline" size={24} color={colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={[styles.scanProduct, { color: colors.textPrimary }]} numberOfLines={1}>{scan.detected_product}</Text>
                  <Text style={[styles.scanCultural, { color: colors.textSecondary }]} numberOfLines={2}>{scan.cultural_equivalent}</Text>
                </View>
                <View style={[styles.scoreBadge, { backgroundColor: scoreColor(scan.match_score) + '22' }]}>
                  <Text style={[styles.scoreText, { color: scoreColor(scan.match_score) }]}>{scan.match_score}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => deleteScan(scan.id)}
                  style={styles.deleteButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete scan: ${scan.detected_product}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            ))}
          </>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="camera-iris" size={32} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No scans yet</Text>
            <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>Tap Magic Lens to scan your first product</Text>
          </View>
        )}

        {/* Recent recipe lists */}
        {recentLists.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recipe Lists</Text>
              <TouchableOpacity onPress={() => navigation?.navigate('List')}>
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>+ New</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {recentLists.map(list => (
                <TouchableOpacity
                  key={list.id}
                  onPress={() => navigation?.navigate('List', { autoImportDish: list.source_dish || list.title })}
                  style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <MaterialCommunityIcons name="clipboard-list" size={24} color={colors.primary} />
                  <Text style={[styles.listTitle, { color: colors.textPrimary }]} numberOfLines={2}>{list.source_dish || list.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* Cultural identity card */}
        {profile?.home_country && (
          <View style={[styles.identityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.identityFlag]}>{flag}</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={[styles.identityLabel, { color: colors.textTertiary }]}>YOUR CUISINE PROFILE</Text>
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
              <MaterialCommunityIcons name="cog-outline" size={20} color={colors.textTertiary} />
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
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  greeting: { fontSize: 26, fontWeight: '700' },
  subtitle: { fontSize: 14, marginTop: 4 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700' },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 20,
    marginBottom: 28,
    minHeight: 130,
    overflow: 'hidden',
  },
  heroLeft: { flex: 1 },
  heroEyebrow: { opacity: 0.85, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  heroTitle: { fontSize: 22, fontWeight: '800' },
  heroSub: { opacity: 0.92, fontSize: 13, marginTop: 6, lineHeight: 18 },
  heroIcon: { opacity: 0.95 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 14, marginTop: 6 },
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
  actionLabel: { fontSize: 14, fontWeight: '600' },
  scanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  scanProduct: { fontSize: 15, fontWeight: '700' },
  scanCultural: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  scoreBadge: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  scoreText: { fontSize: 14, fontWeight: '800' },
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
  emptyText: { fontSize: 14, fontWeight: '600', marginTop: 10 },
  emptyHint: { fontSize: 12, marginTop: 4, textAlign: 'center' },
  listCard: {
    width: 160,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 100,
    justifyContent: 'space-between',
  },
  listTitle: { fontSize: 14, fontWeight: '600', marginTop: 10 },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 16,
  },
  identityFlag: { fontSize: 32 },
  identityLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  identityValue: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  identityDiet: { fontSize: 12, marginTop: 2 },
});
