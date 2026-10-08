// Where the user lives and shops now (profiles.residence_country). HomeCart adapts its AI
// answers, prices and wording to this country instead of assuming the US. Ids reuse the home
// country ids in lib/countries.ts, plus common destination countries that aren't on that list.
// Never rename an existing id: it is persisted in profiles.
import { COUNTRY_GROUPS, Country, CountryGroup } from './countries';
import type { Area } from './area';

export const DEFAULT_RESIDENCE = 'usa';   // profiles from before this field existed were all US

const EXTRA: Record<string, Country[]> = {
  Americas: [
    { id: 'usa', name: 'United States', flag: '🇺🇸', regions: [] },
    { id: 'canada', name: 'Canada', flag: '🇨🇦', regions: [] },
    { id: 'chile', name: 'Chile', flag: '🇨🇱', regions: [] },
  ],
  Europe: [
    { id: 'austria', name: 'Austria', flag: '🇦🇹', regions: [] },
    { id: 'belgium', name: 'Belgium', flag: '🇧🇪', regions: [] },
    { id: 'denmark', name: 'Denmark', flag: '🇩🇰', regions: [] },
    { id: 'finland', name: 'Finland', flag: '🇫🇮', regions: [] },
    { id: 'luxembourg', name: 'Luxembourg', flag: '🇱🇺', regions: [] },
    { id: 'netherlands', name: 'Netherlands', flag: '🇳🇱', regions: [] },
    { id: 'norway', name: 'Norway', flag: '🇳🇴', regions: [] },
    { id: 'switzerland', name: 'Switzerland', flag: '🇨🇭', regions: [] },
  ],
  'Middle East & Central Asia': [
    { id: 'qatar', name: 'Qatar', flag: '🇶🇦', regions: [] },
    { id: 'saudiarabia', name: 'Saudi Arabia', flag: '🇸🇦', regions: [] },
    { id: 'uae', name: 'United Arab Emirates', flag: '🇦🇪', regions: [] },
  ],
  Oceania: [
    { id: 'australia', name: 'Australia', flag: '🇦🇺', regions: [] },
    { id: 'newzealand', name: 'New Zealand', flag: '🇳🇿', regions: [] },
  ],
};

export const RESIDENCE_GROUPS: CountryGroup[] = (() => {
  const groups: CountryGroup[] = COUNTRY_GROUPS.map(g => ({
    name: g.name,
    countries: [...g.countries, ...(EXTRA[g.name] ?? [])]
      .map((c): Country => ({ ...c, regions: [] }))   // regions are a home-country concept
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
  for (const [name, countries] of Object.entries(EXTRA)) {
    if (!groups.some(g => g.name === name)) groups.push({ name, countries });
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name));
})();

const ALL = RESIDENCE_GROUPS.flatMap(g => g.countries);
const BY_ID = new Map(ALL.map(c => [c.id, c]));

// Flag emoji are two regional-indicator letters spelling the ISO 3166 code (🇩🇪 = "DE").
function isoFromFlag(flag: string): string {
  return Array.from(flag).map(ch => String.fromCharCode((ch.codePointAt(0) ?? 0) - 0x1f1e6 + 65)).join('');
}
const BY_ISO = new Map(ALL.map(c => [isoFromFlag(c.flag), c]));

export function residenceCountry(id?: string | null): Country {
  return BY_ID.get(id || DEFAULT_RESIDENCE) ?? BY_ID.get(DEFAULT_RESIDENCE)!;
}

/** Name for prompts and labels, e.g. "Germany", "United States". */
export function residenceName(id?: string | null): string {
  return residenceCountry(id).name;
}

/** Name used in running text: "the US", "the UK", "the Netherlands", "Germany". */
export function residenceInText(id?: string | null): string {
  const c = residenceCountry(id);
  if (c.id === 'usa') return 'the US';
  if (c.id === 'uk') return 'the UK';
  if (c.id === 'uae') return 'the UAE';
  if (c.id === 'netherlands') return 'the Netherlands';
  return c.name;
}

/** Residence id for an ISO country code from a place lookup, if HomeCart lists that country. */
export function residenceFromIso(code?: string | null): string | null {
  return (code && BY_ISO.get(code.toUpperCase())?.id) || null;
}

/** Best first guess for onboarding: the browser's region (de-DE -> Germany), else the US. */
export function guessResidence(): string {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    return residenceFromIso(region) ?? DEFAULT_RESIDENCE;
  } catch {
    return DEFAULT_RESIDENCE;
  }
}

/** Residence implied by a picked area (null for GPS "current location", which has no country). */
export function residenceFromArea(area: Area | null): string | null {
  return area ? residenceFromIso(area.countryCode) : null;
}
