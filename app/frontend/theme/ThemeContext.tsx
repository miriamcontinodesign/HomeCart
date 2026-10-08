import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { themes, toneForScore, ThemeColors, ThemeMode, Tone, Tones } from './colors';

// Light is the default for everyone. Visitors can pick Dark, or System (follows the browser's
// `prefers-color-scheme`), in Profile → Appearance; that choice is saved in localStorage and
// mirrored as `data-theme="light|dark"` on <html>. A `data-theme` already on the page is
// honoured when nothing is saved.

export type ThemePreference = 'system' | ThemeMode;

interface ThemeContextValue {
  colors: ThemeColors;
  tones: Tones;
  matchTone: (score: number) => Tone;
  mode: ThemeMode;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const STORAGE_KEY = 'homecart_theme';

function initialPreference(): ThemePreference {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {}
  try {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
  } catch {}
  return 'light';
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const system = useColorScheme();   // tracks prefers-color-scheme on web, live
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const mode: ThemeMode = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    try { window.localStorage.setItem(STORAGE_KEY, p); } catch {}
  }, []);

  // Keep the page itself (overscroll, scrollbars, native form controls) in step with the app.
  useEffect(() => {
    try {
      const root = document.documentElement;
      if (preference === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', preference);
      root.style.colorScheme = mode;
      document.body.style.backgroundColor = themes[mode].colors.bgApp;
    } catch {}
  }, [preference, mode]);

  const value = useMemo<ThemeContextValue>(() => {
    const { colors, tones } = themes[mode];
    return { colors, tones, matchTone: (score: number) => toneForScore(tones, score), mode, preference, setPreference };
  }, [mode, preference, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
};
