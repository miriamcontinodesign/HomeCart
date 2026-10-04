// BYOK (bring your own key) storage layer.
// Keys live in the browser's localStorage, scoped to this origin. That is NOT as strong as a
// phone's hardware keystore: any script running on the page (e.g. via an XSS bug or a
// malicious extension) could read it. SettingsScreen tells the user this. The keys are never
// logged, never persisted on the backend, and only leave the browser as request headers on
// the API calls that need them.
//
// Scope: LLM provider keys ONLY. Maps, Tavily, Firecrawl are operator-managed —
// see the BYOK redesign rationale in CLAUDE.md (under "Conventions and gotchas").

// localStorage can throw (Safari private mode, blocked site data); treat that as "no key".
const store = {
  get(name: string): string | null {
    try { return window.localStorage.getItem(name); } catch { return null; }
  },
  set(name: string, value: string): void {
    window.localStorage.setItem(name, value);
  },
  remove(name: string): void {
    try { window.localStorage.removeItem(name); } catch { /* ignore */ }
  },
};

export type LLMProvider = 'openrouter' | 'openai' | 'anthropic';

export interface ByokKeys {
  llmKey?: string;
  llmVisionModel?: string;        // provider-native model ID (depends on detected provider)
  llmTextModel?: string;
}

const KEY_NAMES = {
  llmKey: 'byok_llm_key',
  llmVisionModel: 'byok_llm_vision_model',
  llmTextModel: 'byok_llm_text_model',
} as const;

// Legacy entries written by older builds. Wiped on app start to prevent
// stale state from being forwarded as headers and silently breaking things.
const LEGACY_KEY_NAMES = [
  'byok_llm_provider',   // explicit provider override — removed; we detect from key prefix
  'byok_gcp_key',        // BYOK Maps removed — operator covers it
  'byok_tavily_key',     // forward-looking stub never wired up
  'byok_firecrawl_key',  // forward-looking stub never wired up
];

export async function loadByokKeys(): Promise<ByokKeys> {
  const entries = await Promise.all(
    (Object.entries(KEY_NAMES) as [keyof ByokKeys, string][]).map(async ([k, name]) => {
      const v = store.get(name);
      return [k, v || undefined] as const;
    }),
  );
  return Object.fromEntries(entries) as ByokKeys;
}

export async function saveByokKeys(keys: ByokKeys): Promise<void> {
  // Persist non-empty entries; delete empties so a saved-then-cleared field goes away.
  for (const [k, secureKey] of Object.entries(KEY_NAMES) as [keyof ByokKeys, string][]) {
    const value = keys[k];
    if (value && value.trim()) {
      store.set(secureKey, value.trim());
    } else {
      store.remove(secureKey);
    }
  }
}

export async function clearAllByokKeys(): Promise<void> {
  Object.values(KEY_NAMES).forEach(name => store.remove(name));
}

// One-shot cleanup of entries written by older builds. Safe to call on every load.
export async function clearLegacyByokKeys(): Promise<void> {
  LEGACY_KEY_NAMES.forEach(name => store.remove(name));
}

// Detect the LLM provider from a key prefix. THIS is the source of truth — the backend
// uses the same logic in providers.py:detect_provider, so what we show in the UI matches
// what actually gets called. Never reintroduce an "explicit provider override" — it
// silently diverges the frontend model list from the backend's routing.
export function detectLLMProvider(key?: string): LLMProvider {
  if (!key) return 'openrouter';
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('sk-')) return 'openai';
  return 'openrouter';
}

export function providerDisplayName(p: LLMProvider): string {
  switch (p) {
    case 'anthropic': return 'Anthropic';
    case 'openrouter': return 'OpenRouter';
    case 'openai': return 'OpenAI';
  }
}
