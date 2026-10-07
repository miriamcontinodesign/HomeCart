import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Linking, Modal,
} from 'react-native';
import {
  APIProvider, Map, AdvancedMarker, AdvancedMarkerAnchorPoint, ColorScheme, useMap,
} from '@vis.gl/react-google-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AreaSearch from '../components/AreaSearch';
import { Alert } from '../lib/alert';
import { Area, FALLBACK_AREA, getDeviceLocation, loadTempArea, saveTempArea, profileArea } from '../lib/area';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { matchTone, tones, tokens } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

interface Store {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  rating?: number;
  rating_count?: number;
  distance_km: number;
  chain_name?: string | null;
  cuisines: string[];
  authenticity_tier?: number;
  notes?: string;
  store_types?: string[];
  is_preferred?: boolean;
  is_specialty: boolean;
  cultural_score: number;
  final_score: number;
  coverage_matched?: number;
  coverage_total?: number;
  coverage_items?: string[];
}

interface MapRegion {
  latitude: number;
  longitude: number;
}

// Browser key for the Maps JavaScript API. Distinct from the backend's GOOGLE_MAPS_API_KEY:
// this one ships to every visitor, so it must be HTTP-referrer-restricted to our domains.
const MAPS_BROWSER_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || '';
// Advanced markers require a Map ID. DEMO_MAP_ID works for development; create a real one
// in Cloud Console → Map Management for production.
const MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';
const STORE_ZOOM = 15;
const USER_ZOOM = 13;

type Padding = { top: number; right: number; bottom: number; left: number };

interface NeededItem {
  name: string;
  preferred_store_types: string[];
}

interface ProductContext {
  availability_breadth?: 'mainstream' | 'specialty_only' | 'both';
  preferred_store_types?: string[];
  needed_items?: NeededItem[];
}

interface MapScreenProps {
  route?: {
    params?: {
      cuisine?: string;
      productName?: string;
      product_context?: ProductContext;
      // Tab to return to from the banner's back button (the scan result / recipe stay mounted).
      returnTo?: 'MagicLens' | 'List';
    };
  };
  navigation?: any;
}

// JS port of the backend's haversine — used to decide when the user has panned far
// enough from the last fetched center to surface "Search this area".
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function MapScreen(props: MapScreenProps) {
  const { colors } = useTheme();
  if (!MAPS_BROWSER_KEY) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bgApp, padding: 32 }]}>
        <MaterialCommunityIcons name="map-marker-off-outline" size={40} color={colors.textSecondary} />
        <Text style={[styles.hintTitle, { color: colors.textPrimary }]}>Map not configured</Text>
        <Text style={[styles.hintBody, { color: colors.textSecondary }]}>
          Set EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY in the frontend .env and restart.
        </Text>
      </View>
    );
  }
  return (
    <APIProvider apiKey={MAPS_BROWSER_KEY}>
      <MapScreenInner {...props} />
    </APIProvider>
  );
}

