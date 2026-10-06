import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import ErrorCard from '../components/ErrorCard';
import { describeError, FriendlyError } from '../lib/errors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { apiFetchJson } from '../lib/api';

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

const SUGGESTED_DISHES = ['Biryani', 'Pasta Carbonara', 'Pad Thai', 'Bibimbap', 'Tacos al Pastor', 'Tonkotsu Ramen'];

export default function ListScreen({ navigation, route }: { navigation?: any; route?: any }) {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const [dish, setDish] = useState('');
  const [loading, setLoading] = useState(false);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [dishName, setDishName] = useState('');
  const [error, setError] = useState<FriendlyError | null>(null);
  const [lastTarget, setLastTarget] = useState('');
  // Track which dish we've already auto-imported so re-renders / focus events don't loop.
  const autoImportedRef = useRef<string | null>(null);

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
            cooking_confidence: profile?.cooking_confidence || 3,
            dietary_preferences: profile?.dietary_preferences || [],
          },
        }),
      });
      setIngredients(data.ingredients || []);
      setDishName(data.dish_name || target);
      setDish('');
    } catch (err) {
      console.error('Recipe import failed:', err);
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (s: number) => s >= 75 ? colors.scoreHigh : s >= 50 ? colors.scoreMid : colors.scoreLow;

  // When the user taps an old Recipe Lists card on Home, navigation passes autoImportDish.
  // Re-run /recipe with that dish so they see the latest ingredient list (now with
  // availability_breadth + preferred_store_types attached) instead of stale rows from
  // a pre-migration import.
  useEffect(() => {
    const target = route?.params?.autoImportDish;
    if (target && autoImportedRef.current !== target) {
      autoImportedRef.current = target;
      setDish(target);
      importRecipe(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.autoImportDish]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Recipe Importer</Text>
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
          >
            {loading ? <ActivityIndicator color="#fff" /> : <MaterialCommunityIcons name="auto-fix" size={22} color="#fff" />}
          </TouchableOpacity>
        </View>

        {loading && (
          <Text style={[styles.loadingHint, { color: colors.textTertiary }]}>
            Building your shopping list… free AI models can take up to a minute.
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

        {/* Suggested dishes */}
        {ingredients.length === 0 && !loading && !error && (
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

        {dishName && ingredients.length > 0 && navigation && (
          <TouchableOpacity
            style={[styles.findStoresButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              // Aggregate per-ingredient classifications into a single product_context.
              // Rule: if any ingredient is specialty_only we still set 'both' on the aggregate
              // so mainstream stores remain visible for the cauliflower/onion side of a recipe.
              const allTypes = new Set<string>();
              let anySpecialty = false;
              let anyMainstream = false;
              for (const ing of ingredients) {
                for (const t of (ing.preferred_store_types || [])) allTypes.add(t);
                if (ing.availability_breadth === 'specialty_only') anySpecialty = true;
                if (ing.availability_breadth === 'mainstream') anyMainstream = true;
              }
              const breadth = (anySpecialty && anyMainstream) ? 'both' : (anySpecialty ? 'both' : 'mainstream');
              navigation.navigate('Map', {
                returnTo: 'List',
                cuisine: profile?.home_country,
                productName: `${dishName} ingredients`,
                product_context: {
                  availability_breadth: breadth,
                  preferred_store_types: Array.from(allTypes),
                  needed_items: ingredients.map(i => ({
                    name: i.original_ingredient,
                    preferred_store_types: i.preferred_store_types || [],
                  })),
                },
              });
            }}
          >
            <MaterialCommunityIcons name="store-marker" size={18} color="#fff" />
            <Text style={styles.findStoresText}>Find stores for this list</Text>
          </TouchableOpacity>
        )}

        {dishName && ingredients.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text style={[styles.dishHeader, { color: colors.textPrimary }]}>{dishName}</Text>
            <Text style={[styles.dishSub, { color: colors.textSecondary }]}>{ingredients.length} ingredients</Text>

            {ingredients.map((ing, idx) => (
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

                <View style={styles.aisleRow}>
                  <MaterialCommunityIcons name="map-marker" size={14} color={colors.textTertiary} />
                  <Text style={[styles.aisleText, { color: colors.textTertiary }]}>{ing.aisle_location}</Text>
                </View>

                <View style={[styles.tipBox, { backgroundColor: colors.primarySubtle }]}>
                  <Text style={[styles.tipText, { color: colors.textSecondary }]}>💡 {ing.ai_tip}</Text>
                </View>

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
  subtitle: { fontSize: 14, marginTop: 6, marginBottom: 24, lineHeight: 20 },
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
  findStoresText: { color: '#fff', fontWeight: '700', fontSize: 15 },
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
