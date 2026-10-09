import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { typo } from '../theme/typography';
import { useTheme } from '../theme/ThemeContext';
import { useServerStatus } from '../context/ServerStatusContext';

// Inline "waking up the server" banner: a row of emojis fills in one by one like a progress
// bar while the free-tier backend boots — a little shopping trip from search to cart — then
// flips to a short "Ready" state.
// Renders nothing once the server is up (or if it answered straight away).

const FOODS = ['🔍', '🧺', '🍅', '🥖', '🧀', '🌶️', '🥫', '🛒'];
const STEP_MS = 450;

export default function ServerWakeBanner({ style }: { style?: any }) {
  const { colors } = useTheme();
  const status = useServerStatus();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (status !== 'waking') return;
    const t = setInterval(() => setStep(s => (s + 1) % (FOODS.length + 1)), STEP_MS);
    return () => clearInterval(t);
  }, [status]);

  if (status !== 'waking' && status !== 'ready') return null;
  const ready = status === 'ready';

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
      accessibilityLabel={ready ? 'Server ready' : 'Waking up the server'}
      style={[
        styles.banner,
        { backgroundColor: ready ? colors.matchBg : colors.highlightBg, borderColor: ready ? colors.matchBorder : colors.borderDefault },
        style,
      ]}
    >
      <View style={styles.foods} importantForAccessibility="no-hide-descendants">
        {FOODS.map((f, i) => (
          <Text key={f} style={[styles.food, { opacity: ready || i < step ? 1 : 0.2 }]}>{f}</Text>
        ))}
      </View>
      <Text style={[styles.title, { color: ready ? colors.matchText : colors.highlightText }]}>
        {ready ? 'All set!' : 'Stocking the shelves…'}
      </Text>
      {!ready && (
        <Text style={[styles.sub, { color: colors.highlightText }]}>
          Our free server naps when it's quiet — waking it takes about 30 seconds.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  foods: { flexDirection: 'row', gap: 6 },
  food: { fontSize: 22 },
  title: { ...typo.bodyStrong, marginTop: 8 },
  sub: { ...typo.caption, marginTop: 2, textAlign: 'center' },
});
