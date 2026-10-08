// HomeCart design tokens — the only place hex values live.
//
// Three layers:
//   1. `palette`  — the raw colour scales. Components never use these directly.
//   2. `themes`   — semantic roles (bgApp, actionPrimary, match*…) per mode, light and dark,
//                   mapped onto the palette.
//   3. `tones`    — bundles of bg/text/fill/border for chips, pills and tags, per mode.
// Components read the active mode's values through `useTheme()` (theme/ThemeContext.tsx):
// `colors`, `tones` and `matchTone(score)`.
//
// Accessibility rules (WCAG AA), checked when the roles were chosen:
//   - White text only on orange-600 or darker (white on orange-600 = 4.53:1) — both modes.
//   - lime-500, saffron-500 and orange-500 fills always take dark text.
//   - Coloured text on a tinted background uses that tint's paired text token
//     (light: the 900 stop on the 50 tint; dark: the 100 stop on the deep tint).
//   - accent/icon is for icons only and never sits behind text. In light mode it reaches 3:1
//     on bg/surface (white) but only 2.86:1 on bg/app (cream) — keep meaningful icons on
//     surfaces/cards.

export const palette = {
  orange: {
    50: '#FDEEE4', 100: '#FAD2B8', 300: '#F39A5E', 500: '#E8641F',
    600: '#C9500F', 700: '#A3410C', 900: '#5A230A',
  },
  saffron: {
    50: '#FEF4DF', 100: '#FDE2AE', 300: '#F9C463', 500: '#F5A623', 700: '#C27F0F', 900: '#6A4508',
  },
  lime: {
    50: '#F2F9E3', 100: '#DDEFB4', 300: '#A8D35C', 500: '#7CB518', 700: '#5B8711', 900: '#2F4708',
  },
  neutral: {
    0: '#FFFFFF', 50: '#F6ECDC', 100: '#F2E6D3', 200: '#D2BFA3', 400: '#9A8775', 600: '#5C4A3D', 900: '#2B1B14',
  },
  // Dark mode ("Charcoal"): warm greys, plus deep tints of the brand colours for tinted
  // backgrounds (the dark-mode counterpart of the 50 stops).
  charcoal: {
    50: '#F5F2EC', 300: '#B5B1A8', 400: '#7A776F', 600: '#34332F', 700: '#2A2926', 800: '#1F1F1D', 900: '#141413', 950: '#0B0B0A',
  },
  deep: { orange: '#3A2114', saffron: '#33280F', lime: '#223010' },
} as const;

const { orange, saffron, lime, neutral, charcoal, deep } = palette;

const light = {
  // Backgrounds & borders
  bgApp: neutral[50],               // bg/app
  bgSurface: neutral[0],            // bg/surface — cards, inputs, sheets, tab bar
  bgMuted: neutral[100],            // bg/muted — low-emphasis chips
  bgDesk: neutral[200],             // behind the phone-shaped frame on tablet/desktop
  borderDefault: neutral[200],      // border/default
  borderSubtle: neutral[100],

  // Text
  textPrimary: neutral[900],        // text/primary
  textSecondary: neutral[600],      // text/secondary
  textPlaceholder: neutral[400],    // text/placeholder — placeholders only, never body text
  textAccent: orange[900],          // coloured text (links, brand names)

  // Actions & accents
  actionPrimary: orange[600],       // action/primary — buttons, selected chips, active segments
  onActionPrimary: neutral[0],      // action/on-primary — white text/icons on action/primary
  accentIcon: orange[500],          // accent/icon — icons, active nav, bookmarks; never behind text
  accentSubtle: orange[50],         // tinted backdrop behind accent icons / subtle chips

  // Highlight — best value, tips, AI answers
  highlightBg: saffron[50],
  highlightText: saffron[900],
  highlightFill: saffron[500],
  onHighlightFill: neutral[900],

  // Match / success — match %, in stock
  matchFill: lime[500],
  onMatchFill: neutral[900],
  matchBg: lime[50],
  matchText: lime[900],
  matchBorder: lime[300],

  // Status (the palette has no red; errors use the orange text stop)
  errorText: orange[900],
  errorBg: orange[50],

  // Misc
  shadow: neutral[900],
  scrim: 'rgba(43, 27, 20, 0.5)',   // neutral-900 at 50% — behind modal sheets
  frameShadow: 'rgba(43, 27, 20, 0.35)', // the phone frame's drop shadow on tablet/desktop
  mapUserDot: lime[500],
  mapUserDotRing: neutral[0],
  photoMat: neutral[0],             // white mat behind product photos (packshots are shot on white)
};

