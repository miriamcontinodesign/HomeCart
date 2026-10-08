import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../lib/supabase';
import { Alert } from '../lib/alert';
import SaveButton from '../components/SaveButton';

type Source = 'scan' | 'search' | 'photo' | 'voice';

type HistoryItem = {
  id: string;
  source: Source;
  detected_product: string;
  cultural_equivalent: string | null;
  match_score: number | null;
  image_url: string | null;
  saved: boolean;
  created_at: string;
};

const SOURCE_META: Record<Source, { label: string; icon: any }> = {
  scan: { label: 'Scan', icon: 'camera-outline' },
  photo: { label: 'Photo', icon: 'image-outline' },
  search: { label: 'Search', icon: 'magnify' },
  voice: { label: 'Voice', icon: 'microphone-outline' },
};

// Group label relative to today: Today, Yesterday, This week (last 7 days), Earlier.
function groupFor(iso: string): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((day(new Date()) - day(new Date(iso))) / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This week';
  return 'Earlier';
}
const GROUP_ORDER = ['Today', 'Yesterday', 'This week', 'Earlier'];

export default function HistoryScreen({ navigation }: { navigation?: any }) {
  const { user } = useAuth();
  const { colors, tones, matchTone } = useTheme();
  const [filter, setFilter] = useState<'all' | 'saved'>('all');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    let q = supabase
      .from('scans')
      .select('id, source, detected_product, cultural_equivalent, match_score, image_url, saved, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (filter === 'saved') q = q.eq('saved', true);
    const { data, error } = await q;
    setFailed(!!error);
    if (error) console.error('History load failed:', error);
    if (data) setItems(data as HistoryItem[]);
    setLoading(false);
  }, [user, filter]);

  // Reload when the tab regains focus so new scans/searches and bookmark changes show up.
  useEffect(() => {
    setLoading(true);
    load();
    return navigation?.addListener?.('focus', load);
  }, [load, navigation]);

  // Fetch the full stored result only when an entry is opened (keeps the list query light).
  const open = async (item: HistoryItem) => {
    setOpeningId(item.id);
    const { data, error } = await supabase.from('scans').select('raw_vision_response').eq('id', item.id).single();
    setOpeningId(null);
    if (error || !data?.raw_vision_response) {
      Alert.alert('Could not open', error?.message || 'This entry has no saved details.');
      return;
    }
    navigation?.navigate('MagicLens', {
      openHistory: {
        id: item.id,
        source: item.source,
        saved: item.saved,
        image: item.image_url,
        result: data.raw_vision_response,
      },
      requestedAt: Date.now(),
    });
  };

  const groups = GROUP_ORDER
    .map(name => ({ name, rows: items.filter(i => groupFor(i.created_at) === name) }))
    .filter(g => g.rows.length > 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgApp }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>History</Text>

        <View style={[styles.segment, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]} accessibilityRole="tablist">
          {([['all', 'All'], ['saved', 'Saved']] as const).map(([key, label]) => {
            const active = filter === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setFilter(key)}
                style={[styles.segmentItem, active && { backgroundColor: colors.actionPrimary }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                {key === 'saved' && (
                  <MaterialCommunityIcons name="bookmark" size={15} color={active ? colors.onActionPrimary : colors.textSecondary} />
                )}
                <Text style={[styles.segmentText, { color: active ? colors.onActionPrimary : colors.textSecondary }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.accentIcon} style={{ marginTop: 40 }} />
        ) : failed ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Couldn't load your history</Text>
            <TouchableOpacity onPress={load}><Text style={[styles.link, { color: colors.textAccent }]}>Try again</Text></TouchableOpacity>
          </View>
        ) : groups.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}>
            <MaterialCommunityIcons name={filter === 'saved' ? 'bookmark-outline' : 'history'} size={32} color={colors.accentIcon} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {filter === 'saved' ? 'No saved products yet' : 'Nothing here yet'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {filter === 'saved'
                ? 'Tap the bookmark on a scan or search result to keep it here.'
                : 'Your scans and product searches will show up here.'}
            </Text>
          </View>
        ) : (
          groups.map(group => (
            <View key={group.name} style={{ marginTop: 20 }}>
              <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{group.name.toUpperCase()}</Text>
              {group.rows.map(item => {
                const meta = SOURCE_META[item.source] || SOURCE_META.scan;
                const tone = item.match_score != null ? matchTone(item.match_score) : null;
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => open(item)}
                    style={[styles.row, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}
                    accessibilityRole="button"
                  >
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={styles.thumb} accessibilityLabel={item.detected_product} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: colors.accentSubtle }]}>
                        <MaterialCommunityIcons name={meta.icon} size={24} color={colors.accentIcon} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.detected_product}</Text>
                      {!!item.cultural_equivalent && (
                        <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>→ {item.cultural_equivalent}</Text>
                      )}
                      <View style={styles.rowMeta}>
                        <View style={[styles.sourceTag, { borderColor: colors.borderDefault }]}>
                          <MaterialCommunityIcons name={meta.icon} size={12} color={colors.textSecondary} />
                          <Text style={[styles.sourceText, { color: colors.textSecondary }]}>{meta.label}</Text>
                        </View>
                        {tone && (
                          <View style={[styles.matchTag, { backgroundColor: tone.bg }]}>
                            <Text style={[styles.matchText, { color: tone.text }]}>{item.match_score}% match</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {openingId === item.id ? (
                      <ActivityIndicator color={colors.accentIcon} />
                    ) : (
                      <SaveButton
                        id={item.id}
                        saved={item.saved}
                        compact
                        onChange={saved => {
                          setItems(list => filter === 'saved' && !saved
                            ? list.filter(i => i.id !== item.id)
                            : list.map(i => (i.id === item.id ? { ...i, saved } : i)));
                        }}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  title: { fontSize: 28, fontWeight: '700', marginTop: 4 },
  segment: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 4, marginTop: 16 },
  segmentItem: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 9 },
  segmentText: { fontSize: 14, fontWeight: '700' },
  groupLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  thumbEmpty: { justifyContent: 'center', alignItems: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 13, marginTop: 2 },
  rowMeta: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  sourceTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  sourceText: { fontSize: 11, fontWeight: '600' },
  matchTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  matchText: { fontSize: 11, fontWeight: '700' },
  emptyCard: { alignItems: 'center', padding: 28, borderRadius: 16, borderWidth: 1, marginTop: 24, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 6 },
  emptyText: { fontSize: 13, textAlign: 'center' },
  link: { fontSize: 14, fontWeight: '700', marginTop: 6 },
});
