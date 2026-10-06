// HomeCart design tokens — the only place hex values live.
//
// Two layers:
//   1. `palette`  — the raw colour scales. Components never use these directly.
//   2. `tokens`   — semantic roles that map onto the palette. Components read these through
//                   `useTheme().colors` (see theme/ThemeContext.tsx).
//
// Accessibility rules (WCAG AA), checked when the roles were chosen:
//   - White text only on orange-600 or darker (white on orange-600 = 4.53:1).
//   - lime-500, saffron-500 and orange-500 fills always take dark text (neutral-900).
//   - Coloured text on light backgrounds uses the 900 stop of that colour.
//   - accent/icon (orange-500) is for icons only and never sits behind text. It reaches 3:1
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
} as const;

const { orange, saffron, lime, neutral } = palette;

export const tokens = {
  // Backgrounds & borders
  bgApp: neutral[50],               // bg/app
  bgSurface: neutral[0],            // bg/surface — cards, sheets, tab bar
  borderDefault: neutral[200],      // border/default
  borderSubtle: neutral[100],

  // Text
  textPrimary: neutral[900],        // text/primary
  textSecondary: neutral[600],      // text/secondary
  textPlaceholder: neutral[400],    // text/placeholder — placeholders only (3.4:1), never body text
  textAccent: orange[900],          // coloured text (links, brand names) on light backgrounds

  // Actions & accents
  actionPrimary: orange[600],       // action/primary — buttons, selected chips, active segments
  onActionPrimary: neutral[0],      // white text/icons on action/primary
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

  // Status (the palette has no red; errors use the orange 900 stop for text)
  errorText: orange[900],
  errorBg: orange[50],

  // Misc
  shadow: neutral[900],
  scrim: 'rgba(43, 27, 20, 0.5)',   // neutral-900 at 50% — behind modal sheets
  mapUserDot: lime[500],
  mapUserDotRing: neutral[0],
} as const;

export type ThemeColors = typeof tokens;

// A colour "tone" bundles the four ways a palette colour can appear while still meeting the
// rules above: a light chip (bg + 900 text), a solid fill (500 + neutral-900 text), and a border.
export type Tone = { bg: string; text: string; fill: string; onFill: string; border: string };

export const tones = {
  match: { bg: lime[50], text: lime[900], fill: lime[500], onFill: neutral[900], border: lime[300] },
  highlight: { bg: saffron[50], text: saffron[900], fill: saffron[500], onFill: neutral[900], border: saffron[300] },
  low: { bg: orange[50], text: orange[900], fill: orange[500], onFill: neutral[900], border: orange[300] },
  neutral: { bg: neutral[100], text: neutral[900], fill: neutral[200], onFill: neutral[900], border: neutral[200] },
} satisfies Record<string, Tone>;

// Match scores: ≥75 lime (good match), 50–74 saffron, below 50 orange.
export function matchTone(score: number): Tone {
  return score >= 75 ? tones.match : score >= 50 ? tones.highlight : tones.low;
}
