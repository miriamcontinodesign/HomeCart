// HomeCart palette
//   sky-blue-light   #8ECAE6   blue-green  #219EBC   deep-space-blue  #023047
//   amber-flame      #FFB703   princeton-orange  #FB8500
// Roles were picked for WCAG contrast: in dark mode, accent fills carry deep-space-blue text
// (≥4.4:1, sky 7.7:1); in light mode no palette color passes both "as text on white" and
// "behind dark text", so the accent is a deeper blue-green (#16768C) with white text (`onPrimary`).
// Red stays as the error color — the palette has no red and errors need to read as errors.

export const palette = {
  sky: '#8ECAE6',
  blueGreen: '#219EBC',
  deepSpace: '#023047',
  amber: '#FFB703',
  orange: '#FB8500',
};

export const darkColors = {
  // Backgrounds
  bg: '#011D2B',           // a shade below deep-space-blue
  surface: palette.deepSpace,  // cards, sheets
  surfaceElevated: '#073B55',  // modals, dropdowns
  border: '#0D4763',
  borderSubtle: '#155572',

  // Text
  textPrimary: '#F2F9FC',
  textSecondary: '#A8CFE0',
  textTertiary: '#7AA3B6',
  textInverse: '#011D2B',

  // Accents
  primary: palette.sky,
  primarySubtle: 'rgba(142, 202, 230, 0.14)',
  onPrimary: palette.deepSpace,   // text/icons on primary, score and badge fills

  // Match score colors
  scoreHigh: palette.blueGreen,  // 75-100
  scoreMid: palette.amber,       // 50-74
  scoreLow: palette.orange,      // 0-49

  // Cultural authenticity highlight ("specialty store" badges)
  cultural: palette.amber,
  culturalSubtle: 'rgba(255, 183, 3, 0.14)',

  // Status
  success: palette.blueGreen,
  warning: palette.amber,
  error: '#F87171',

  // Camera/scan overlay
  scanOverlay: 'rgba(1, 29, 43, 0.6)',
  scanFrame: palette.sky,
};

export const lightColors = {
  bg: '#FFFFFF',
  surface: '#F2F8FB',
  surfaceElevated: '#FFFFFF',
  border: '#D3E6EF',
  borderSubtle: '#E6F1F6',
  textPrimary: palette.deepSpace,
  textSecondary: '#3E6377',
  textTertiary: '#557686',
  textInverse: '#FFFFFF',
  primary: '#16768C',             // deeper blue-green: 5.2:1 on white, white text on it 5.2:1
  primarySubtle: 'rgba(33, 158, 188, 0.12)',
  onPrimary: '#FFFFFF',
  scoreHigh: '#16768C',
  scoreMid: '#8F5E00',
  scoreLow: '#C2410C',
  cultural: '#C2410C',
  culturalSubtle: 'rgba(251, 133, 0, 0.12)',
  success: '#16768C',
  warning: '#8F5E00',
  error: '#DC2626',
  scanOverlay: 'rgba(255, 255, 255, 0.6)',
  scanFrame: '#16768C',
};

export type ThemeColors = typeof darkColors;
