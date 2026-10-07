// "Try the demo" personas. Each tap creates a Supabase *anonymous* user (no email/password,
// its own private data) and pre-fills the profile so the visitor lands on Home. Requires
// Supabase → Authentication → Sign In / Providers → "Allow anonymous sign-ins".
import { supabase } from './supabase';
import { homeCuisinesFor } from './countries';

export type Persona = {
  id: string;
  name: string;
  countryId: string;
  region: string;
  flag: string;
  blurb: string;
  language: string;
  dietary: string[];
  area: { label: string; lat: number; lon: number };
};

// Each lives somewhere with a strong community for their cuisine, so the map has real
// specialty stores to show.
export const PERSONAS: Persona[] = [
  {
    id: 'giulia', name: 'Giulia', countryId: 'italy', region: 'Sicilian', flag: '🇮🇹',
    blurb: 'From Palermo, now in Brooklyn', language: 'English', dietary: [],
    area: { label: 'Brooklyn, NY, USA', lat: 40.6782, lon: -73.9442 },
  },
  {
    id: 'maria', name: 'Maria', countryId: 'mexico', region: 'Oaxacan', flag: '🇲🇽',
    blurb: 'From Oaxaca, now in Los Angeles', language: 'Spanish', dietary: [],
    area: { label: 'Los Angeles, CA, USA', lat: 34.0522, lon: -118.2437 },
  },
  {
    id: 'ravi', name: 'Ravi', countryId: 'india', region: 'Gujarati', flag: '🇮🇳',
    blurb: 'From Ahmedabad, now in Edison', language: 'English', dietary: ['Vegetarian'],
    area: { label: 'Edison, NJ, USA', lat: 40.5187, lon: -74.4121 },
  },
  {
    id: 'jiwoo', name: 'Ji-woo', countryId: 'korea', region: 'Seoul', flag: '🇰🇷',
    blurb: 'From Seoul, now in Fort Lee', language: 'Korean', dietary: [],
    area: { label: 'Fort Lee, NJ, USA', lat: 40.8509, lon: -73.9701 },
  },
];

// Set just before signing in; AuthContext applies it on the first profile load so the visitor
// never sees onboarding.
let pending: Persona | null = null;

export function takePendingPersona(): Persona | null {
  const p = pending;
  pending = null;
  return p;
}

export function personaProfile(p: Persona) {
  return {
    full_name: p.name,
    home_country: p.countryId,
    home_region: p.region,
    home_cuisines: homeCuisinesFor(p.countryId, p.region),
    preferred_language: p.language,
    dietary_preferences: p.dietary,
    home_city: p.area.label,
    home_lat: p.area.lat,
    home_lng: p.area.lon,
    onboarding_completed: true,
  };
}

export async function startDemo(p: Persona): Promise<void> {
  pending = p;
  const { error } = await supabase.auth.signInAnonymously({ options: { data: { full_name: p.name, demo_persona: p.id } } });
  if (error) {
    pending = null;
    throw error;
  }
}
