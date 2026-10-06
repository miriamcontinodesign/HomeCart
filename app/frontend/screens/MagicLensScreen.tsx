import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { apiFetchJson } from '../lib/api';
import { Alert } from '../lib/alert';
import ErrorCard from '../components/ErrorCard';
import { describeError, FriendlyError } from '../lib/errors';
import { countryName } from '../lib/countries';
import ScanProgress, { recordScanDuration } from '../components/ScanProgress';

type HomeMatch = {
  name: string;
  match_score: number;
  how_to_use?: string | null;
};

type UsEquivalent = {
  name: string;
  brand?: string | null;
  match_score: number;
  aisle?: string | null;
  tip?: string | null;
};

type ProductSearchResult = {
  query: string;
  product_name: string;
  origin_country?: string | null;
  description?: string;
  us_equivalents: UsEquivalent[];
  ai_tip?: string;
  availability_breadth?: 'mainstream' | 'specialty_only' | 'both';
  preferred_store_types?: string[];
};

type ScanResult = {
  detected_product: string;
  detected_brand?: string;
  brand_origin?: string | null;
  detected_category?: string;
  description?: string;
  home_matches?: HomeMatch[];
  cultural_equivalent: string;
  match_score: number;
  ai_tip: string;
  can_make_at_home: boolean;
  home_recipe_summary?: string;
  real_version_name?: string;
  availability_breadth?: 'mainstream' | 'specialty_only' | 'both';
  preferred_store_types?: string[];
};

// Phone photos are often 5-10 MB; the vision model only needs enough detail to read a label.
const MAX_IMAGE_SIDE = 1280;
const THUMBNAIL_SIDE = 160;  // saved with the scan for the Home history cards (~10 KB)

