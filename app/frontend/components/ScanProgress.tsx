import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// Progress bar for a Magic Lens scan. The backend gives no progress events, so the bar is
// time-based: it eases toward ~95% over the *expected* scan time and only reaches 100% when
// the result arrives (`done`). The expected time is a running average of this browser's
// real scans, so the "seconds left" estimate gets realistic after a scan or two.

type Variant = 'scan' | 'search';

// Each variant learns its own typical duration (a text search is faster than reading a photo).
const TIMING: Record<Variant, { key: string; defaultMs: number }> = {
  scan: { key: 'homecart_scan_ms', defaultMs: 12000 },     // free-model scan, reasoning disabled
  search: { key: 'homecart_search_ms', defaultMs: 6000 },
};
const MIN_MS = 3000;
const MAX_MS = 90000;

function expectedMs(variant: Variant): number {
  try {
    const v = Number(window.localStorage.getItem(TIMING[variant].key));
    if (v > 0) return Math.min(MAX_MS, Math.max(MIN_MS, v));
  } catch { /* storage blocked — use the default */ }
  return TIMING[variant].defaultMs;
}

// Blend each successful run into the estimate (recent runs weigh more).
export function recordScanDuration(ms: number, variant: Variant = 'scan'): void {
  try {
    const next = Math.round(0.6 * expectedMs(variant) + 0.4 * ms);
    window.localStorage.setItem(TIMING[variant].key, String(Math.min(MAX_MS, Math.max(MIN_MS, next))));
  } catch { /* ignore */ }
}

export default function ScanProgress({
  done, homeCountry, variant = 'scan',
}: { done: boolean; homeCountry: string; variant?: Variant }) {
  const { colors } = useTheme();
  const expected = useRef(expectedMs(variant)).current;
  const started = useRef(Date.now()).current;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setElapsed(Date.now() - started), 250);
    return () => clearInterval(t);
  }, [done, started]);

  // ~87% at the expected time, creeping toward 95% after that.
  const eased = 0.95 * (1 - Math.exp((-2.5 * elapsed) / expected));
  const progress = done ? 1 : eased;
  const remainingS = Math.ceil((expected - elapsed) / 1000);
  const slow = elapsed > expected * 1.5;

  const stage = done ? 'Done!'
    : variant === 'search'
      ? (progress < 0.35 ? 'Looking up the product…' : progress < 0.75 ? 'Finding local versions…' : 'Almost there…')
      : (progress < 0.12 ? 'Uploading photo…'
        : progress < 0.45 ? 'Reading the label…'
        : progress < 0.75 ? `Finding matches from ${homeCountry || 'home'}…`
        : 'Almost there…');

  const hint = done ? ' '
    : slow ? 'Taking longer than usual — free AI models can be slow.'
    : remainingS > 1 ? `About ${remainingS} seconds left`
    : 'Just a moment…';

  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
      <Text style={[styles.stage, { color: colors.textPrimary }]}>{stage}</Text>
      <View style={[styles.track, { backgroundColor: colors.borderDefault }]}>
        <View
          style={[
            styles.fill,
            { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.actionPrimary },
            // CSS transition smooths the 250ms steps on web.
            { transitionProperty: 'width', transitionDuration: done ? '250ms' : '300ms' } as any,
          ]}
        />
      </View>
      <Text style={[styles.hint, { color: slow ? colors.highlightText : colors.textSecondary }]}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 320, alignItems: 'center', marginTop: 24 },
  stage: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  track: { width: '100%', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 14 },
  fill: { height: '100%', borderRadius: 4 },
  hint: { fontSize: 13, marginTop: 10, textAlign: 'center' },
});
