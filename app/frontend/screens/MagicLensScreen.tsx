import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { residenceName, residenceInText } from '../lib/residence';
import { typo } from '../theme/typography';
import { useTheme } from '../theme/ThemeContext';
import { apiFetchJson } from '../lib/api';
import { Alert } from '../lib/alert';
import ErrorCard from '../components/ErrorCard';
import { describeError, FriendlyError } from '../lib/errors';
import { countryName } from '../lib/countries';
import ScanProgress, { recordScanDuration } from '../components/ScanProgress';
import SaveButton from '../components/SaveButton';
import { BudgetTag, BestMatchTag, BestValueTag, bestValueIndex } from '../components/ProductTags';

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
  difference?: string | null;
  budget?: string | null;
  price_hint?: string | null;
  image_url?: string | null;   // Open Food Facts photo, looked up by the backend
  image_exact?: boolean;       // false = unbranded photo of the same kind of product
};

type ProductSearchResult = {
  id?: string;           // history row id (present when signed in) — used for bookmarking
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
  id?: string;
  budget?: string | null;
  price_hint?: string | null;
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

export default function MagicLensScreen({ navigation, route }: { navigation?: any; route?: any }) {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search by name: a product from any country -> its versions where the user lives.
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [searchResult, setSearchResult] = useState<ProductSearchResult | null>(null);
  const [lastQuery, setLastQuery] = useState('');
  const [lastAction, setLastAction] = useState<'scan' | 'search'>('scan');
  // Bookmark state of the result on screen (true when reopened from History as saved).
  const [savedFlag, setSavedFlag] = useState(false);

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
            living_country: residenceName(profile?.residence_country),
          },
        }),
      });
      recordScanDuration(Date.now() - startedAt, 'search');
      setSearchDone(true);
      await new Promise(r => setTimeout(r, 400));
      setSavedFlag(false);
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
            living_country: residenceName(profile?.residence_country),
          },
        }),
      });
      recordScanDuration(Date.now() - startedAt);
      // Let the bar visibly reach 100% before swapping in the result.
      setScanDone(true);
      await new Promise(r => setTimeout(r, 400));
      setSavedFlag(false);
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

  // Entry points from other tabs: Home's search box (searchQuery) and History (openHistory).
  // requestedAt makes repeat requests with the same payload re-trigger.
  useEffect(() => {
    const p = route?.params;
    if (!p) return;
    if (p.searchQuery) {
      setResult(null);
      setSearchResult(null);
      runSearch(p.searchQuery);
    } else if (p.openHistory) {
      const h = p.openHistory;
      setError(null);
      setSavedFlag(!!h.saved);
      if (h.source === 'search') {
        setResult(null);
        setSearchResult({ ...h.result, id: h.id, us_equivalents: h.result.us_equivalents || [] });
      } else {
        setSearchResult(null);
        setCapturedImage(h.image || null);
        setResult({ ...h.result, id: h.id });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.requestedAt]);

  if (searchResult) {
    return (
      <ProductSearchResultView
        result={searchResult}
        saved={savedFlag}
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
        saved={savedFlag}
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
    <SafeAreaView style={[styles.pickContainer, { backgroundColor: colors.bgApp }]} edges={['top']}>
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
          <View style={[styles.pickIcon, { backgroundColor: colors.accentSubtle }]}>
            <MaterialCommunityIcons name="camera-outline" size={44} color={colors.accentIcon} />
          </View>
          <Text style={[styles.pickTitle, { color: colors.textPrimary }]}>Magic Lens</Text>
          <Text style={[styles.pickText, { color: colors.textSecondary }]}>
            Take or upload a photo of any grocery product and I'll translate it to your home cuisine.
          </Text>
          <TouchableOpacity
            style={[styles.pickButton, { backgroundColor: colors.actionPrimary }]}
            onPress={() => fileInputRef.current?.click()}
          >
            <MaterialCommunityIcons name="image-plus" size={18} color={colors.onActionPrimary} />
            <Text style={[styles.pickButtonText, { color: colors.onActionPrimary }]}>Take or upload a photo</Text>
          </TouchableOpacity>
          <Text style={[styles.pickHint, { color: colors.textSecondary }]}>
            Tip: get the label in frame and in focus.
          </Text>

          {/* Search by name */}
          <View style={styles.orRow}>
            <View style={[styles.orLine, { backgroundColor: colors.borderDefault }]} />
            <Text style={[styles.orText, { color: colors.textSecondary }]}>or search by name</Text>
            <View style={[styles.orLine, { backgroundColor: colors.borderDefault }]} />
          </View>
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.searchInput, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault, color: colors.textPrimary }]}
              placeholder="e.g. mascarpone, gochujang, queso fresco"
              placeholderTextColor={colors.textPlaceholder}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => runSearch()}
              returnKeyType="search"
              accessibilityLabel="Search a product from any country"
            />
            <TouchableOpacity
              style={[styles.searchButton, { backgroundColor: colors.actionPrimary, opacity: query.trim() ? 1 : 0.5 }]}
              onPress={() => runSearch()}
              disabled={!query.trim()}
              accessibilityLabel="Find the local version"
            >
              <MaterialCommunityIcons name="magnify" size={22} color={colors.onActionPrimary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.pickHint, { color: colors.textSecondary }]}>
            A product from any country — I'll find its version in {residenceInText(profile?.residence_country)}.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ProductSearchResultView({
  result, saved, onReset, onFindStores, colors,
}: {
  result: ProductSearchResult; saved: boolean; onReset: () => void; onFindStores: () => void; colors: any;
}) {
  const { profile } = useAuth();
  const { tones, matchTone } = useTheme();
  const valueIdx = bestValueIndex(result.us_equivalents);
  return (
    <SafeAreaView style={[styles.resultContainer, { backgroundColor: colors.bgApp }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.resultCard, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}>
          <View style={styles.titleRow}>
            <Text style={[styles.productName, { color: colors.textPrimary, flex: 1 }]}>{result.product_name || result.query}</Text>
            <SaveButton id={result.id} saved={saved} />
          </View>
          {!!result.origin_country && (
            <Text style={[styles.productBrand, { color: colors.textSecondary }]}>From {result.origin_country}</Text>
          )}
          {!!result.description && (
            <Text style={[styles.description, { color: colors.textSecondary }]}>{result.description}</Text>
          )}

        </View>

        {/* One card per local version, with a product photo */}
        {result.us_equivalents.length > 0 ? (
          <>
            <Text style={[styles.cardsHeading, { color: colors.textSecondary }]}>Versions in {residenceInText(profile?.residence_country)}</Text>
            {result.us_equivalents.map((e, i) => (
              <View key={`${e.name}-${i}`} style={[styles.equivCard, { backgroundColor: colors.bgSurface, borderColor: i === 0 ? colors.matchBorder : colors.borderDefault }]}>
                <View style={styles.equivTop}>
                  <View>
                    {e.image_url ? (
                      <Image source={{ uri: e.image_url }} style={[styles.equivPhoto, { borderColor: colors.borderSubtle, backgroundColor: colors.photoMat }]} resizeMode="contain" accessibilityLabel={`${e.brand ? e.brand + ' ' : ''}${e.name}`} />
                    ) : (
                      <View style={[styles.equivPhoto, styles.equivPhotoEmpty, { backgroundColor: colors.accentSubtle, borderColor: colors.borderSubtle }]}>
                        <MaterialCommunityIcons name="basket-outline" size={28} color={colors.accentIcon} />
                      </View>
                    )}
                    {!!e.image_url && !e.image_exact && (
                      <Text style={[styles.photoNote, { color: colors.textSecondary }]}>Similar product</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.matchName, { color: colors.textPrimary }]}>{e.name}</Text>
                    {!!e.brand && <Text style={[styles.equivMeta, { color: colors.textAccent }]}>{e.brand}</Text>}
                    <View style={[styles.matchPill, { backgroundColor: matchTone(e.match_score).bg, alignSelf: 'flex-start', marginTop: 6 }]}>
                      <Text style={[styles.matchPillText, { color: matchTone(e.match_score).text }]}>{e.match_score}% match</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.tagRow}>
                  {i === 0 && result.us_equivalents.length > 1 && <BestMatchTag />}
                  {valueIdx === i && <BestValueTag />}
                  <BudgetTag budget={e.budget} />
                </View>
                {!!e.price_hint && (
                  <Text style={[styles.equivMeta, { color: colors.textSecondary }]}>~{e.price_hint} (estimate)</Text>
                )}
                {!!e.aisle && (
                  <View style={styles.aisleRow}>
                    <MaterialCommunityIcons name="map-marker" size={13} color={colors.textSecondary} />
                    <Text style={[styles.equivMeta, { color: colors.textSecondary }]}>{e.aisle}</Text>
                  </View>
                )}
                {!!e.difference && (
                  <Text style={[styles.sectionText, { color: colors.textPrimary, marginTop: 6 }]}>How it differs: {e.difference}</Text>
                )}
                {!!e.tip && <Text style={[styles.sectionText, { color: colors.textSecondary, marginTop: 4 }]}>{e.tip}</Text>}
              </View>
            ))}
            <Text style={[styles.photoCredit, { color: colors.textSecondary }]}>Product photos: Open Food Facts</Text>
          </>
        ) : (
          <View style={[styles.equivCard, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}>
            <Text style={[styles.sectionText, { color: colors.textSecondary }]}>
              I couldn't find a version of this sold in {residenceInText(profile?.residence_country)}.
            </Text>
          </View>
        )}

        {!!result.ai_tip && (
          <View style={[styles.section, { backgroundColor: colors.highlightBg, borderColor: tones.highlight.border, marginTop: 0 }]}>
            <Text style={[styles.sectionLabel, { color: colors.highlightText }]}>💡 AI tip</Text>
            <Text style={[styles.sectionText, { color: colors.highlightText }]}>{result.ai_tip}</Text>
          </View>
        )}

        {result.us_equivalents.length > 0 && (
          <TouchableOpacity style={[styles.findStoresButton, { backgroundColor: colors.actionPrimary }]} onPress={onFindStores}>
            <MaterialCommunityIcons name="store-marker" size={18} color={colors.onActionPrimary} />
            <Text style={[styles.findStoresText, { color: colors.onActionPrimary }]}>Find in a store</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.scanAgainButton, { borderColor: colors.borderDefault }]} onPress={onReset}>
          <Text style={[styles.scanAgainText, { color: colors.textPrimary }]}>Search or scan another</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function ScanResultView({
  result, saved, image, homeCountry, onReset, onFindStores, colors,
}: {
  result: ScanResult; saved: boolean; image: string | null; homeCountry: string; onReset: () => void; onFindStores?: () => void; colors: any;
}) {
  const { tones, matchTone } = useTheme();
  const overall = matchTone(result.match_score);
  const matches = result.home_matches || [];

  return (
    <SafeAreaView style={[styles.resultContainer, { backgroundColor: colors.bgApp }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false}>
        {image && <Image source={{ uri: image }} style={styles.resultImage} />}

        <View style={[styles.resultCard, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}>
          <View style={styles.titleRow}>
            <Text style={[styles.productName, { color: colors.textPrimary, flex: 1 }]}>{result.detected_product}</Text>
            <SaveButton id={result.id} saved={saved} />
          </View>
          {!!result.detected_brand && (
            <Text style={[styles.productBrand, { color: colors.textSecondary }]}>
              {result.detected_brand}{result.brand_origin ? ` (${result.brand_origin})` : ''}
            </Text>
          )}
          {(!!result.budget || !!result.price_hint) && (
            <View style={[styles.tagRow, { marginTop: 8 }]}>
              <BudgetTag budget={result.budget} />
              {!!result.price_hint && (
                <Text style={[styles.equivMeta, { color: colors.textSecondary }]}>~{result.price_hint} (estimate)</Text>
              )}
            </View>
          )}
          {!!result.description && (
            <Text style={[styles.description, { color: colors.textSecondary }]}>{result.description}</Text>
          )}

          {matches.length > 0 ? (
            <View style={[styles.section, { backgroundColor: colors.bgApp, borderColor: colors.borderDefault }]}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                Similar from {homeCountry || 'home'}
              </Text>
              {matches.map((m, i) => (
                <View
                  key={`${m.name}-${i}`}
                  style={[styles.matchRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.borderDefault }]}
                >
                  <View style={styles.matchHeader}>
                    <Text style={[styles.matchName, { color: colors.textPrimary }]}>{m.name}</Text>
                    <View style={[styles.matchPill, { backgroundColor: matchTone(m.match_score).bg }]}>
                      <Text style={[styles.matchPillText, { color: matchTone(m.match_score).text }]}>{m.match_score}% match</Text>
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
              <View style={[styles.scoreCircle, { backgroundColor: overall.fill }]}>
                <Text style={[styles.scoreNumber, { color: overall.onFill }]}>{result.match_score}</Text>
                <Text style={[styles.scoreLabel, { color: overall.onFill }]}>match</Text>
              </View>
              <View style={[styles.section, { backgroundColor: colors.bgApp, borderColor: colors.borderDefault }]}>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>For your cuisine</Text>
                <Text style={[styles.sectionText, { color: colors.textPrimary }]}>{result.cultural_equivalent}</Text>
              </View>
            </>
          )}

          <View style={[styles.section, { backgroundColor: colors.highlightBg, borderColor: tones.highlight.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.highlightText }]}>💡 AI tip</Text>
            <Text style={[styles.sectionText, { color: colors.highlightText }]}>{result.ai_tip}</Text>
          </View>

          {result.can_make_at_home && !!result.home_recipe_summary && (
            <View style={[styles.section, { backgroundColor: colors.highlightBg, borderColor: tones.highlight.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.highlightText }]}>🏠 Make it at home</Text>
              <Text style={[styles.sectionText, { color: colors.highlightText }]}>{result.home_recipe_summary}</Text>
            </View>
          )}
        </View>

        {onFindStores && (
          <TouchableOpacity style={[styles.findStoresButton, { backgroundColor: colors.actionPrimary }]} onPress={onFindStores}>
            <MaterialCommunityIcons name="store-marker" size={18} color={colors.onActionPrimary} />
            <Text style={[styles.findStoresText, { color: colors.onActionPrimary }]}>Find in a store</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.scanAgainButton, { borderColor: colors.borderDefault }]} onPress={onReset}>
          <Text style={[styles.scanAgainText, { color: colors.textPrimary }]}>Scan another</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  cardsHeading: { ...typo.heading, marginTop: 18, marginBottom: 8, marginLeft: 4 },
  equivCard: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12 },
  equivTop: { flexDirection: 'row', gap: 12 },
  equivPhoto: { width: 84, height: 84, borderRadius: 12, borderWidth: 1 },
  equivPhotoEmpty: { alignItems: 'center', justifyContent: 'center' },
  photoNote: { ...typo.pill, marginTop: 3, textAlign: 'center', width: 84 },
  photoCredit: { ...typo.caption, textAlign: 'center', marginBottom: 6 },
  pickContainer: { flex: 1 },
  pickBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  pickIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center' },
  pickPreview: { width: 220, height: 220, borderRadius: 16 },
  pickTitle: { ...typo.display, marginTop: 20 },
  pickText: { ...typo.body, textAlign: 'center', marginTop: 8, maxWidth: 360 },
  pickButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 24,
  },
  pickButtonText: { ...typo.label },
  pickHint: { ...typo.caption, marginTop: 14, textAlign: 'center' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', maxWidth: 380, marginTop: 32 },
  orLine: { flex: 1, height: 1 },
  orText: { ...typo.caption },
  searchRow: { flexDirection: 'row', gap: 10, width: '100%', maxWidth: 380, marginTop: 16 },
  searchInput: { ...typo.body, flex: 1, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13 },
  searchButton: { width: 50, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  searchingFor: { ...typo.heading, marginBottom: 4 },
  equivMeta: { ...typo.caption, marginTop: 2 },
  aisleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },

  resultContainer: { flex: 1 },
  resultContent: { padding: 20, paddingBottom: 40 },
  resultImage: { width: '100%', height: 200, borderRadius: 16, marginBottom: 16 },
  resultCard: { borderRadius: 20, padding: 20, borderWidth: 1 },
  productName: { ...typo.title },
  productBrand: { ...typo.caption, marginTop: 4 },
  description: { ...typo.body, marginTop: 10, marginBottom: 6 },
  matchRow: { paddingVertical: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 4 },
  matchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 },
  matchName: { ...typo.title, flex: 1 },
  matchPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  matchPillText: { ...typo.pill },
  scoreCircle: {
    width: 96, height: 96, borderRadius: 48, alignSelf: 'center',
    justifyContent: 'center', alignItems: 'center', marginVertical: 20,
  },
  scoreNumber: { ...typo.display },
  scoreLabel: { ...typo.pill },
  section: { padding: 14, borderRadius: 12, marginTop: 10, borderWidth: 1 },
  sectionLabel: { ...typo.label, marginBottom: 6 },
  sectionText: { ...typo.body },
  findStoresButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 16, borderRadius: 14, marginTop: 16,
  },
  findStoresText: { ...typo.label },
  scanAgainButton: { padding: 14, borderRadius: 14, alignItems: 'center', marginTop: 10, borderWidth: 1 },
  scanAgainText: { ...typo.label },
});
