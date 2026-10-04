// First-launch gate for the BYOK-only build. The LinkedIn-shareable APK
// embeds EXPO_PUBLIC_BYOK_ONLY=true; without a user-supplied LLM key the
// /scan and /recipe calls will fail, so we block the main UI behind this
// screen and route the user straight into Settings.

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import SettingsScreen from './SettingsScreen';

interface Props {
  onConfigured: () => void;  // called when user saves a key + dismisses settings
}

export default function ByokOnboardingScreen({ onConfigured }: Props) {
  const { colors } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primarySubtle }]}>
          <MaterialCommunityIcons name="key-variant" size={48} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.textPrimary }]}>Bring your own key</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          This build of HomeCart needs you to supply your own LLM API key. Scans and recipe imports
          run on your account — your costs, your model choice, no shared quota.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>What you'll need</Text>
          <Row icon="check-circle" text="An API key from OpenRouter, OpenAI, or Anthropic" colors={colors} />
          <Row icon="check-circle" text="~30 seconds to paste it into Settings" colors={colors} />
          <Row icon="check-circle" text="A few cents of credits to play with" colors={colors} />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Quickest path</Text>
          <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
            <Text style={{ fontWeight: '700' }}>OpenRouter</Text> is the easiest — one key works with
            Claude, GPT, Gemini, DeepSeek and 300+ others. $5 of credits will last you weeks.
          </Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://openrouter.ai/keys')}>
            <Text style={[styles.link, { color: colors.primary }]}>Get an OpenRouter key →</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.privacy, { color: colors.textTertiary }]}>
          Your key is saved only in this browser and is never stored on HomeCart's server. Don't save it on a shared computer.
          They are sent only as headers on the specific API call that needs them. The backend never
          logs or persists them.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.bg }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: colors.primary }]}
          onPress={() => setSettingsOpen(true)}
        >
          <MaterialCommunityIcons name="cog" size={20} color="#fff" />
          <Text style={styles.ctaText}>Configure keys</Text>
        </TouchableOpacity>
      </View>

      <SettingsScreen
        visible={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          onConfigured();  // parent re-checks key state; gate falls if a key was saved
        }}
      />
    </SafeAreaView>
  );
}

function Row({ icon, text, colors }: { icon: any; text: string; colors: any }) {
  return (
    <View style={styles.row}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.primary} />
      <Text style={[styles.rowText, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, alignItems: 'stretch' },
  iconWrap: {
    width: 88, height: 88, borderRadius: 44,
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center', marginTop: 12, marginBottom: 20,
  },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: 28 },
  card: { padding: 18, borderRadius: 14, borderWidth: 1, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  cardBody: { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  rowText: { fontSize: 13, flex: 1, lineHeight: 18 },
  link: { fontSize: 13, fontWeight: '600' },
  privacy: { fontSize: 11, lineHeight: 16, marginTop: 16, textAlign: 'center', paddingHorizontal: 8 },
  footer: { padding: 20, paddingBottom: 28, borderTopWidth: 1 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 16, borderRadius: 14,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
