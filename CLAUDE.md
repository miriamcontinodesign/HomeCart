# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

HomeCart (formerly "Cartographer") is a hackathon-won **web app** (React Native code rendered via Expo + react-native-web) that helps immigrants navigate US grocery shopping. Three flows: **Magic Lens** scan (photo upload → cultural equivalent JSON), **Recipe Importer** (dish name → ingredient list with availability classification), **Cultural Map** (Google Places with cuisine + product-aware ranking). It started as an Android-only app; the Android/EAS build setup was removed in favour of web-only.

Distribution model: static web build hosted on Vercel. Two usage modes: shared quota (operator's OpenRouter key, 10 scans + 3 recipes per user per day) and BYOK-only (`EXPO_PUBLIC_BYOK_ONLY=true` at build time, blocks the main UI until the user supplies their own LLM key).

## High-level architecture

Two deployable surfaces plus one Postgres schema, one budget envelope to protect:

**`app/backend/`** — FastAPI on Render free tier (Blueprint service `homecart-backend`; its public URL goes in the frontend's `EXPO_PUBLIC_API_URL`). Three real endpoints:
- `POST /scan` — vision LLM call returning structured JSON about a product image
- `POST /recipe` — text LLM call returning structured JSON ingredients for a dish
- `POST /stores/nearby` — Google Places (New) Text Search with cuisine + product-aware ranking

UptimeRobot pings `/healthz` every 5 min to fight Render's 15-min idle spin-down. Render reads `app/backend/render.yaml` as a Blueprint on push to `main`.

**`app/frontend/`** — Expo SDK 54 / React Native 0.81 rendered on web via `react-native-web`, built with `expo export --platform web` into `dist/` and served by Vercel (`vercel.json`; Vercel project root = `app/frontend`). The map uses `@vis.gl/react-google-maps` (Google Maps JavaScript API, advanced markers → needs a Map ID). Magic Lens uses an `<input type="file" capture="environment">` and downscales photos to ≤1280px in a canvas before upload. Tab navigator with 5 tabs (`Home`, `Map`, `MagicLens` center FAB, `List`→labelled "Recipes", `Profile`), inside a centered max-640px column (`AppFrame` in `App.tsx`). `App.tsx` gates rendering on: auth state → profile loaded → onboarding complete → (if `BYOK_ONLY`) BYOK configured → MainTabNavigator.

**`app/migrations/`** — Numbered SQL files (`001` → `005`) applied manually to Supabase via the SQL editor. There is no migration runner; commit order is human-enforced. `005_daily_usage.sql` is the rate-limit table; **must be applied to Supabase before the backend's `_enforce_daily_quota` will work**.

### Critical cross-cutting flows

**BYOK is LLM-only.** `app/frontend/lib/api.ts` `apiFetch()` attaches `X-User-LLM-Key`, `X-User-LLM-Vision-Model`, `X-User-LLM-Text-Model`, `X-User-Id` to every backend call. Values come from browser `localStorage` via `lib/byok.ts` (weaker than a hardware keystore — the Settings copy warns users not to save keys on shared computers). Backend `get_byok` dependency in `main.py` extracts them; `providers.py` routes by key prefix (`sk-ant-` → Anthropic native Messages API, `sk-or-` → OpenRouter, `sk-` → OpenAI direct). Maps/Tavily/Firecrawl are **operator-managed** — older builds had BYOK fields for them and forwarded `X-User-GCP-Key` etc., but those proved to be foot-guns (user-supplied Maps keys were typically Android-restricted, which fails server-side). The frontend no longer collects those keys and the backend ignores the headers if a stale build still sends them.

**Single source of truth for LLM provider = key prefix.** Never reintroduce an explicit "provider override" UI (an earlier version had one). The backend ALWAYS routes by `detect_provider(key)`; a UI override would silently diverge the model picker from the routing — e.g. user picks "Anthropic" provider but pastes an `sk-or-` key, sees Anthropic models, picks Claude Haiku (Anthropic-native ID), backend sends that ID to OpenRouter which only knows it as `anthropic/claude-haiku-4.5`, silent 404. `SettingsScreen.tsx` derives the provider from `detectLLMProvider(keys.llmKey)` and filters the model picker accordingly. Models are reset when the detected provider changes — see `onLlmKeyChange`.

**Parameter normalization** in `providers.py` `_normalize_openai_body()` — OpenAI reasoning models (o-series, all GPT-5.x matching the regex `(^|/)(o[1-9](-|$)|gpt-5(\.|$|-))`) reject `max_tokens` (use `max_completion_tokens`) and `temperature`; Gemini models reject `frequency_penalty`, `presence_penalty`, `n`, `logprobs`. **Never bypass this normalizer** when adding new providers or models.

**Rate limiting** — `main.py` `_enforce_daily_quota(user_id, kind)` is called BEFORE every LLM call, but ONLY when `byok.llm_key` is empty. BYOK users have unlimited usage (they pay their own provider). Reads + upserts the `daily_usage` table; raises 429 with `{error: "quota_exceeded", suggest_byok: true, ...}` when over. Frontend `MagicLensScreen.tsx` and `ListScreen.tsx` catch 429 and show a friendly alert pointing the user to Settings.

**Provider defaults vs user-selected models** — `PROVIDER_DEFAULTS` in `providers.py` defines the fallback model per (provider, kind=vision|text). User-supplied `X-User-LLM-Vision-Model` / `X-User-LLM-Text-Model` headers override these. Code defaults: `openai/gpt-5.4-nano` (vision) + `deepseek/deepseek-v4-flash` (text) via OpenRouter. The operator path can override them with `LLM_VISION_MODEL` / `LLM_TEXT_MODEL` and add comma-separated backups in `LLM_VISION_FALLBACKS` / `LLM_TEXT_FALLBACKS`; `call_llm` tries each in order on errors, rate limits or empty replies (not on 401). BYOK calls never fall back. The model output's `preferred_store_types` is coerced to a list by `_coerce_store_types` in `main.py` — weaker models sometimes return a bare string.

**Store ranking** — `main.py` `stores_nearby` is product-context-aware. `availability_breadth` ∈ `{mainstream, both, specialty_only}` determines weighting: specialty-only products penalize non-specialty stores by 60; mainstream products drop specialty-tier bonuses; "both" sorts pure-distance-first with authenticity as tiebreaker. Recipe coverage flow sorts by distance with coverage as tiebreaker; `_store_carries` decides per-ingredient coverage and also credits specialty grocers with everyday staples the model tagged `supermarket` (except fresh meat/seafood, which only halal grocers get). Coverage counts are baked into the 24h `store_cache` rows, so clear that table after changing coverage logic.

## Common commands

### Backend (run from `app/backend/`)

```bash
source venv/bin/activate                                  # activate the existing venv
uvicorn main:app --host 0.0.0.0 --port 8000 --reload      # local dev
python seed_chains.py                                     # populate chain_personas table (idempotent)
python seed_equivalences.py                               # populate equivalences seed data
```

`.env` lives at `app/backend/.env` (gitignored) and must contain `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `OPENROUTER_API_KEY`, `GOOGLE_MAPS_API_KEY`. Same vars must be set in the Render dashboard for production.

There are no tests in this repo — `_classify_chain`, `_haversine`, and the parameter normalizer are exercised only via real API calls.

### Frontend (run from `app/frontend/`)

```bash
npm start                            # expo start --web on http://localhost:8081
npm run build                        # static export to dist/ (what Vercel runs)
npx tsc --noEmit                     # type-check (note: @expo/vector-icons resolution errors are pre-existing tsc-only noise; ignore)
```

`.env` lives at `app/frontend/.env` (gitignored; see `.env.example`). Every `EXPO_PUBLIC_*` value is inlined into the public JS bundle at build time — only the Supabase anon key, the backend URL and a referrer-restricted Maps browser key belong there. The same vars must be set in the Vercel project settings for production builds.

### Migrations

Open Supabase SQL editor → paste the contents of `app/migrations/00X_*.sql` → Run. Numbered files are applied in order, but `001` is destructive (`DROP TABLE`) — assume only later migrations need re-running.

### Production deploy

`git push origin main` triggers the Render backend deploy via the Blueprint and the Vercel frontend deploy, provided both services are connected to this repo. After the first Vercel deploy, set Supabase → Authentication → URL Configuration → Site URL to the Vercel domain, add that domain to the Maps browser key's referrer restrictions, and set `EXPO_PUBLIC_API_URL` in Vercel to the Render URL. The `origin` remote points at `https://github.com/miriamcontinodesign/HomeCart`.

## Conventions and gotchas

**Single git remote on `main`.** `origin` → `github.com/miriamcontinodesign/HomeCart`, default branch `main`. Push with `git push origin main`.

**Product name.** The repo folder is `HomeCart/`; the Expo slug and display name are `homecart` / `HomeCart`. "Cartographer" is the hackathon-era name and still appears in `prd/` and `plan/`.

**No backend-side migration runner.** When you add a new `.sql` file to `app/migrations/`, you must apply it to Supabase manually before deploying backend code that depends on it. The `daily_usage` rate-limit gate WILL crash with `relation "daily_usage" does not exist` if migration 005 isn't applied yet.

**`@app.get` does NOT auto-handle HEAD in FastAPI.** UptimeRobot's free tier sends HEAD only. `/healthz` uses `@app.api_route(["GET", "HEAD"])` — preserve this if refactoring.

**Reasoning model parameters.** All GPT-5.x and o-series models require `max_completion_tokens` (not `max_tokens`) and reject `temperature`. The regex in `providers.py:_OPENAI_REASONING_RE` catches them — update the regex, not the call sites, when new families ship.

**`Alert.alert` is a no-op on web.** Import `Alert` from `lib/alert.ts` (window.alert / window.confirm shim), never from `react-native`, or error and confirmation dialogs silently disappear.

**Two Google Maps keys.** The backend's `GOOGLE_MAPS_API_KEY` (Places API (New), server-side, no application restriction) and the frontend's `EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` (Maps JavaScript API, HTTP-referrer restricted). Never put the backend key in the frontend `.env` — it would ship to every visitor unrestricted.

**Supabase session lives in localStorage** (`@react-native-async-storage/async-storage` is localStorage-backed on web). `detectSessionInUrl: true` lets the PKCE confirmation link sign the user in when it opens in the same browser that signed up.

**Free-tier API ceilings.** OpenRouter spending cap is the real safety net (set at $20). Google Maps free tier is generous ($200/mo, ~6000 Places searches; Maps JavaScript map loads are billed separately). Render free tier: 750 hrs/mo + 15-min idle spin-down (UptimeRobot pings every 5 min). Supabase free tier: 50k MAU, 500MB DB.

**Hackathon-era code in `prd/` and `plan/`.** These are historical design docs from the hackathon, not current spec. Don't update them when shipping new features; they're frozen artifacts.

## Files most likely to need editing for common tasks

| Task | Touch |
|---|---|
| New LLM endpoint or model | `app/backend/providers.py` (defaults + adapter), `app/frontend/lib/models.ts` (curated list) |
| New BYOK provider | `app/backend/providers.py` `detect_provider` + `PROVIDER_DEFAULTS`, `app/frontend/lib/byok.ts` `detectLLMProvider`, `app/frontend/lib/models.ts` (model list) |
| New backend endpoint | `app/backend/main.py`, attach `byok: BYOK = Depends(get_byok)` if it does LLM work |
| New rate-limit kind | Add column to `daily_usage`, extend `_enforce_daily_quota`, add `SCAN_DAILY_LIMIT`-style env var |
| Map ranking tweak | `app/backend/main.py` `stores_nearby` (~ line 670), reuses `_classify_chain` + `_haversine` + cache helpers in the same file |
| New tab / screen | `app/frontend/App.tsx` `MainTabNavigator`, add screen file to `screens/`, share `theme/ThemeContext` for colors |
| Map UI | `app/frontend/screens/MapScreen.tsx` (`@vis.gl/react-google-maps`; `fitTo` / `panTo` helpers wrap the map instance) |
