import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { COUNTRY_GROUPS, COUNTRIES } from '../lib/countries';

// Searchable country dropdown (flag + name, grouped by world region) plus optional region
// chips. Shared by onboarding and the Profile "change home country" sheet.
export default function CountryPicker({
  countryId, region, onChangeCountry, onChangeRegion,
}: {
  countryId: string;
  region: string;
  onChangeCountry: (id: string) => void;
  onChangeRegion: (region: string) => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(!countryId);
  const [query, setQuery] = useState('');
  const selected = COUNTRIES.find(c => c.id === countryId);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_GROUPS;
    return COUNTRY_GROUPS
      .map(g => ({ ...g, countries: g.countries.filter(c => c.name.toLowerCase().includes(q)) }))
      .filter(g => g.countries.length > 0);
  }, [query]);

  const pick = (id: string) => {
    if (id !== countryId) {
      onChangeCountry(id);
      onChangeRegion('');
    }
    setOpen(false);
    setQuery('');
  };

  return (
    <View>
      {/* Dropdown field */}
      <TouchableOpacity
        onPress={() => setOpen(o => !o)}
        style={[styles.field, { backgroundColor: colors.bgSurface, borderColor: open ? colors.actionPrimary : colors.borderDefault }]}
        accessibilityRole="button"
        accessibilityLabel={selected ? `Home country: ${selected.name}. Change` : 'Choose your home country'}
      >
        {selected ? (
          <>
            <Text style={styles.fieldFlag}>{selected.flag}</Text>
            <Text style={[styles.fieldText, { color: colors.textPrimary }]}>{selected.name}</Text>
          </>
        ) : (
          <Text style={[styles.fieldText, { color: colors.textSecondary }]}>Choose your home country</Text>
        )}
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textSecondary} />
      </TouchableOpacity>

      {/* Dropdown panel */}
      {open && (
        <View style={[styles.panel, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}>
          <View style={[styles.search, { borderColor: colors.borderDefault }]}>
            <MaterialCommunityIcons name="magnify" size={18} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Search countries"
              placeholderTextColor={colors.textPlaceholder}
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
            {!!query && (
              <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search">
                <MaterialCommunityIcons name="close-circle" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {groups.length === 0 && (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>No countries match “{query}”.</Text>
            )}
            {groups.map(group => (
              <View key={group.name}>
                <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{group.name.toUpperCase()}</Text>
                {group.countries.map(c => {
                  const sel = c.id === countryId;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => pick(c.id)}
                      style={[styles.row, sel && { backgroundColor: colors.accentSubtle }]}
                    >
                      <Text style={styles.rowFlag}>{c.flag}</Text>
                      <Text style={[styles.rowText, { color: sel ? colors.textAccent : colors.textPrimary }]}>{c.name}</Text>
                      {sel && <MaterialCommunityIcons name="check" size={18} color={colors.accentIcon} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Region chips */}
      {!open && selected && selected.regions.length > 0 && (
        <View style={styles.regionSection}>
          <Text style={[styles.groupLabel, { color: colors.textSecondary, paddingHorizontal: 0 }]}>REGION (OPTIONAL)</Text>
          <View style={styles.regionList}>
            {selected.regions.map(r => {
              const sel = region === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={[styles.regionChip, {
                    backgroundColor: sel ? colors.actionPrimary : colors.bgSurface,
                    borderColor: sel ? colors.actionPrimary : colors.borderDefault,
                  }]}
                  onPress={() => onChangeRegion(sel ? '' : r)}
                >
                  <Text style={{ color: sel ? colors.onActionPrimary : colors.textPrimary, fontWeight: sel ? '700' : '500', fontSize: 13 }}>{r}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
  },
  fieldFlag: { fontSize: 22 },
  fieldText: { flex: 1, fontSize: 16, fontWeight: '600' },
  panel: { marginTop: 8, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, borderBottomWidth: 1,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15 },
  list: { maxHeight: 340 },
  groupLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  rowFlag: { fontSize: 20 },
  rowText: { flex: 1, fontSize: 15 },
  empty: { padding: 20, textAlign: 'center', fontSize: 14 },
  regionSection: { marginTop: 18 },
  regionList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  regionChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
});
