import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { typo } from '../theme/typography';
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
    <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.accentSubtle }]}>
        <MaterialCommunityIcons name={ICONS[error.kind]} size={26} color={colors.accentIcon} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{error.title}</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>{error.message}</Text>
      <View style={styles.actions}>
        {error.retryable && onRetry && (
          <TouchableOpacity style={[styles.primary, { backgroundColor: colors.actionPrimary }]} onPress={onRetry}>
            <MaterialCommunityIcons name="refresh" size={16} color={colors.onActionPrimary} />
            <Text style={[styles.primaryText, { color: colors.onActionPrimary }]}>Try again</Text>
          </TouchableOpacity>
        )}
        {onDismiss && (
          <TouchableOpacity style={[styles.secondary, { borderColor: colors.borderDefault }]} onPress={onDismiss}>
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
  title: { ...typo.heading, marginTop: 12, textAlign: 'center' },
  message: { ...typo.body, marginTop: 6, textAlign: 'center', maxWidth: 380 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12,
  },
  primaryText: { ...typo.label },
  secondary: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  secondaryText: { ...typo.label },
});
