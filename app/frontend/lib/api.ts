// HTTP client wrapper that attaches BYOK + identity headers to every backend call.
// Reads keys from browser storage at request time so a user's "Save" in Settings
// takes effect on the very next API call without a reload.

import { loadByokKeys } from './byok';
import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// Thrown when the backend returns 429 with quota_exceeded. UI should catch this,
// show a friendly modal, and deep-link the user into Settings to add a BYOK key.
export class QuotaExceededError extends Error {
  kind: 'scan' | 'recipe';
  used: number;
  limit: number;
  resetAt: string;
  suggestBYOK: boolean;

  constructor(detail: any) {
    super(detail?.message || 'Daily quota exceeded');
    this.name = 'QuotaExceededError';
    this.kind = detail?.kind || 'scan';
    this.used = detail?.used || 0;
    this.limit = detail?.limit || 0;
    this.resetAt = detail?.reset_at || '';
    this.suggestBYOK = !!detail?.suggest_byok;
  }
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const [keys, sessionRes] = await Promise.all([
    loadByokKeys(),
    supabase.auth.getSession(),
  ]);

  const session = sessionRes.data.session;
  const userId = session?.user?.id;

  const headers: Record<string, string> = {};
  // ngrok's free-tier interstitial blocks unsigned requests without this header.
  // Only relevant during local LAN/tunnel dev; production talks straight to Render.
  if (__DEV__) headers['Bypass-Tunnel-Reminder'] = '1';
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  if (keys.llmKey) headers['X-User-LLM-Key'] = keys.llmKey;
  if (keys.llmVisionModel) headers['X-User-LLM-Vision-Model'] = keys.llmVisionModel;
  if (keys.llmTextModel) headers['X-User-LLM-Text-Model'] = keys.llmTextModel;
  if (userId) headers['X-User-Id'] = userId;
  // BYOK is scoped to LLM only — Maps, Tavily, Firecrawl are operator-managed. Older
  // builds used to forward X-User-GCP-Key / X-User-Tavily-Key / X-User-Firecrawl-Key;
  // those headers are no longer sent. See lib/byok.ts clearLegacyByokKeys for cleanup.

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
}

// Convenience wrapper for endpoints that may return 429 quota_exceeded.
// Parses the JSON, checks for the quota_exceeded shape, throws QuotaExceededError
// if found. Otherwise returns the parsed body.
export async function apiFetchJson(path: string, options: RequestInit = {}): Promise<any> {
  const res = await apiFetch(path, options);
  if (res.ok) return res.json();

  // A response body can only be read once, so read it as text and parse from that.
  const text = await res.text();
  let detail: any;
  try { detail = JSON.parse(text).detail; } catch {}
  if (res.status === 429 && detail?.error === 'quota_exceeded') throw new QuotaExceededError(detail);
  // FastAPI puts human-readable messages in `detail`; fall back to the raw body.
  throw new Error(typeof detail === 'string' ? detail : `HTTP ${res.status}: ${text.slice(0, 300)}`);
}

export { API_URL };