// Decode the picked file, downscale it, and re-encode as JPEG. Returns the base64 payload
// (no data: prefix) the /scan endpoint expects, a data URL for the preview, and a small
// thumbnail the backend stores with the scan for the Home history cards.
function drawScaled(bitmap: ImageBitmap, maxSide: number, quality: number): string {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

async function prepareImage(file: File): Promise<{ base64: string; dataUrl: string; thumbnail: string }> {
  const bitmap = await createImageBitmap(file);
  const dataUrl = drawScaled(bitmap, MAX_IMAGE_SIDE, 0.8);
  const thumbnail = drawScaled(bitmap, THUMBNAIL_SIDE, 0.7);
  bitmap.close();
  return { base64: dataUrl.split(',')[1], dataUrl, thumbnail };
}

export default function MagicLensScreen({ navigation }: { navigation?: any }) {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search by name: a product from any country -> its American versions.
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [searchResult, setSearchResult] = useState<ProductSearchResult | null>(null);
  const [lastQuery, setLastQuery] = useState('');
  const [lastAction, setLastAction] = useState<'scan' | 'search'>('scan');

  const runSearch = async (raw?: string) => {
    const q = (raw ?? query).trim();
    if (!q) return;
    setSearching(true);
    setSearchDone(false);
    setError(null);
    setLastQuery(q);
    setLastAction('search');
    const startedAt = Date.now();
    try {
      const data = await apiFetchJson('/product-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          user_profile: {
            home_country: profile?.home_country,
            home_region: profile?.home_region,
            home_cuisines: profile?.home_cuisines || [],
            dietary_preferences: profile?.dietary_preferences || [],
          },
        }),
      });
      recordScanDuration(Date.now() - startedAt, 'search');
      setSearchDone(true);
      await new Promise(r => setTimeout(r, 400));
      setSearchResult(data);
      setQuery('');
    } catch (err) {
      console.error('Product search error:', err);
      setError(describeError(err));
    } finally {
      setSearching(false);
    }
  };

  const scanFile = async (file: File) => {
    try {
      setScanning(true);
      setScanDone(false);
      setError(null);
      setLastFile(file);
      setLastAction('scan');
      const startedAt = Date.now();
      let image;
      try {
        image = await prepareImage(file);
      } catch {
        Alert.alert('Unsupported image', 'Could not read that file. Try a JPEG or PNG photo.');
        return;
      }
      setCapturedImage(image.dataUrl);

      const data = await apiFetchJson('/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: image.base64,
          thumbnail_data_url: image.thumbnail,
          user_profile: {
            home_country: profile?.home_country,
            home_region: profile?.home_region,
            home_cuisines: profile?.home_cuisines || [],
            dietary_preferences: profile?.dietary_preferences || [],
          },
        }),
      });
      recordScanDuration(Date.now() - startedAt);
      // Let the bar visibly reach 100% before swapping in the result.
      setScanDone(true);
      await new Promise(r => setTimeout(r, 400));
      setResult(data);
    } catch (err) {
      setCapturedImage(null);
      console.error('Scan error:', err);
      setError(describeError(err));
    } finally {
      setScanning(false);
    }
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (file) scanFile(file);
  };

  const reset = () => { setCapturedImage(null); setResult(null); setSearchResult(null); };

  if (searchResult) {
    return (
      <ProductSearchResultView
        result={searchResult}
        onReset={reset}
        onFindStores={() => navigation?.navigate('Map', {
          returnTo: 'MagicLens',
          cuisine: profile?.home_country,
          productName: searchResult.product_name,
          product_context: {
            availability_breadth: searchResult.availability_breadth,
            preferred_store_types: searchResult.preferred_store_types || [],
          },
        })}
        colors={colors}
      />
    );
  }

  if (result) {
    return (
      <ScanResultView
        result={result}
        image={capturedImage}
        onReset={reset}
        homeCountry={countryName(profile?.home_country)}
        onFindStores={result.real_version_name ? () => navigation?.navigate('Map', {
          returnTo: 'MagicLens',
          cuisine: profile?.home_country,
          productName: result.real_version_name,
          product_context: {
            availability_breadth: result.availability_breadth,
            preferred_store_types: result.preferred_store_types || [],
          },
        }) : undefined}
        colors={colors}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.pickContainer, { backgroundColor: colors.bg }]} edges={['top']}>
      {/* capture="environment" opens the rear camera on phones; desktops get a file picker. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFilePicked}
        style={{ display: 'none' }}
      />
      {scanning ? (
        <View style={styles.pickBody}>
          {capturedImage && <Image source={{ uri: capturedImage }} style={styles.pickPreview} />}
          <ScanProgress done={scanDone} homeCountry={countryName(profile?.home_country)} />
        </View>
      ) : searching ? (
        <View style={styles.pickBody}>
          <Text style={[styles.searchingFor, { color: colors.textSecondary }]}>“{lastQuery}”</Text>
          <ScanProgress done={searchDone} homeCountry={countryName(profile?.home_country)} variant="search" />
        </View>
      ) : error ? (
        <View style={styles.pickBody}>
          <ErrorCard
            error={error}
            onRetry={lastAction === 'search' ? () => runSearch(lastQuery) : lastFile ? () => scanFile(lastFile) : undefined}
            onDismiss={() => setError(null)}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.pickBody, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled">
          <View style={[styles.pickIcon, { backgroundColor: colors.primarySubtle }]}>
            <MaterialCommunityIcons name="camera-outline" size={44} color={colors.primary} />
          </View>
          <Text style={[styles.pickTitle, { color: colors.textPrimary }]}>Magic Lens</Text>
          <Text style={[styles.pickText, { color: colors.textSecondary }]}>
            Take or upload a photo of any grocery product and I'll translate it to your home cuisine.
          </Text>
          <TouchableOpacity
            style={[styles.pickButton, { backgroundColor: colors.primary }]}
            onPress={() => fileInputRef.current?.click()}
          >
            <MaterialCommunityIcons name="image-plus" size={18} color={colors.onPrimary} />
            <Text style={[styles.pickButtonText, { color: colors.onPrimary }]}>Take or upload a photo</Text>
          </TouchableOpacity>
          <Text style={[styles.pickHint, { color: colors.textTertiary }]}>
            Tip: get the label in frame and in focus.
          </Text>

          {/* Search by name */}
          <View style={styles.orRow}>
            <View style={[styles.orLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.orText, { color: colors.textTertiary }]}>or search by name</Text>
            <View style={[styles.orLine, { backgroundColor: colors.border }]} />
          </View>
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.searchInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
              placeholder="e.g. mascarpone, gochujang, queso fresco"
              placeholderTextColor={colors.textTertiary}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => runSearch()}
              returnKeyType="search"
              accessibilityLabel="Search a product from any country"
            />
            <TouchableOpacity
              style={[styles.searchButton, { backgroundColor: colors.primary, opacity: query.trim() ? 1 : 0.5 }]}
              onPress={() => runSearch()}
              disabled={!query.trim()}
              accessibilityLabel="Find the American version"
            >
              <MaterialCommunityIcons name="magnify" size={22} color={colors.onPrimary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.pickHint, { color: colors.textTertiary }]}>
            A product from any country — I'll find its American version.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ProductSearchResultView({
  result, onReset, onFindStores, colors,
}: {
  result: ProductSearchResult; onReset: () => void; onFindStores: () => void; colors: any;
}) {
  const scoreColorFor = (score: number) => score >= 75 ? colors.scoreHigh : score >= 50 ? colors.scoreMid : colors.scoreLow;
  return (
    <SafeAreaView style={[styles.resultContainer, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.productName, { color: colors.textPrimary }]}>{result.product_name || result.query}</Text>
          {!!result.origin_country && (
            <Text style={[styles.productBrand, { color: colors.textSecondary }]}>From {result.origin_country}</Text>
          )}
          {!!result.description && (
            <Text style={[styles.description, { color: colors.textSecondary }]}>{result.description}</Text>
          )}

          {result.us_equivalents.length > 0 ? (
            <View style={[styles.section, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>AMERICAN VERSIONS</Text>
              {result.us_equivalents.map((e, i) => (
                <View key={`${e.name}-${i}`} style={[styles.matchRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <View style={styles.matchHeader}>
                    <Text style={[styles.matchName, { color: colors.textPrimary }]}>{e.name}</Text>
                    <View style={[styles.matchPill, { backgroundColor: scoreColorFor(e.match_score) + '22' }]}>
                      <Text style={[styles.matchPillText, { color: scoreColorFor(e.match_score) }]}>{e.match_score}% match</Text>
                    </View>
                  </View>
                  {!!e.brand && <Text style={[styles.equivMeta, { color: colors.primary }]}>{e.brand}</Text>}
                  {!!e.aisle && (
                    <View style={styles.aisleRow}>
                      <MaterialCommunityIcons name="map-marker" size={13} color={colors.textTertiary} />
                      <Text style={[styles.equivMeta, { color: colors.textTertiary }]}>{e.aisle}</Text>
                    </View>
                  )}
                  {!!e.tip && <Text style={[styles.sectionText, { color: colors.textSecondary, marginTop: 4 }]}>{e.tip}</Text>}
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.section, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Text style={[styles.sectionText, { color: colors.textSecondary }]}>
                I couldn't find an American version for this one.
              </Text>
            </View>
          )}

          {!!result.ai_tip && (
            <View style={[styles.section, { backgroundColor: colors.primarySubtle, borderColor: colors.primary + '30' }]}>
              <Text style={[styles.sectionLabel, { color: colors.primary }]}>💡 AI TIP</Text>
              <Text style={[styles.sectionText, { color: colors.textPrimary }]}>{result.ai_tip}</Text>
            </View>
          )}
        </View>

        {result.us_equivalents.length > 0 && (
          <TouchableOpacity style={[styles.findStoresButton, { backgroundColor: colors.primary }]} onPress={onFindStores}>
            <MaterialCommunityIcons name="store-marker" size={18} color={colors.onPrimary} />
            <Text style={[styles.findStoresText, { color: colors.onPrimary }]}>Find in a Store</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.scanAgainButton, { borderColor: colors.border }]} onPress={onReset}>
          <Text style={[styles.scanAgainText, { color: colors.textPrimary }]}>Search or scan another</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function ScanResultView({
  result, image, homeCountry, onReset, onFindStores, colors,
}: {
  result: ScanResult; image: string | null; homeCountry: string; onReset: () => void; onFindStores?: () => void; colors: any;
}) {
  const scoreColorFor = (score: number) => score >= 75 ? colors.scoreHigh : score >= 50 ? colors.scoreMid : colors.scoreLow;
  const scoreColor = scoreColorFor(result.match_score);
  const matches = result.home_matches || [];

  return (
    <SafeAreaView style={[styles.resultContainer, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false}>
        {image && <Image source={{ uri: image }} style={styles.resultImage} />}

        <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.productName, { color: colors.textPrimary }]}>{result.detected_product}</Text>
          {!!result.detected_brand && (
            <Text style={[styles.productBrand, { color: colors.textSecondary }]}>
              {result.detected_brand}{result.brand_origin ? ` (${result.brand_origin})` : ''}
            </Text>
          )}
          {!!result.description && (
            <Text style={[styles.description, { color: colors.textSecondary }]}>{result.description}</Text>
          )}

          {matches.length > 0 ? (
            <View style={[styles.section, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                SIMILAR FROM {(homeCountry || 'HOME').toUpperCase()}
              </Text>
              {matches.map((m, i) => (
                <View
                  key={`${m.name}-${i}`}
                  style={[styles.matchRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                >
                  <View style={styles.matchHeader}>
                    <Text style={[styles.matchName, { color: colors.textPrimary }]}>{m.name}</Text>
                    <View style={[styles.matchPill, { backgroundColor: scoreColorFor(m.match_score) + '22' }]}>
                      <Text style={[styles.matchPillText, { color: scoreColorFor(m.match_score) }]}>{m.match_score}% match</Text>
                    </View>
                  </View>
                  {!!m.how_to_use && (
                    <Text style={[styles.sectionText, { color: colors.textSecondary }]}>{m.how_to_use}</Text>
                  )}
                </View>
              ))}
            </View>
          ) : (
            // Older scans (and replies from models that skip home_matches) only have the summary.
            <>
              <View style={[styles.scoreCircle, { backgroundColor: scoreColor }]}>
                <Text style={[styles.scoreNumber, { color: colors.onPrimary }]}>{result.match_score}</Text>
                <Text style={[styles.scoreLabel, { color: colors.onPrimary }]}>MATCH</Text>
              </View>
              <View style={[styles.section, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>FOR YOUR CUISINE</Text>
                <Text style={[styles.sectionText, { color: colors.textPrimary }]}>{result.cultural_equivalent}</Text>
              </View>
            </>
          )}

          <View style={[styles.section, { backgroundColor: colors.primarySubtle, borderColor: colors.primary + '30' }]}>
            <Text style={[styles.sectionLabel, { color: colors.primary }]}>💡 AI TIP</Text>
            <Text style={[styles.sectionText, { color: colors.textPrimary }]}>{result.ai_tip}</Text>
          </View>

          {result.can_make_at_home && !!result.home_recipe_summary && (
            <View style={[styles.section, { backgroundColor: colors.cultural + '15', borderColor: colors.cultural + '30' }]}>
              <Text style={[styles.sectionLabel, { color: colors.cultural }]}>🏠 MAKE IT AT HOME</Text>
              <Text style={[styles.sectionText, { color: colors.textPrimary }]}>{result.home_recipe_summary}</Text>
            </View>
          )}
        </View>

        {onFindStores && (
          <TouchableOpacity style={[styles.findStoresButton, { backgroundColor: colors.primary }]} onPress={onFindStores}>
            <MaterialCommunityIcons name="store-marker" size={18} color={colors.onPrimary} />
            <Text style={[styles.findStoresText, { color: colors.onPrimary }]}>Find in a Store</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.scanAgainButton, { borderColor: colors.border }]} onPress={onReset}>
          <Text style={[styles.scanAgainText, { color: colors.textPrimary }]}>Scan another</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pickContainer: { flex: 1 },
  pickBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  pickIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center' },
  pickPreview: { width: 220, height: 220, borderRadius: 16 },
  pickTitle: { fontSize: 22, fontWeight: '700', marginTop: 20 },
  pickText: { fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 22, maxWidth: 360 },
  pickButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 24,
  },
  pickButtonText: { fontWeight: '700', fontSize: 15 },
  pickHint: { fontSize: 12, marginTop: 14, textAlign: 'center' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', maxWidth: 380, marginTop: 32 },
  orLine: { flex: 1, height: 1 },
  orText: { fontSize: 12, fontWeight: '600' },
  searchRow: { flexDirection: 'row', gap: 10, width: '100%', maxWidth: 380, marginTop: 16 },
  searchInput: { flex: 1, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  searchButton: { width: 50, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  searchingFor: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  equivMeta: { fontSize: 13, marginTop: 2 },
  aisleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },

  resultContainer: { flex: 1 },
  resultContent: { padding: 20, paddingBottom: 40 },
  resultImage: { width: '100%', height: 200, borderRadius: 16, marginBottom: 16 },
  resultCard: { borderRadius: 20, padding: 20, borderWidth: 1 },
  productName: { fontSize: 22, fontWeight: '700' },
  productBrand: { fontSize: 13, marginTop: 4 },
  description: { fontSize: 14, lineHeight: 20, marginTop: 10, marginBottom: 6 },
  matchRow: { paddingVertical: 10 },
  matchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 },
  matchName: { flex: 1, fontSize: 15, fontWeight: '700' },
  matchPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  matchPillText: { fontSize: 12, fontWeight: '700' },
  scoreCircle: {
    width: 96, height: 96, borderRadius: 48, alignSelf: 'center',
    justifyContent: 'center', alignItems: 'center', marginVertical: 20,
  },
  scoreNumber: { fontSize: 32, fontWeight: '800' },
  scoreLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  section: { padding: 14, borderRadius: 12, marginTop: 10, borderWidth: 1 },
  sectionLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5 },
  sectionText: { fontSize: 14, lineHeight: 20 },
  findStoresButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 16, borderRadius: 14, marginTop: 16,
  },
  findStoresText: { fontWeight: '700', fontSize: 15 },
  scanAgainButton: { padding: 14, borderRadius: 14, alignItems: 'center', marginTop: 10, borderWidth: 1 },
  scanAgainText: { fontWeight: '600', fontSize: 14 },
});