export type ThemeColors = { [K in keyof typeof light]: string };

const dark: ThemeColors = {
  bgApp: charcoal[900],
  bgSurface: charcoal[800],
  bgMuted: charcoal[700],
  bgDesk: charcoal[950],
  borderDefault: charcoal[600],
  borderSubtle: charcoal[700],

  textPrimary: charcoal[50],
  textSecondary: charcoal[300],
  textPlaceholder: charcoal[400],
  textAccent: orange[300],

  actionPrimary: orange[600],
  onActionPrimary: neutral[0],
  accentIcon: orange[300],
  accentSubtle: deep.orange,

  highlightBg: deep.saffron,
  highlightText: saffron[100],
  highlightFill: saffron[500],
  onHighlightFill: charcoal[900],

  matchFill: lime[500],
  onMatchFill: charcoal[900],
  matchBg: deep.lime,
  matchText: lime[100],
  matchBorder: lime[700],

  errorText: orange[300],
  errorBg: deep.orange,

  shadow: '#000000',
  scrim: 'rgba(0, 0, 0, 0.6)',
  frameShadow: 'rgba(0, 0, 0, 0.7)',
  mapUserDot: lime[500],
  mapUserDotRing: neutral[0],
  photoMat: neutral[0],
};

// A colour "tone" bundles the ways a palette colour can appear while still meeting the rules
// above: a tinted chip (bg + paired text), a solid fill (500 + dark text), and a border.
export type Tone = { bg: string; text: string; fill: string; onFill: string; border: string };
export type Tones = { match: Tone; highlight: Tone; low: Tone; neutral: Tone };

const lightTones: Tones = {
  match: { bg: lime[50], text: lime[900], fill: lime[500], onFill: neutral[900], border: lime[300] },
  highlight: { bg: saffron[50], text: saffron[900], fill: saffron[500], onFill: neutral[900], border: saffron[300] },
  low: { bg: orange[50], text: orange[900], fill: orange[500], onFill: neutral[900], border: orange[300] },
  neutral: { bg: neutral[100], text: neutral[900], fill: neutral[200], onFill: neutral[900], border: neutral[200] },
};

const darkTones: Tones = {
  match: { bg: deep.lime, text: lime[100], fill: lime[500], onFill: charcoal[900], border: lime[700] },
  highlight: { bg: deep.saffron, text: saffron[100], fill: saffron[500], onFill: charcoal[900], border: saffron[700] },
  low: { bg: deep.orange, text: orange[100], fill: orange[500], onFill: charcoal[900], border: orange[700] },
  neutral: { bg: charcoal[700], text: charcoal[50], fill: charcoal[600], onFill: charcoal[50], border: charcoal[600] },
};

export type ThemeMode = 'light' | 'dark';

export const themes: Record<ThemeMode, { colors: ThemeColors; tones: Tones }> = {
  light: { colors: light, tones: lightTones },
  dark: { colors: dark, tones: darkTones },
};

// Match scores: ≥75 lime (good match), 50–74 saffron, below 50 orange.
export function toneForScore(tones: Tones, score: number): Tone {
  return score >= 75 ? tones.match : score >= 50 ? tones.highlight : tones.low;
}