function MapScreenInner({ route, navigation }: MapScreenProps) {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const params = route?.params;
  // Opening the Map tab directly (no params) shows stores for the user's home cuisine.
  const cuisine = params?.cuisine ?? profile?.home_country ?? undefined;
  const productName = params?.productName;
  const productContext = params?.product_context;
  const returnTo = params?.returnTo;

  const map = useMap();
  // fetchStores runs before the map instance exists on first load, so read it through a ref.
  const mapRef = useRef<google.maps.Map | null>(null);
  mapRef.current = map;
  // Where searches start from: a temporary area (holiday), GPS, the saved "Your area", or the
  // fallback — see lib/area.ts. userLocation is only the GPS fix, for the "you are here" dot.
  const [origin, setOrigin] = useState<{ area: Area; kind: 'temp' | 'gps' | 'home' | 'default' } | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [areaSheetOpen, setAreaSheetOpen] = useState(false);
  const homeArea = profileArea(profile);
  const [mapRegion, setMapRegion] = useState<MapRegion | null>(null);
  const [lastFetchedCenter, setLastFetchedCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [showSearchHere, setShowSearchHere] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showStoreList, setShowStoreList] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Set while the map moves on its own (auto-fit to results) so the resulting idle event
  // doesn't count as the user panning away and pop up "Search this area".
  const programmaticMove = useRef(false);

  const fitTo = (points: { lat: number; lon: number }[], padding: Padding) => {
    if (!mapRef.current || points.length === 0) return;
    programmaticMove.current = true;
    // If the bounds already fit, no idle event fires — don't swallow the user's next pan.
    setTimeout(() => { programmaticMove.current = false; }, 1500);
    const bounds = new google.maps.LatLngBounds();
    points.forEach(p => bounds.extend({ lat: p.lat, lng: p.lon }));
    mapRef.current.fitBounds(bounds, padding);
  };

  const panTo = (lat: number, lon: number, zoom: number) => {
    if (!mapRef.current) return;
    mapRef.current.panTo({ lat, lng: lon });
    mapRef.current.setZoom(zoom);
  };

  const fetchStores = useCallback(
    async (lat: number, lon: number, cuisine?: string, pc?: ProductContext) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const body: any = { lat, lon, cuisine: cuisine ?? null };
        if (pc && (pc.availability_breadth || (pc.preferred_store_types && pc.preferred_store_types.length))) {
          body.product_context = pc;
        }
        const r = await apiFetch('/stores/nearby', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const txt = await r.text();
          throw new Error(`Server ${r.status}: ${txt.slice(0, 100)}`);
        }
        const data = await r.json();
        const newStores: Store[] = data.stores || [];
        setStores(newStores);
        setLastFetchedCenter({ lat, lon });
        setShowSearchHere(false);
        if (newStores.length === 0) {
          setErrorMsg('No stores found nearby. Try panning the map to a busier area and tap Search this area.');
        } else {
          // Auto-fit: backend searches a 10km radius, but the initial viewport is ~5km,
          // so specialty results often land off-screen on first load. Frame them so the
          // user sees something without having to pan + "Search this area".
          setTimeout(() => {
            fitTo([...newStores, { lat, lon }], { top: insets.top + 130, right: 60, bottom: 160, left: 60 });
          }, 100);
        }
      } catch (e: any) {
        console.error('Stores fetch failed:', e);
        setErrorMsg(e.message || 'Failed to load stores');
        setStores([]);
      } finally {
        setLoading(false);
      }
    },
    [insets.top],
  );

  // On mount: pick the starting area (temporary > GPS > saved area > fallback).
  useEffect(() => {
    (async () => {
      const temp = loadTempArea();
      let next: { area: Area; kind: 'temp' | 'gps' | 'home' | 'default' };
      if (temp) {
        next = { area: temp, kind: 'temp' };
      } else {
        const gps = await getDeviceLocation();
        if (gps) {
          setUserLocation({ lat: gps.lat, lon: gps.lon });
          next = { area: gps, kind: 'gps' };
        } else {
          const home = profileArea(profile);
          next = home ? { area: home, kind: 'home' } : { area: FALLBACK_AREA, kind: 'default' };
        }
      }
      setOrigin(next);
      setMapRegion({ latitude: next.area.lat, longitude: next.area.lon });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the user sets or changes "Your area" in Profile, follow it — unless they're using GPS
  // or a temporary area on purpose.
  useEffect(() => {
    if (!homeArea || !origin || (origin.kind !== 'home' && origin.kind !== 'default')) return;
    if (origin.area.lat === homeArea.lat && origin.area.lon === homeArea.lon) return;
    setOrigin({ area: homeArea, kind: 'home' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeArea?.lat, homeArea?.lon]);

  // Search on first open, whenever the starting area changes, and every time we're navigated
  // here with a new product or recipe (the tab stays mounted).
  useEffect(() => {
    if (!origin) return;
    setSelectedStore(null);
    setShowStoreList(false);
    panTo(origin.area.lat, origin.area.lon, USER_ZOOM);
    fetchStores(origin.area.lat, origin.area.lon, cuisine, productContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, params]);

  const chooseArea = (area: Area) => {
    setAreaSheetOpen(false);
    if (area.current) {
      saveTempArea(null);
      setUserLocation({ lat: area.lat, lon: area.lon });
      setOrigin({ area, kind: 'gps' });
    } else {
      saveTempArea(area);   // temporary: this browser only, until cleared
      setOrigin({ area, kind: 'temp' });
    }
  };

  const clearTemporary = () => {
    saveTempArea(null);
    setAreaSheetOpen(false);
    setOrigin(homeArea ? { area: homeArea, kind: 'home' } : { area: FALLBACK_AREA, kind: 'default' });
  };

  const onMapIdle = () => {
    const center = mapRef.current?.getCenter();
    if (!center) return;
    const region = { latitude: center.lat(), longitude: center.lng() };
    setMapRegion(region);
    if (programmaticMove.current) {
      programmaticMove.current = false;
      return;
    }
    if (!lastFetchedCenter) return;
    const moved = haversineKm(region.latitude, region.longitude, lastFetchedCenter.lat, lastFetchedCenter.lon);
    if (moved > 1) setShowSearchHere(true);
  };

  const onSearchThisArea = async () => {
    if (!mapRegion) return;
    setShowSearchHere(false);
    await fetchStores(mapRegion.latitude, mapRegion.longitude, cuisine, productContext);
  };

  // Crosshair button: switch to the device's current location (asks for permission if needed).
  const onRecenter = async () => {
    const gps = await getDeviceLocation();
    if (!gps) {
      Alert.alert('Location unavailable', 'Allow location for this site in your browser settings, or tap the location at the top of the map to pick a city.');
      return;
    }
    chooseArea(gps);
  };

  // Fit the map to all current stores, leaving room at the bottom for the open list sheet
  // so markers don't get hidden under it.
  const fitToAllStores = useCallback(() => {
    if (stores.length === 0) return;
    fitTo(origin ? [...stores, origin.area] : stores, { top: insets.top + 120, right: 60, bottom: 560, left: 60 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores, origin, insets.top]);

  // Pan to a single store and open its detail sheet. Used from the list rows.
  const focusOnStore = useCallback((store: Store) => {
    setShowStoreList(false);
    setSelectedStore(store);
    panTo(store.lat, store.lon, STORE_ZOOM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the user opens the store list modal, frame the map so all stores fit above the sheet.
  useEffect(() => {
    if (showStoreList) {
      // small delay so the modal layout settles first
      const t = setTimeout(fitToAllStores, 250);
      return () => clearTimeout(t);
    }
  }, [showStoreList, fitToAllStores]);

  // Pin colour by meaning rather than per-cuisine: specialty grocer, recommended for what
  // the user is looking for, or any other store.
  const pinTone = (s: Store) => {
    if (s.is_specialty) return { fill: tones.highlight.fill, text: tones.highlight.onFill };
    if (s.is_preferred) return { fill: colors.actionPrimary, text: colors.onActionPrimary };
    return { fill: tones.neutral.fill, text: tones.neutral.onFill };
  };

  if (!mapRegion) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bgApp }]}>
        <ActivityIndicator color={colors.accentIcon} size="large" />
      </View>
    );
  }

  const isRecipeFlow = !!productContext?.needed_items?.length;
  const totalNeeded = productContext?.needed_items?.length || 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.bgApp }]}>
      {/* Context banner (when navigated from scan/recipe). */}
      {productName && (
        <View style={[styles.bannerSafe, { paddingTop: insets.top + 8 }]}>
          <View style={[styles.contextBanner, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}>
            {!!returnTo && (
              <TouchableOpacity
                onPress={() => navigation?.navigate(returnTo)}
                style={[styles.backButton, { backgroundColor: colors.accentSubtle }]}
                accessibilityRole="button"
                accessibilityLabel={returnTo === 'MagicLens' ? 'Back to scan result' : 'Back to recipe'}
              >
                <MaterialCommunityIcons name="arrow-left" size={20} color={colors.accentIcon} />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, letterSpacing: 0.5 }}>FINDING STORES FOR</Text>
              <Text
                style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600', marginTop: 2 }}
                numberOfLines={2}
              >
                {productName}
              </Text>
            </View>
          </View>
        </View>
      )}

      <View style={StyleSheet.absoluteFillObject}>
        <Map
          style={{ width: '100%', height: '100%' }}
          defaultCenter={{ lat: mapRegion.latitude, lng: mapRegion.longitude }}
          defaultZoom={USER_ZOOM}
          mapId={MAP_ID}
          colorScheme={ColorScheme.LIGHT}
          onIdle={onMapIdle}
          disableDefaultUI
          gestureHandling="greedy"
        >
          {userLocation && (
            <AdvancedMarker
              position={{ lat: userLocation.lat, lng: userLocation.lon }}
              anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
              title="You are here"
              zIndex={0}
            >
              <View style={[styles.userDot, { backgroundColor: colors.mapUserDot, borderColor: colors.mapUserDotRing }]} />
            </AdvancedMarker>
          )}
          {stores.map(store => (
            <AdvancedMarker
              key={store.place_id}
              position={{ lat: store.lat, lng: store.lon }}
              onClick={() => setSelectedStore(store)}
              anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
              title={
                isRecipeFlow
                  ? `${store.name} · ${store.coverage_matched}/${store.coverage_total} items · ${store.distance_km.toFixed(1)} km`
                  : `${store.name} · Match ${Math.round(store.final_score)} · ${store.distance_km.toFixed(1)} km`
              }
            >
              <View
                style={[
                  styles.markerPin,
                  {
                    backgroundColor: pinTone(store).fill,
                    borderColor: colors.bgApp,
                  },
                  store.is_specialty && styles.markerSpecialty,
                ]}
              >
                <Text style={[styles.markerText, { color: pinTone(store).text }]}>
                  {isRecipeFlow ? store.coverage_matched : Math.round(store.final_score)}
                </Text>
              </View>
            </AdvancedMarker>
          ))}
        </Map>
      </View>

      {/* Where the search starts from — tap to change (temporary areas don't touch the profile) */}
      {origin && (
        <View style={[styles.areaChipRow, { top: productName ? insets.top + 92 : insets.top + 12 }]} pointerEvents="box-none">
          <TouchableOpacity
            onPress={() => setAreaSheetOpen(true)}
            style={[styles.areaChip, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}
            accessibilityRole="button"
            accessibilityLabel={`Searching near ${origin.area.label}. Change location`}
          >
            <MaterialCommunityIcons
              name={origin.kind === 'gps' ? 'crosshairs-gps' : 'map-marker'}
              size={16}
              color={colors.accentIcon}
            />
            <Text style={[styles.areaChipText, { color: colors.textPrimary }]} numberOfLines={1}>
              {origin.kind === 'gps' ? 'Near you' : origin.area.label}
            </Text>
            {origin.kind === 'temp' && (
              <Text style={[styles.areaChipTag, { color: colors.highlightText, backgroundColor: colors.highlightBg }]}>temporary</Text>
            )}
            <MaterialCommunityIcons name="chevron-down" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
          {origin.kind === 'temp' && (
            <TouchableOpacity
              onPress={clearTemporary}
              style={[styles.areaClear, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}
              accessibilityRole="button"
              accessibilityLabel="Clear temporary location"
            >
              <MaterialCommunityIcons name="close" size={16} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <Modal visible={areaSheetOpen} animationType="slide" transparent onRequestClose={() => setAreaSheetOpen(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: tokens.scrim }]}>
          <View style={[styles.areaSheet, { backgroundColor: colors.bgApp }]}>
            <View style={styles.areaSheetHeader}>
              <Text style={[styles.areaSheetTitle, { color: colors.textPrimary }]}>Search stores near…</Text>
              <TouchableOpacity onPress={() => setAreaSheetOpen(false)} accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.areaSheetSub, { color: colors.textSecondary }]}>
              Travelling? Pick any city — it's temporary and won't change your saved area.
            </Text>
            {homeArea && origin?.kind !== 'home' && (
              <TouchableOpacity
                onPress={clearTemporary}
                style={[styles.areaOption, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}
              >
                <MaterialCommunityIcons name="home-outline" size={20} color={colors.accentIcon} />
                <Text style={[styles.areaOptionText, { color: colors.textPrimary }]} numberOfLines={1}>
                  Back to my area · {homeArea.label}
                </Text>
              </TouchableOpacity>
            )}
            <AreaSearch onPick={chooseArea} placeholder="City or ZIP code, e.g. Rome" autoFocus />
          </View>
        </View>
      </Modal>

      {/* "Search this area" pill — appears after the user pans >1 km from the last fetched center */}
      {showSearchHere && !loading && (
        <TouchableOpacity
          onPress={onSearchThisArea}
          style={[
            styles.searchHere,
            {
              top: productName ? insets.top + 144 : insets.top + 64,
              backgroundColor: colors.actionPrimary,
            },
          ]}
        >
          <MaterialCommunityIcons name="magnify" size={16} color={colors.onActionPrimary} />
          <Text style={[styles.searchHereText, { color: colors.onActionPrimary }]}>Search this area</Text>
        </TouchableOpacity>
      )}

      {/* Recenter FAB — bottom-right above tab bar; hidden while the store sheet covers that spot */}
      {!selectedStore && (
      <TouchableOpacity
        onPress={onRecenter}
        style={[styles.fab, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}
      >
        <MaterialCommunityIcons name="crosshairs-gps" size={22} color={colors.accentIcon} />
      </TouchableOpacity>
      )}

      {/* Store detail bottom sheet (from marker tap) */}
      {selectedStore && (
        <View style={[styles.sheet, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}>
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>
                {selectedStore.name}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                {selectedStore.distance_km.toFixed(1)} km · {selectedStore.address.split(',').slice(0, 2).join(',')}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedStore(null)} style={styles.closeBtn}>
              <Text style={{ color: colors.textSecondary, fontSize: 26, lineHeight: 28 }}>×</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.scoreRow}>
            {isRecipeFlow ? (
              <View style={[styles.scorePill, { backgroundColor: matchTone(((selectedStore.coverage_matched || 0) / Math.max(1, selectedStore.coverage_total || 1)) * 100).bg }]}>
                <Text style={{ color: matchTone(((selectedStore.coverage_matched || 0) / Math.max(1, selectedStore.coverage_total || 1)) * 100).text, fontWeight: '700', fontSize: 13 }}>
                  {selectedStore.coverage_matched}/{selectedStore.coverage_total} items
                </Text>
              </View>
            ) : (
              <View style={[styles.scorePill, { backgroundColor: matchTone(selectedStore.final_score).bg }]}>
                <Text style={{ color: matchTone(selectedStore.final_score).text, fontWeight: '700', fontSize: 13 }}>
                  Match {Math.round(selectedStore.final_score)}
                </Text>
              </View>
            )}
            {selectedStore.is_specialty && (
              <View style={[styles.scorePill, { backgroundColor: colors.highlightFill }]}>
                <Text style={{ color: colors.onHighlightFill, fontWeight: '700', fontSize: 11, letterSpacing: 0.5 }}>
                  SPECIALTY
                </Text>
              </View>
            )}
            {selectedStore.is_preferred && !selectedStore.is_specialty && (
              <View style={[styles.scorePill, { backgroundColor: colors.accentSubtle }]}>
                <Text style={{ color: colors.textAccent, fontWeight: '700', fontSize: 11, letterSpacing: 0.5 }}>
                  RECOMMENDED
                </Text>
              </View>
            )}
            {selectedStore.rating != null && (
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                ⭐ {selectedStore.rating.toFixed(1)} ({selectedStore.rating_count})
              </Text>
            )}
          </View>

          {selectedStore.notes && (
            <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 10, lineHeight: 20 }}>
              {selectedStore.notes}
            </Text>
          )}

          <TouchableOpacity
            onPress={() =>
              Linking.openURL(
                `https://www.google.com/maps/dir/?api=1&destination=${selectedStore.lat},${selectedStore.lon}`,
              )
            }
            style={[styles.directionsBtn, { backgroundColor: colors.actionPrimary }]}
          >
            <Text style={{ color: colors.onActionPrimary, fontWeight: '600', fontSize: 15 }}>Get Directions</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Loading pill */}
      {loading && (
        <View style={[styles.loadingPill, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}>
          <ActivityIndicator color={colors.accentIcon} size="small" />
          <Text style={{ color: colors.textPrimary, marginLeft: 8, fontSize: 13 }}>Finding stores…</Text>
        </View>
      )}

      {/* Error toast (only when not loading and no sheet open) */}
      {!loading && !selectedStore && !showStoreList && errorMsg && (
        <View style={[styles.errorCard, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}>
          <Text style={{ color: colors.highlightText, fontSize: 13, fontWeight: '700', marginBottom: 4 }}>⚠️ Heads up</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>{errorMsg}</Text>
        </View>
      )}

      {/* Tappable count pill → opens store list sheet */}
      {!loading && !selectedStore && !showStoreList && !errorMsg && stores.length > 0 && (
        <TouchableOpacity
          onPress={() => setShowStoreList(true)}
          style={[styles.countPill, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}
        >
          <MaterialCommunityIcons name="format-list-bulleted" size={14} color={colors.textPrimary} />
          <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600', marginLeft: 6 }}>
            {stores.length} store{stores.length === 1 ? '' : 's'} {isRecipeFlow ? `· ${totalNeeded} items` : 'nearby'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Full store list sheet */}
      <Modal visible={showStoreList} animationType="slide" transparent onRequestClose={() => setShowStoreList(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.listSheet, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}>
            <View style={styles.listSheetHeader}>
              <View>
                <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>
                  {isRecipeFlow ? `Stores for ${totalNeeded} items` : `${stores.length} stores nearby`}
                </Text>
                {isRecipeFlow && (
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                    Ranked by ingredients covered
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setShowStoreList(false)} style={styles.closeBtn}>
                <Text style={{ color: colors.textSecondary, fontSize: 26, lineHeight: 28 }}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {stores.map(store => {
                const expanded = expandedRowId === store.place_id;
                const coveragePct = isRecipeFlow
                  ? ((store.coverage_matched || 0) / Math.max(1, store.coverage_total || 1)) * 100
                  : store.final_score;
                return (
                  <View
                    key={store.place_id}
                    style={[styles.listRow, { borderColor: colors.borderDefault }]}
                  >
                    <View style={styles.listRowMain}>
                      {/* Tap main row → close modal + pan map to this store + open detail sheet */}
                      <TouchableOpacity
                        onPress={() => focusOnStore(store)}
                        style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                      >
                        <View style={[styles.listMarker, { backgroundColor: pinTone(store).fill }]}>
                          <Text style={{ color: pinTone(store).text, fontSize: 11, fontWeight: '800' }}>
                            {isRecipeFlow ? store.coverage_matched : Math.round(store.final_score)}
                          </Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <View style={styles.listRowTitle}>
                            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                              {store.name}
                            </Text>
                            {isRecipeFlow && (
                              <Text style={{ color: matchTone(coveragePct).text, fontSize: 13, fontWeight: '700' }}>
                                {store.coverage_matched}/{store.coverage_total}
                              </Text>
                            )}
                          </View>
                          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                            {store.distance_km.toFixed(1)} km
                            {store.rating != null ? ` · ⭐ ${store.rating.toFixed(1)}` : ''}
                            {store.is_specialty ? ' · SPECIALTY' : ''}
                            {store.is_preferred && !store.is_specialty ? ' · RECOMMENDED' : ''}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      {/* Chevron is a SEPARATE tap target — toggles inline coverage breakdown without dismissing the list */}
                      {isRecipeFlow && (
                        <TouchableOpacity
                          onPress={() => setExpandedRowId(expanded ? null : store.place_id)}
                          style={styles.chevronBtn}
                        >
                          <MaterialCommunityIcons
                            name={expanded ? 'chevron-up' : 'chevron-down'}
                            size={22}
                            color={colors.textSecondary}
                          />
                        </TouchableOpacity>
                      )}
                    </View>

                    {isRecipeFlow && expanded && (
                      <View style={[styles.coverageExpand, { borderColor: colors.borderSubtle }]}>
                        {(store.coverage_items || []).map(item => (
                          <Text key={item} style={{ color: colors.textSecondary, fontSize: 13, paddingVertical: 3 }}>
                            ✓ {item}
                          </Text>
                        ))}
                        {(store.coverage_total || 0) > (store.coverage_matched || 0) && (
                          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6, fontStyle: 'italic' }}>
                            Missing {((store.coverage_total || 0) - (store.coverage_matched || 0))} item(s) — try a different store for those.
                          </Text>
                        )}
                      </View>
                    )}

                    {!isRecipeFlow && (
                      <TouchableOpacity
                        onPress={() =>
                          Linking.openURL(
                            `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lon}`,
                          )
                        }
                        style={[styles.dirChip, { backgroundColor: colors.accentSubtle }]}
                      >
                        <Text style={{ color: colors.textAccent, fontSize: 12, fontWeight: '600' }}>Directions →</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  areaChipRow: { position: 'absolute', left: 12, right: 12, zIndex: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  areaChip: {
    flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  areaChipText: { flexShrink: 1, fontSize: 13, fontWeight: '700' },
  areaChipTag: { fontSize: 11, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  areaClear: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  areaSheet: { maxHeight: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  areaSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  areaSheetTitle: { fontSize: 20, fontWeight: '800' },
  areaSheetSub: { fontSize: 13, lineHeight: 18, marginTop: 6, marginBottom: 16 },
  areaOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  areaOptionText: { flex: 1, fontSize: 15, fontWeight: '600' },
  bannerSafe: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  backButton: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchHere: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    gap: 6,
    zIndex: 8,
    shadowColor: tokens.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  searchHereText: { fontSize: 13, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 100,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: tokens.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    zIndex: 7,
  },
  hintTitle: { fontSize: 16, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  hintBody: { fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 19 },
  markerPin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  markerSpecialty: { borderWidth: 3 },
  markerText: { fontWeight: '800', fontSize: 12 },
  userDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 36,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  closeBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  scorePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  directionsBtn: { marginTop: 16, padding: 14, borderRadius: 12, alignItems: 'center' },
  loadingPill: {
    // bottom must clear the 90px tab bar (App.tsx) — 110 leaves a 20px gap.
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
  },
  errorCard: {
    position: 'absolute',
    bottom: 110,
    left: 16,
    right: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  countPill: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: tokens.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: tokens.scrim,
    justifyContent: 'flex-end',
  },
  listSheet: {
    height: '75%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 20,
    paddingBottom: 0,
  },
  listSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  listRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  listRowMain: { flexDirection: 'row', alignItems: 'center' },
  chevronBtn: { padding: 8, marginLeft: 4 },
  listMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listRowTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coverageExpand: {
    marginTop: 10,
    marginLeft: 48,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dirChip: {
    alignSelf: 'flex-start',
    marginLeft: 48,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
});
