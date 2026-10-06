import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import ErrorCard from '../components/ErrorCard';
import { describeError, FriendlyError } from '../lib/errors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { apiFetchJson } from '../lib/api';
import { supabase } from '../lib/supabase';
import { Alert } from '../lib/alert';

type Ingredient = {
  original_ingredient: string;
  us_equivalent_product: string;
  us_brand?: string;
  match_score: number;
  aisle_location: string;
  ai_tip: string;
  can_make_at_home: boolean;
  availability_breadth?: 'mainstream' | 'specialty_only' | 'both';
  preferred_store_types?: string[];
};

type SavedRecipe = { id: string; title: string; source_dish: string | null; created_at: string; item_count: number };
type OpenRecipe = { dishName: string; ingredients: Ingredient[] };

const SUGGESTED_DISHES = ['Biryani', 'Pasta Carbonara', 'Pad Thai', 'Bibimbap', 'Tacos al Pastor', 'Tonkotsu Ramen'];

// list_items rows → the shape /recipe returns, so saved and fresh recipes render the same.
function ingredientFromRow(row: any): Ingredient {
  return {
    original_ingredient: row.original_ingredient,
    us_equivalent_product: row.us_equivalent_product,
    us_brand: row.us_equivalent_brand || undefined,
    match_score: row.match_score ?? 0,
    aisle_location: row.aisle_location || '',
    ai_tip: row.ai_tip || '',
    can_make_at_home: !!row.can_make_at_home,
    availability_breadth: row.availability_breadth || undefined,
    preferred_store_types: row.preferred_store_types || [],
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ListScreen({ navigation, route }: { navigation?: any; route?: any }) {
  const { user, profile } = useAuth();
  const { colors } = useTheme();
  const [section, setSection] = useState<'import' | 'saved'>('import');

  // Import section
  const [dish, setDish] = useState('');
  const [loading, setLoading] = useState(false);
  const [imported, setImported] = useState<OpenRecipe | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [lastTarget, setLastTarget] = useState('');

  // Saved section
  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [openSaved, setOpenSaved] = useState<OpenRecipe | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const loadSaved = useCallback(async () => {
    if (!user) return;
    const { data, error: dbError } = await supabase
      .from('shopping_lists')
      .select('id, title, source_dish, created_at, list_items(count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (!dbError && data) {
      setSaved(data.map((l: any) => ({
        id: l.id, title: l.title, source_dish: l.source_dish, created_at: l.created_at,
        item_count: l.list_items?.[0]?.count ?? 0,
      })));
    }
    setSavedLoading(false);
  }, [user]);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  const openSavedRecipe = async (recipe: SavedRecipe) => {
    setOpeningId(recipe.id);
    const { data, error: dbError } = await supabase
      .from('list_items')
      .select('*')
      .eq('list_id', recipe.id)
      .order('created_at', { ascending: true });
    setOpeningId(null);
    if (dbError) {
      Alert.alert('Could not open recipe', dbError.message);
      return;
    }
    setSection('saved');
    setOpenSaved({ dishName: recipe.source_dish || recipe.title, ingredients: (data || []).map(ingredientFromRow) });
  };

  // Deletes go through the anon client; RLS (users_own_lists) limits them to the user's own
  // lists, and list_items rows go with them via ON DELETE CASCADE.
  const deleteSavedRecipe = (recipe: SavedRecipe) => {
    Alert.alert(
      'Delete this recipe?',
      `"${recipe.source_dish || recipe.title}" and its shopping list will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error: dbError } = await supabase.from('shopping_lists').delete().eq('id', recipe.id);
            if (dbError) Alert.alert('Could not delete', dbError.message);
            else setSaved(list => list.filter(r => r.id !== recipe.id));
          },
        },
      ],
    );
  };

  const importRecipe = async (overrideDish?: string) => {
    const target = (overrideDish ?? dish).trim();
    if (!target) return;
    setLoading(true);
    setError(null);
    setLastTarget(target);
    try {
      const data = await apiFetchJson('/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dish_name: target,
          user_profile: {
            home_country: profile?.home_country,
            home_region: profile?.home_region,
            home_cuisines: profile?.home_cuisines || [],
            dietary_preferences: profile?.dietary_preferences || [],
          },
        }),
      });
      setImported({ dishName: data.dish_name || target, ingredients: data.ingredients || [] });
      setDish('');
      loadSaved();  // the backend saved it — show it under Saved too
    } catch (err) {
      console.error('Recipe import failed:', err);
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (s: number) => s >= 75 ? colors.scoreHigh : s >= 50 ? colors.scoreMid : colors.scoreLow;

  // Home's "Recipe Lists" cards pass openListId: open the saved list straight from the
  // database instead of re-running the AI import (slow, and it used up the daily quota).
  useEffect(() => {
    const id = route?.params?.openListId;
    if (!id || !user) return;
    openSavedRecipe({ id, title: route?.params?.title || '', source_dish: route?.params?.title || null, created_at: '', item_count: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.openListId, route?.params?.requestedAt, user]);

  const findStoresForList = (recipe: OpenRecipe) => {
    // Aggregate per-ingredient classifications into a single product_context.
    // Rule: if any ingredient is specialty_only we still set 'both' on the aggregate
    // so mainstream stores remain visible for the cauliflower/onion side of a recipe.
    const allTypes = new Set<string>();
    let anySpecialty = false;
    for (const ing of recipe.ingredients) {
      for (const t of (ing.preferred_store_types || [])) allTypes.add(t);
      if (ing.availability_breadth === 'specialty_only') anySpecialty = true;
    }
    navigation?.navigate('Map', {
      returnTo: 'List',
      cuisine: profile?.home_country,
      productName: `${recipe.dishName} ingredients`,
      product_context: {
        availability_breadth: anySpecialty ? 'both' : 'mainstream',
        preferred_store_types: Array.from(allTypes),
        needed_items: recipe.ingredients.map(i => ({
          name: i.original_ingredient,
          preferred_store_types: i.preferred_store_types || [],
        })),
      },
    });
  };

  const renderRecipe = (recipe: OpenRecipe) => (
    <>
      {recipe.ingredients.length > 0 && navigation && (
        <TouchableOpacity
          style={[styles.findStoresButton, { backgroundColor: colors.primary }]}
          onPress={() => findStoresForList(recipe)}
        >
          <MaterialCommunityIcons name="store-marker" size={18} color={colors.onPrimary} />
          <Text style={[styles.findStoresText, { color: colors.onPrimary }]}>Find stores for this list</Text>
        </TouchableOpacity>
      )}
      <View style={{ marginTop: 24 }}>
        <Text style={[styles.dishHeader, { color: colors.textPrimary }]}>{recipe.dishName}</Text>
        <Text style={[styles.dishSub, { color: colors.textSecondary }]}>{recipe.ingredients.length} ingredients</Text>
        {recipe.ingredients.map((ing, idx) => (
          <TouchableOpacity
            key={idx}
            activeOpacity={0.75}
            onPress={() => {
              if (!navigation) return;
              navigation.navigate('Map', {
                returnTo: 'List',
                cuisine: profile?.home_country,
                productName: ing.us_equivalent_product || ing.original_ingredient,
                product_context: {
                  availability_breadth: ing.availability_breadth,
                  preferred_store_types: ing.preferred_store_types || [],
                },
              });
            }}
            style={[styles.ingredientCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.ingredientHeader}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.originalName, { color: colors.textPrimary }]}>{ing.original_ingredient}</Text>
                <Text style={[styles.usName, { color: colors.primary }]}>
                  {ing.us_brand ? `${ing.us_brand} — ` : ''}{ing.us_equivalent_product}
                </Text>
              </View>
              <View style={[styles.scoreBadge, { backgroundColor: scoreColor(ing.match_score) + '22' }]}>
                <Text style={[styles.scoreBadgeText, { color: scoreColor(ing.match_score) }]}>{ing.match_score}</Text>
              </View>
            </View>

            {!!ing.aisle_location && (
              <View style={styles.aisleRow}>
                <MaterialCommunityIcons name="map-marker" size={14} color={colors.textTertiary} />
                <Text style={[styles.aisleText, { color: colors.textTertiary }]}>{ing.aisle_location}</Text>
              </View>
            )}

            {!!ing.ai_tip && (
              <View style={[styles.tipBox, { backgroundColor: colors.primarySubtle }]}>
                <Text style={[styles.tipText, { color: colors.textSecondary }]}>💡 {ing.ai_tip}</Text>
              </View>
            )}

            <View style={styles.ingredientFooter}>
              {ing.can_make_at_home && (
                <View style={[styles.homeBadge, { backgroundColor: colors.cultural + '22' }]}>
                  <Text style={[styles.homeBadgeText, { color: colors.cultural }]}>🏠 Make at home</Text>
                </View>
              )}
              <View style={[styles.findOneChip, { backgroundColor: colors.primarySubtle }]}>
                <MaterialCommunityIcons name="store-marker" size={13} color={colors.primary} />
                <Text style={[styles.findOneText, { color: colors.primary }]}>Find stores →</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Recipes</Text>

        {/* Section switcher */}
        <View style={[styles.segment, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="tablist">
          {([['import', 'Import a recipe'], ['saved', `Saved${saved.length ? ` (${saved.length})` : ''}`]] as const).map(([key, label]) => {
            const active = section === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setSection(key)}
                style={[styles.segmentItem, active && { backgroundColor: colors.primary }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.segmentText, { color: active ? colors.onPrimary : colors.textSecondary }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {section === 'import' ? (
          <>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Type a dish from home — I'll build your shopping list with US equivalents.
            </Text>

            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                placeholder="e.g. biryani, pasta carbonara..."
                placeholderTextColor={colors.textTertiary}
                value={dish}
                onChangeText={setDish}
                onSubmitEditing={() => importRecipe()}
                returnKeyType="go"
              />
              <TouchableOpacity
                style={[styles.importButton, { backgroundColor: colors.primary, opacity: !dish.trim() || loading ? 0.5 : 1 }]}
                onPress={() => importRecipe()}
                disabled={loading || !dish.trim()}
                accessibilityLabel="Import recipe"
              >
                {loading ? <ActivityIndicator color={colors.onPrimary} /> : <MaterialCommunityIcons name="auto-fix" size={22} color={colors.onPrimary} />}
              </TouchableOpacity>
            </View>

            {loading && (
              <Text style={[styles.loadingHint, { color: colors.textTertiary }]}>
                Building your shopping list… this usually takes 10–20 seconds.
              </Text>
            )}

            {error && !loading && (
              <View style={{ marginTop: 20 }}>
                <ErrorCard
                  error={error}
                  onRetry={() => importRecipe(lastTarget)}
                  onDismiss={() => setError(null)}
                />
              </View>
            )}

            {!imported && !loading && !error && (
              <View style={{ marginTop: 24 }}>
                <Text style={[styles.suggestLabel, { color: colors.textTertiary }]}>TRY ONE OF THESE</Text>
                <View style={styles.chipWrap}>
                  {SUGGESTED_DISHES.map(d => (
                    <TouchableOpacity
                      key={d}
                      onPress={() => { setDish(d); importRecipe(d); }}
                      style={[styles.suggestChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    >
                      <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '500' }}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {imported && !loading && renderRecipe(imported)}
          </>
        ) : openSaved ? (
          <>
            <TouchableOpacity onPress={() => setOpenSaved(null)} style={styles.backLink} accessibilityRole="button">
              <MaterialCommunityIcons name="arrow-left" size={18} color={colors.primary} />
              <Text style={[styles.backLinkText, { color: colors.primary }]}>Saved recipes</Text>
            </TouchableOpacity>
            {renderRecipe(openSaved)}
          </>
        ) : savedLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : saved.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="book-open-variant" size={32} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No saved recipes yet</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Every recipe you import is saved here automatically.
            </Text>
            <TouchableOpacity onPress={() => setSection('import')} style={[styles.emptyButton, { backgroundColor: colors.primary }]}>
              <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>Import a recipe</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ marginTop: 16 }}>
            {saved.map(recipe => (
              <TouchableOpacity
                key={recipe.id}
                onPress={() => openSavedRecipe(recipe)}
                style={[styles.savedCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                accessibilityRole="button"
              >
                <View style={[styles.savedIcon, { backgroundColor: colors.primarySubtle }]}>
                  <MaterialCommunityIcons name="silverware-fork-knife" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.savedTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {recipe.source_dish || recipe.title}
                  </Text>
                  <Text style={[styles.savedMeta, { color: colors.textTertiary }]}>
                    {recipe.item_count} ingredients · {formatDate(recipe.created_at)}
                  </Text>
                </View>
                {openingId === recipe.id ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <TouchableOpacity
                    onPress={() => deleteSavedRecipe(recipe)}
                    style={styles.deleteButton}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete recipe: ${recipe.source_dish || recipe.title}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingHint: { fontSize: 13, marginTop: 14, textAlign: 'center' },
  container: { flex: 1 },
  scrollContent: { padding: 20 },
  title: { fontSize: 28, fontWeight: '700', marginTop: 4 },
  subtitle: { fontSize: 14, marginTop: 18, marginBottom: 16, lineHeight: 20 },
  segment: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 4, marginTop: 16 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  segmentText: { fontSize: 14, fontWeight: '700' },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, alignSelf: 'flex-start' },
  backLinkText: { fontSize: 14, fontWeight: '700' },
  savedCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  savedIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  savedTitle: { fontSize: 15, fontWeight: '700' },
  savedMeta: { fontSize: 12, marginTop: 3 },
  deleteButton: { padding: 4 },
  emptyCard: { alignItems: 'center', padding: 28, borderRadius: 16, borderWidth: 1, marginTop: 20 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 10 },
  emptyText: { fontSize: 13, marginTop: 4, textAlign: 'center' },
  emptyButton: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  inputRow: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    borderWidth: 1,
  },
  importButton: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  suggestLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  findStoresButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 14,
    marginTop: 16,
    gap: 8,
  },
  findStoresText: { fontWeight: '700', fontSize: 15 },
  dishHeader: { fontSize: 22, fontWeight: '700', marginBottom: 2 },
  dishSub: { fontSize: 13, marginBottom: 16 },
  ingredientCard: { borderRadius: 14, padding: 16, borderWidth: 1, marginBottom: 10 },
  ingredientHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  originalName: { fontSize: 15, fontWeight: '700' },
  usName: { fontSize: 13, marginTop: 4, fontWeight: '500' },
  scoreBadge: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  scoreBadgeText: { fontWeight: '800', fontSize: 14 },
  aisleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  aisleText: { fontSize: 12 },
  tipBox: { padding: 10, borderRadius: 10, marginTop: 10 },
  tipText: { fontSize: 13, lineHeight: 18 },
  homeBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  homeBadgeText: { fontSize: 11, fontWeight: '700' },
  ingredientFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  findOneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
    marginLeft: 'auto',
  },
  findOneText: { fontSize: 11, fontWeight: '700' },
});
