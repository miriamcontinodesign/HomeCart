import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { API_URL } from '../lib/api';

// The Render free tier sleeps after 15 idle minutes and takes ~30-60s to wake. Ping
// /healthz as soon as the app loads so the server is warm by the time the user scans or
// imports a recipe, and show a small corner pill while it wakes. Stays hidden when the
// server answers quickly (already awake).

const SHOW_AFTER_MS = 1200;   // don't flash the pill if the server is already up
const RETRY_EVERY_MS = 5000;
const GIVE_UP_AFTER_MS = 120000;

type Status = 'checking' | 'waking' | 'ready' | 'hidden';

export default function ServerWakeIndicator() {
  const { colors } = useTheme();
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();
    const showTimer = setTimeout(() => {
      if (!cancelled) setStatus(s => (s === 'checking' ? 'waking' : s));
    }, SHOW_AFTER_MS);

    const ping = async () => {
      while (!cancelled && Date.now() - started < GIVE_UP_AFTER_MS) {
        try {
          const res = await fetch(`${API_URL}/healthz`, { cache: 'no-store' });
          if (res.ok) {
            if (cancelled) return;
            setStatus(s => (s === 'waking' ? 'ready' : 'hidden'));
            setTimeout(() => !cancelled && setStatus('hidden'), 1500);
            return;
          }
        } catch {
          // Server still asleep (connection refused / gateway error) — retry below.
        }
        await new Promise(r => setTimeout(r, RETRY_EVERY_MS));
      }
      if (!cancelled) setStatus('hidden');  // give up quietly; screens show their own errors
    };
    ping();

    return () => { cancelled = true; clearTimeout(showTimer); };
  }, []);

  if (status !== 'waking' && status !== 'ready') return null;

  return (
    <View
      pointerEvents="none"
      accessibilityRole="progressbar"
      accessibilityLabel={status === 'waking' ? 'Waking up the server' : 'Server ready'}
      style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {status === 'waking'
        ? <ActivityIndicator size="small" color={colors.primary} />
        : <MaterialCommunityIcons name="check-circle" size={16} color={colors.scoreHigh} />}
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
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  text: { fontSize: 12, fontWeight: '600' },
});
