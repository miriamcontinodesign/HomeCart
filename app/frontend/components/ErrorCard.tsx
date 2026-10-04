import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import type { FriendlyError } from '../lib/errors';

const ICONS: Record<FriendlyError['kind'], keyof typeof MaterialCommunityIcons.glyphMap> = {
  quota: 'timer-sand',
  busy: 'coffee-outline',
  offline: 'weather-night',
  unknown: 'alert-circle-outline',
};

export default function ErrorCard({
  error, onRetry, onDismiss,
}: {
  error: FriendlyError;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.primarySubtle }]}>
        <MaterialCommunityIcons name={ICONS[error.kind]} size={26} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{error.title}</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>{error.message}</Text>
      <View style={styles.actions}>
        {error.retryable && onRetry && (
          <TouchableOpacity style={[styles.primary, { backgroundColor: colors.primary }]} onPress={onRetry}>
            <MaterialCommunityIcons name="refresh" size={16} color="#fff" />
            <Text style={styles.primaryText}>Try again</Text>
          </TouchableOpacity>
        )}
        {onDismiss && (
          <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={onDismiss}>
            <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>Dismiss</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: 'center' },
  iconWrap: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: 'center', maxWidth: 380 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12,
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secondary: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  secondaryText: { fontWeight: '600', fontSize: 14 },
});
