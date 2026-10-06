import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { tokens } from '../theme/colors';
import { API_URL } from '../lib/api';

// The Render free tier sleeps after 15 idle minutes and takes ~30-60s to wake. Ping
// /healthz as soon as the app loads so the server is warm by the time the user scans or
// imports a recipe, and show a small corner pill while it wakes. Stays hidden when the
// server answers quickly (already awake).

const SHOW_AFTER_MS = 1200;   // don't flash the pill if the server is already up
const RETRY_EVERY_MS = 5000;
// Render can hold a request open while it boots, and mobile browsers may not time it out
// for minutes — cap each ping so one hung request can't keep the pill up forever.
const REQUEST_TIMEOUT_MS = 15000;
const GIVE_UP_AFTER_MS = 120000;

type Status = 'checking' | 'waking' | 'ready' | 'hidden';

export default function ServerWakeIndicator() {
  const { colors } = useTheme();
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;
    const started = Date.now();
    const showTimer = setTimeout(() => {
      if (!cancelled) setStatus(s => (s === 'checking' ? 'waking' : s));
    }, SHOW_AFTER_MS);
    // Absolute deadline, independent of any in-flight request.
    const giveUpTimer = setTimeout(() => {
      cancelled = true;
      controller?.abort();
      setStatus('hidden');  // give up quietly; screens show their own errors
    }, GIVE_UP_AFTER_MS);

    const ping = async () => {
      while (!cancelled && Date.now() - started < GIVE_UP_AFTER_MS) {
        controller = new AbortController();
        const abortTimer = setTimeout(() => controller?.abort(), REQUEST_TIMEOUT_MS);
        try {
          const res = await fetch(`${API_URL}/healthz`, { cache: 'no-store', signal: controller.signal });
          if (res.ok) {
            if (cancelled) return;
            clearTimeout(giveUpTimer);
            setStatus(s => (s === 'waking' ? 'ready' : 'hidden'));
            setTimeout(() => !cancelled && setStatus('hidden'), 1500);
            return;
          }
        } catch {
          // Server still asleep, gateway error, or this attempt timed out — retry below.
        } finally {
          clearTimeout(abortTimer);
        }
        await new Promise(r => setTimeout(r, RETRY_EVERY_MS));
      }
    };
    ping();

    return () => {
      cancelled = true;
      controller?.abort();
      clearTimeout(showTimer);
      clearTimeout(giveUpTimer);
    };
  }, []);

  if (status !== 'waking' && status !== 'ready') return null;

  return (
    <View
      pointerEvents="none"
      accessibilityRole="progressbar"
      accessibilityLabel={status === 'waking' ? 'Waking up the server' : 'Server ready'}
      style={[styles.pill, { backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }]}
    >
      {status === 'waking'
        ? <ActivityIndicator size="small" color={colors.accentIcon} />
        : <MaterialCommunityIcons name="check-circle" size={16} color={colors.matchFill} />}
      <Text style={[styles.text, { color: colors.textSecondary }]}>
        {status === 'waking' ? 'Waking up server…' : 'Ready'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Bottom-right, clear of the 90px tab bar.
  pill: {
    position: 'absolute', right: 16, bottom: 104, zIndex: 50,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
    shadowColor: tokens.shadow, shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  text: { fontSize: 12, fontWeight: '600' },
});
