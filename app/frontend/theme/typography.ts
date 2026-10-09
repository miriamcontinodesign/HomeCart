// HomeCart typography tokens — the only place font families, sizes and weights live.
//
// Fonts load from Google Fonts in public/index.html (display=swap):
//   - Fraunces 600 (SOFT 100, optical size follows the font size) — headings only
//   - DM Sans 400 / 500 — body and UI
//   - Noto Sans — fallback for scripts the two don't cover (Korean, Arabic, Devanagari…)
//
// Rules: Fraunces only for display/title/heading, never for buttons, inputs, pills or body
// text. Sentence case everywhere (no all-caps). Body text is at least 15px, nothing below 11px.
// Sizes are rem so the app follows the user's browser/system text size (1rem = 16px default).

const rem = (px: number) => `${px / 16}rem`;

export const fonts = {
  heading: "'Fraunces', 'Noto Serif', Georgia, serif",
  body: "'DM Sans', 'Noto Sans', system-ui, sans-serif",
} as const;

type TypeToken = {
  fontFamily: string;
  fontSize: number;      // a rem string at runtime; typed as number for React Native's TextStyle
  lineHeight: number;
  fontWeight: '400' | '500' | '600';
};

const token = (family: string, size: number, lineHeight: number, fontWeight: TypeToken['fontWeight']): TypeToken =>
  ({ fontFamily: family, fontSize: rem(size) as unknown as number, lineHeight: rem(lineHeight) as unknown as number, fontWeight });

export const typo = {
  display: token(fonts.heading, 28, 34, '600'),     // screen titles
  title: token(fonts.heading, 22, 28, '600'),       // product names on cards
  heading: token(fonts.heading, 17, 24, '600'),     // section and list item titles
  body: token(fonts.body, 15, 22, '400'),           // descriptions, AI answers, typed input text
  bodyStrong: token(fonts.body, 15, 22, '500'),     // emphasis inside body
  label: token(fonts.body, 13, 18, '500'),          // buttons, input labels, chips, nav labels
  caption: token(fonts.body, 12, 16, '400'),        // metadata, helper text
  pill: token(fonts.body, 11, 14, '500'),           // match %, tags
} as const;

export type TypeName = keyof typeof typo;
