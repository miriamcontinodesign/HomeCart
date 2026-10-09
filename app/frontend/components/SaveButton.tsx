import React, { useEffect, useState } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { typo } from '../theme/typography';
import { useTheme } from '../theme/ThemeContext';
import { supabase } from '../lib/supabase';
import { Alert } from '../lib/alert';

// Bookmark toggle for a history entry (a row in `scans`). Optimistic: flips immediately and
// rolls back if the update fails. RLS (users_own_scans) limits updates to the user's rows.
export default function SaveButton({
  id, saved: initial, compact, onChange,
}: {
  id?: string | null;
  saved?: boolean;
  compact?: boolean;          // icon only (history rows)
  onChange?: (saved: boolean) => void;
}) {
  const { colors } = useTheme();
  const [saved, setSaved] = useState(!!initial);
  useEffect(() => setSaved(!!initial), [initial]);

  if (!id) return null;  // not signed in / not persisted — nothing to bookmark

  const toggle = async () => {
    const next = !saved;
    setSaved(next);
    const { error } = await supabase.from('scans').update({ saved: next }).eq('id', id);
    if (error) {
      setSaved(!next);
      Alert.alert('Could not update', error.message);
    } else {
      onChange?.(next);
    }
  };

  const icon = (
    <MaterialCommunityIcons
      name={saved ? 'bookmark' : 'bookmark-outline'}
      size={compact ? 22 : 18}
      color={colors.accentIcon}
    />
  );

  return compact ? (
    <TouchableOpacity
      onPress={toggle}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={saved ? 'Remove from saved' : 'Save product'}
      accessibilityState={{ selected: saved }}
    >
      {icon}
    </TouchableOpacity>
  ) : (
    <TouchableOpacity
      onPress={toggle}
      style={[styles.pill, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
    >
      {icon}
      <Text style={[styles.pillText, { color: colors.textPrimary }]}>{saved ? 'Saved' : 'Save'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
  },
  pillText: { ...typo.label },
});
