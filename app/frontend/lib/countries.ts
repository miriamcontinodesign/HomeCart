// Home countries offered at onboarding. `id` is stored in profiles.home_country and sent to
// the backend as the map's cuisine filter — every id needs a CUISINE_QUERIES entry in
// app/backend/main.py, or its store search falls back to a generic "grocery store" query.
// Groups and the countries inside them are alphabetical so no cuisine is featured first.
// Never rename an existing id: it is persisted in profiles.

export type Country = { id: string; name: string; flag: string; regions: string[] };
export type CountryGroup = { name: string; countries: Country[] };

export const COUNTRY_GROUPS: CountryGroup[] = [
  {
    name: 'Africa',
    countries: [
      { id: 'ethiopia', name: 'Ethiopia', flag: '🇪🇹', regions: ['Amhara', 'Tigray', 'Oromo'] },
      { id: 'ghana', name: 'Ghana', flag: '🇬🇭', regions: ['Ashanti', 'Northern', 'Coastal'] },
      { id: 'kenya', name: 'Kenya', flag: '🇰🇪', regions: ['Coastal', 'Highland'] },
      { id: 'morocco', name: 'Morocco', flag: '🇲🇦', regions: ['Fez', 'Marrakesh', 'Berber'] },
      { id: 'nigeria', name: 'Nigeria', flag: '🇳🇬', regions: ['Yoruba', 'Igbo', 'Hausa'] },
      { id: 'somalia', name: 'Somalia', flag: '🇸🇴', regions: ['Mogadishu', 'Northern', 'Southern'] },
      { id: 'southafrica', name: 'South Africa', flag: '🇿🇦', regions: ['Cape Malay', 'Zulu', 'Afrikaner'] },
    ],
  },
  {
    name: 'Americas',
    countries: [
      { id: 'argentina', name: 'Argentina', flag: '🇦🇷', regions: ['Buenos Aires', 'Patagonian', 'Northwestern'] },
      { id: 'brazil', name: 'Brazil', flag: '🇧🇷', regions: ['Bahian', 'Mineiro', 'Gaúcho', 'Amazonian'] },
      { id: 'colombia', name: 'Colombia', flag: '🇨🇴', regions: ['Andean', 'Caribbean', 'Pacific'] },
      { id: 'cuba', name: 'Cuba', flag: '🇨🇺', regions: ['Havana', 'Eastern'] },
      { id: 'dominicanrepublic', name: 'Dominican Republic', flag: '🇩🇴', regions: ['Santo Domingo', 'Cibao', 'Southern'] },
      { id: 'ecuador', name: 'Ecuador', flag: '🇪🇨', regions: ['Coastal', 'Andean (Sierra)', 'Amazonian'] },
      { id: 'elsalvador', name: 'El Salvador', flag: '🇸🇻', regions: ['Western', 'Central', 'Eastern'] },
      { id: 'guatemala', name: 'Guatemala', flag: '🇬🇹', regions: ['Highlands', 'Guatemala City', 'Garífuna (Caribbean)', 'Petén'] },
      { id: 'haiti', name: 'Haiti', flag: '🇭🇹', regions: ['Port-au-Prince', 'Northern', 'Southern'] },
      { id: 'honduras', name: 'Honduras', flag: '🇭🇳', regions: ['Tegucigalpa', 'Northern Coast', 'Garífuna'] },
      { id: 'jamaica', name: 'Jamaica', flag: '🇯🇲', regions: ['Kingston', 'Mountain'] },
      { id: 'mexico', name: 'Mexico', flag: '🇲🇽', regions: ['Oaxacan', 'Yucatecan', 'Northern', 'Central', 'Pueblan'] },
      { id: 'peru', name: 'Peru', flag: '🇵🇪', regions: ['Coastal', 'Andean', 'Amazonian'] },
      { id: 'venezuela', name: 'Venezuela', flag: '🇻🇪', regions: ['Caracas', 'Andean', 'Llanero'] },
    ],
  },
  {
    name: 'East Asia',
    countries: [
      { id: 'china', name: 'China', flag: '🇨🇳', regions: ['Sichuan', 'Cantonese', 'Hunan', 'Shanghainese', 'Northeastern', 'Xinjiang', 'Yunnan'] },
      { id: 'hongkong', name: 'Hong Kong', flag: '🇭🇰', regions: ['Cantonese', 'Hakka', 'Cha chaan teng'] },
      { id: 'japan', name: 'Japan', flag: '🇯🇵', regions: ['Kansai', 'Kanto', 'Okinawan', 'Hokkaido'] },
      { id: 'korea', name: 'South Korea', flag: '🇰🇷', regions: ['Seoul', 'Jeolla', 'Gyeongsang', 'Jeju'] },
      { id: 'taiwan', name: 'Taiwan', flag: '🇹🇼', regions: ['Taipei', 'Hakka', 'Aboriginal'] },
    ],
  },
  {
    name: 'Europe',
    countries: [
      { id: 'albania', name: 'Albania', flag: '🇦🇱', regions: ['Northern (Gheg)', 'Southern (Tosk)', 'Coastal'] },
      { id: 'armenia', name: 'Armenia', flag: '🇦🇲', regions: ['Yerevan', 'Western Armenian', 'Eastern Armenian'] },
      { id: 'bosnia', name: 'Bosnia and Herzegovina', flag: '🇧🇦', regions: ['Bosnian', 'Herzegovinian'] },
      { id: 'croatia', name: 'Croatia', flag: '🇭🇷', regions: ['Dalmatian', 'Istrian', 'Slavonian', 'Zagreb'] },
      { id: 'czechia', name: 'Czech Republic', flag: '🇨🇿', regions: ['Bohemian', 'Moravian'] },
      { id: 'france', name: 'France', flag: '🇫🇷', regions: ['Parisian', 'Provençal', 'Norman', 'Alsatian', 'Lyonnaise', 'Basque'] },
      { id: 'germany', name: 'Germany', flag: '🇩🇪', regions: ['Bavarian', 'Berlin', 'Swabian', 'Northern'] },
      { id: 'greece', name: 'Greece', flag: '🇬🇷', regions: ['Mainland', 'Cretan', 'Aegean'] },
      { id: 'hungary', name: 'Hungary', flag: '🇭🇺', regions: ['Budapest', 'Great Plain', 'Transdanubian'] },
      { id: 'ireland', name: 'Ireland', flag: '🇮🇪', regions: ['Dublin', 'Munster', 'Connacht', 'Ulster'] },
      { id: 'italy', name: 'Italy', flag: '🇮🇹', regions: ['Sicilian', 'Tuscan', 'Lombard', 'Neapolitan', 'Roman', 'Venetian', 'Calabrian', 'Sardinian', 'Emilian'] },
      { id: 'poland', name: 'Poland', flag: '🇵🇱', regions: ['Kraków', 'Warsaw', 'Silesian'] },
      { id: 'portugal', name: 'Portugal', flag: '🇵🇹', regions: ['Lisbon', 'Porto', 'Alentejo', 'Azorean'] },
      { id: 'romania', name: 'Romania', flag: '🇷🇴', regions: ['Transylvanian', 'Moldavian', 'Wallachian', 'Banat'] },
      { id: 'russia', name: 'Russia', flag: '🇷🇺', regions: ['Moscow', 'Siberian', 'Caucasian'] },
      { id: 'serbia', name: 'Serbia', flag: '🇷🇸', regions: ['Belgrade', 'Vojvodina', 'Southern'] },
      { id: 'spain', name: 'Spain', flag: '🇪🇸', regions: ['Catalan', 'Andalusian', 'Basque', 'Galician', 'Castilian', 'Valencian'] },
      { id: 'sweden', name: 'Sweden', flag: '🇸🇪', regions: ['Stockholm', 'Northern', 'Skåne'] },
      { id: 'turkey', name: 'Turkey', flag: '🇹🇷', regions: ['Istanbul', 'Anatolian', 'Aegean', 'Black Sea', 'Southeastern'] },
      { id: 'ukraine', name: 'Ukraine', flag: '🇺🇦', regions: ['Western', 'Central', 'Eastern'] },
      { id: 'uk', name: 'United Kingdom', flag: '🇬🇧', regions: ['English', 'Scottish', 'Welsh', 'Northern Irish'] },
    ],
  },
  {
    name: 'Middle East & Central Asia',
    countries: [
      { id: 'afghanistan', name: 'Afghanistan', flag: '🇦🇫', regions: ['Kabul', 'Kandahar', 'Herat', 'Hazara'] },
      { id: 'egypt', name: 'Egypt', flag: '🇪🇬', regions: ['Cairo', 'Alexandrian', 'Upper Egyptian'] },
      { id: 'iran', name: 'Iran', flag: '🇮🇷', regions: ['Persian', 'Azeri', 'Kurdish'] },
      { id: 'iraq', name: 'Iraq', flag: '🇮🇶', regions: ['Baghdad', 'Mosul', 'Basra', 'Kurdish'] },
      { id: 'israel', name: 'Israel', flag: '🇮🇱', regions: ['Ashkenazi', 'Sephardic', 'Mizrahi'] },
      { id: 'lebanon', name: 'Lebanon', flag: '🇱🇧', regions: ['Beirut', 'Bekaa'] },
      { id: 'syria', name: 'Syria', flag: '🇸🇾', regions: ['Damascus', 'Aleppo', 'Coastal'] },
      { id: 'uzbekistan', name: 'Uzbekistan', flag: '🇺🇿', regions: ['Tashkent', 'Samarkand', 'Bukharan'] },
    ],
  },
  {
    name: 'South Asia',
    countries: [
      { id: 'bangladesh', name: 'Bangladesh', flag: '🇧🇩', regions: ['Dhaka', 'Chittagong', 'Sylhet'] },
      { id: 'india', name: 'India', flag: '🇮🇳', regions: ['North Indian', 'South Indian', 'Bengali', 'Gujarati', 'Punjabi', 'Maharashtrian', 'Karnataka', 'Kerala', 'Tamil', 'Hyderabadi', 'Goan'] },
      { id: 'nepal', name: 'Nepal', flag: '🇳🇵', regions: ['Newari', 'Thakali', 'Tibetan'] },
      { id: 'pakistan', name: 'Pakistan', flag: '🇵🇰', regions: ['Punjabi', 'Sindhi', 'Pashtun', 'Balochi'] },
      { id: 'srilanka', name: 'Sri Lanka', flag: '🇱🇰', regions: ['Sinhalese', 'Tamil'] },
    ],
  },
  {
    name: 'Southeast Asia',
    countries: [
      { id: 'cambodia', name: 'Cambodia', flag: '🇰🇭', regions: ['Phnom Penh', 'Battambang', 'Coastal'] },
      { id: 'indonesia', name: 'Indonesia', flag: '🇮🇩', regions: ['Javanese', 'Sumatran', 'Balinese', 'Padang'] },
      { id: 'laos', name: 'Laos', flag: '🇱🇦', regions: ['Vientiane', 'Luang Prabang', 'Southern'] },
      { id: 'malaysia', name: 'Malaysia', flag: '🇲🇾', regions: ['Malay', 'Chinese-Malay', 'Indian-Malay', 'Nyonya'] },
      { id: 'myanmar', name: 'Myanmar', flag: '🇲🇲', regions: ['Bamar', 'Shan', 'Mon', 'Rakhine', 'Karen', 'Chin'] },
      { id: 'philippines', name: 'Philippines', flag: '🇵🇭', regions: ['Luzon', 'Visayas', 'Mindanao'] },
      { id: 'singapore', name: 'Singapore', flag: '🇸🇬', regions: ['Chinese-Singaporean', 'Malay-Singaporean', 'Indian-Singaporean', 'Peranakan'] },
      { id: 'thailand', name: 'Thailand', flag: '🇹🇭', regions: ['Central', 'Northern', 'Northeastern (Isan)', 'Southern'] },
      { id: 'vietnam', name: 'Vietnam', flag: '🇻🇳', regions: ['Northern', 'Central', 'Southern'] },
    ],
  },
];

export const COUNTRIES: Country[] = COUNTRY_GROUPS.flatMap(g => g.countries);

// Removed from onboarding but may still be stored on older profiles.
const LEGACY_COUNTRIES: Country[] = [
  { id: 'usa', name: 'USA', flag: '🇺🇸', regions: [] },
];

const BY_ID = new Map([...COUNTRIES, ...LEGACY_COUNTRIES].map(c => [c.id, c]));

export function countryName(id?: string | null): string {
  if (!id) return '';
  return BY_ID.get(id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
}

export function countryFlag(id?: string | null): string {
  return (id && BY_ID.get(id)?.flag) || '🌍';
}

// Free-text cuisine labels stored in profiles.home_cuisines and sent to the LLM prompts.
export function homeCuisinesFor(id: string, region?: string): string[] {
  const name = countryName(id);
  return region ? [name, `${name} (${region})`] : [name];
}
