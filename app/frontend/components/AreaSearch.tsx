import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { Area, AreaSuggestion, searchAreas, resolveArea, getDeviceLocation } from '../lib/area';

// City / ZIP type-ahead that resolves to coordinates. Optionally offers "Use my current
// location". Shared by onboarding, Profile → Your area, and the map's location sheet.
export default function AreaSearch({
  onPick, allowCurrentLocation = true, placeholder = 'City or ZIP code, e.g. Jersey City',
  autoFocus,
}: {
  onPick: (area: Area) => void;
  allowCurrentLocation?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AreaSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const latest = useRef('');

  // Debounced type-ahead; ignores responses for stale queries.
  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    setMessage(null);
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchAreas(q);
        if (latest.current === q) setResults(r);
        if (latest.current === q && r.length === 0) setMessage('No matching city or ZIP code.');
      } catch {
        if (latest.current === q) setMessage("Couldn't search right now. Try again in a moment.");
      } finally {
        if (latest.current === q) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const pick = async (s: AreaSuggestion) => {
    setResolvingId(s.place_id);
    try {
      onPick(await resolveArea(s));
      setQuery('');
      setResults([]);
    } catch {
      setMessage("Couldn't load that place. Try another.");
    } finally {
      setResolvingId(null);
    }
  };

  const useCurrent = async () => {
    setLocating(true);
    setMessage(null);
    const a = await getDeviceLocation();
    setLocating(false);
    if (a) onPick(a);
    else setMessage('Location is off or blocked. Allow it in your browser settings, or type a city instead.');
  };

  return (
    <View>
      {allowCurrentLocation && (
        <TouchableOpacity
          onPress={useCurrent}
          disabled={locating}
          style={[styles.gpsButton, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}
          accessibilityRole="button"
        >
          {locating
            ? <ActivityIndicator color={colors.accentIcon} />
            : <MaterialCommunityIcons name="crosshairs-gps" size={20} color={colors.accentIcon} />}
          <Text style={[styles.gpsText, { color: colors.textPrimary }]}>
            {locating ? 'Finding you…' : 'Use my current location'}
          </Text>
        </TouchableOpacity>
      )}

      <View style={[styles.inputWrap, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}>
        <MaterialCommunityIcons name="magnify" size={18} color={colors.textSecondary} />
        <TextInput
          style={[styles.input, { color: colors.textPrimary }]}
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor={colors.textPlaceholder}
          autoCorrect={false}
          autoFocus={autoFocus}
          accessibilityLabel="Search a city or ZIP code"
        />
        {searching && <ActivityIndicator size="small" color={colors.accentIcon} />}
      </View>

      {results.map(r => (
        <TouchableOpacity
          key={r.place_id}
          onPress={() => pick(r)}
          style={[styles.result, { borderBottomColor: colors.borderSubtle }]}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="map-marker-outline" size={18} color={colors.accentIcon} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.resultLabel, { color: colors.textPrimary }]}>{r.label}</Text>
            {!!r.address && r.address !== r.label && (
              <Text style={[styles.resultAddress, { color: colors.textSecondary }]} numberOfLines={1}>{r.address}</Text>
            )}
          </View>
          {resolvingId === r.place_id && <ActivityIndicator size="small" color={colors.accentIcon} />}
        </TouchableOpacity>
      ))}

      {!!message && <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  gpsButton: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  gpsText: { fontSize: 15, fontWeight: '600' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  input: { flex: 1, minWidth: 0, paddingVertical: 12, fontSize: 15 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1 },
  resultLabel: { fontSize: 15, fontWeight: '600' },
  resultAddress: { fontSize: 12, marginTop: 2 },
  message: { fontSize: 13, marginTop: 10 },
});
