from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Callable, Optional, List
from supabase import create_client, Client
import os
import re
import time
import json
import httpx
from math import radians, sin, cos, sqrt, atan2
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

load_dotenv()

# Provider router for LLM calls (BYOK-aware). See app/backend/providers.py.
from providers import (
    llm_vision, llm_text,
    ENV_LLM_BASE_URL, ENV_VISION_MODEL, ENV_VISION_FALLBACKS, ENV_TEXT_MODEL, ENV_TEXT_FALLBACKS,
)
from fastapi.responses import JSONResponse

app = FastAPI(title="HomeCart Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", os.environ.get("SUPABASE_KEY", ""))
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")

# All LLM routing (model defaults, BYOK key prefix detection, parameter normalization)
# is owned by providers.py. Don't reintroduce LLM_* env reads here — they'll drift.

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# ============================
# MODELS
# ============================
class UserProfile(BaseModel):
    home_country: Optional[str] = None
    home_region: Optional[str] = None
    home_cuisines: list[str] = []
    cooking_confidence: int = 3
    dietary_preferences: list[str] = []


class ScanRequest(BaseModel):
    image_base64: str
    user_profile: UserProfile


class RecipeImportRequest(BaseModel):
    dish_name: str
    user_profile: UserProfile


# ============================
# AUTH HELPER
# ============================
async def get_user_id(authorization: Optional[str] = Header(None)) -> Optional[str]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.replace("Bearer ", "")
    try:
        user = supabase.auth.get_user(token)
        return user.user.id if user and user.user else None
    except Exception:
        return None


# ============================
# BYOK HEADER EXTRACTION
# ============================
# Per-request user-supplied API keys, scoped to LLM only. Maps, Tavily, Firecrawl are
# operator-managed (see the BYOK redesign note in CLAUDE.md). Older builds also forwarded
# X-User-GCP-Key / X-User-Tavily-Key / X-User-Firecrawl-Key — those headers are silently
# ignored now: most user-supplied Maps keys were Android-restricted, which fails when
# Render uses them server-side, producing silently-empty store lists.
class BYOK(BaseModel):
    llm_key: Optional[str] = None
    llm_vision_model: Optional[str] = None
    llm_text_model: Optional[str] = None
    user_id: Optional[str] = None  # Supabase user uuid; used for per-user rate limiting on non-BYOK calls.


def get_byok(
    x_user_llm_key: Optional[str] = Header(None),
    x_user_llm_vision_model: Optional[str] = Header(None),
    x_user_llm_text_model: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
) -> BYOK:
    return BYOK(
        llm_key=x_user_llm_key,
        llm_vision_model=x_user_llm_vision_model,
        llm_text_model=x_user_llm_text_model,
        user_id=x_user_id,
    )


async def call_llm_vision(
    image_base64: str,
    prompt: str,
    max_tokens: int = 1500,
    override_key: Optional[str] = None,
    override_model: Optional[str] = None,
    validate: Optional[Callable[[str], object]] = None,
) -> str:
    return await llm_vision(image_base64, prompt, max_tokens=max_tokens,
                            override_key=override_key, override_model=override_model, validate=validate)


async def call_llm_text(
    prompt: str,
    max_tokens: int = 1500,
    override_key: Optional[str] = None,
    override_model: Optional[str] = None,
    validate: Optional[Callable[[str], object]] = None,
) -> str:
    return await llm_text(prompt, max_tokens=max_tokens,
                          override_key=override_key, override_model=override_model, validate=validate)


# ============================
# RATE LIMITING (non-BYOK only)
# ============================
# Caps free-tier usage so a viral LinkedIn share can't drain the operator's
# OpenRouter wallet. BYOK users (byok.llm_key set) bypass this entirely.
SCAN_DAILY_LIMIT = int(os.environ.get("SCAN_DAILY_LIMIT", "10"))
RECIPE_DAILY_LIMIT = int(os.environ.get("RECIPE_DAILY_LIMIT", "3"))


def _enforce_daily_quota(user_id: Optional[str], kind: str) -> None:
    """Raise 429 if user is over their daily quota for `kind` ∈ {"scan","recipe"}.

    Read-then-write is racy, but acceptable for hackathon scale: worst case a
    user burns 1-2 extra LLM calls by firing simultaneous requests. No
    user_id (anonymous) is allowed through unmetered — the app gates auth
    upstream so in practice every real request carries a user id.
    """
    if not user_id:
        return
    column = "scans_used" if kind == "scan" else "recipes_used"
    limit = SCAN_DAILY_LIMIT if kind == "scan" else RECIPE_DAILY_LIMIT
    today = datetime.now(timezone.utc).date().isoformat()

    row = (
        supabase.table("daily_usage")
        .select(column)
        .eq("user_id", user_id)
        .eq("usage_date", today)
        .execute()
    )
    current = (row.data[0].get(column, 0) if row.data else 0) or 0

    if current >= limit:
        tomorrow_utc = (datetime.now(timezone.utc) + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        raise HTTPException(
            status_code=429,
            detail={
                "error": "quota_exceeded",
                "kind": kind,
                "used": current,
                "limit": limit,
                "reset_at": tomorrow_utc.isoformat(),
                "suggest_byok": True,
                "message": (
                    f"You've used your {limit} free {kind}s today. "
                    "Add your own LLM key in Settings to keep going."
                ),
            },
        )

    supabase.table("daily_usage").upsert(
        {
            "user_id": user_id,
            "usage_date": today,
            column: current + 1,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="user_id,usage_date",
    ).execute()


def parse_json_from_response(text: str) -> dict:
    """Extract a JSON object from an LLM response.

    LLMs occasionally wrap output in ```json fences, include a preamble, or trail
    a closing fence. Slicing on the outermost braces survives all of those without
    relying on a fragile fence-split.
    """
    text = (text or "").strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise json.JSONDecodeError("No JSON object found in response", text, 0)
    return json.loads(text[start:end + 1])



def _coerce_home_matches(result: dict) -> None:
    """Keep home_matches a clean list (free models sometimes return an object or junk) and
    make the top-level match_score the best of them, since history screens use it."""
    raw = result.get("home_matches")
    if isinstance(raw, dict):
        raw = [raw]
    matches = []
    for m in raw if isinstance(raw, list) else []:
        if not isinstance(m, dict) or not str(m.get("name") or "").strip():
            continue
        try:
            score = max(0, min(100, int(float(m.get("match_score") or 0))))
        except (TypeError, ValueError):
            score = 0
        matches.append({"name": str(m["name"]).strip(), "match_score": score,
                        "how_to_use": str(m.get("how_to_use") or "").strip() or None})
    matches.sort(key=lambda m: m["match_score"], reverse=True)
    result["home_matches"] = matches[:3]
    if matches:
        result["match_score"] = matches[0]["match_score"]


def _coerce_store_types(item: dict) -> None:
    """Weaker models sometimes return preferred_store_types as a bare string; the app and
    /stores/nearby expect a list (a string would be iterated character by character)."""
    v = item.get("preferred_store_types")
    if isinstance(v, str):
        item["preferred_store_types"] = [t.strip() for t in v.split(",") if t.strip()]
    elif not isinstance(v, list):
        item["preferred_store_types"] = []

# ============================
# ROUTES
# ============================
@app.get("/")
async def root():
    return {"status": "HomeCart API running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.api_route("/healthz", methods=["GET", "HEAD"])
async def healthz():
    """Lightweight liveness probe for UptimeRobot keep-alive pings.

    HEAD is included because UptimeRobot's free tier can only send HEAD
    requests — FastAPI doesn't auto-handle HEAD on @app.get routes.
    """
    return {"ok": True}


# Free OpenRouter models get withdrawn without notice (a ":free" slug then 404s — it never
# silently becomes paid). This endpoint checks every configured model against OpenRouter's
# public model list (no key, no tokens spent) so an UptimeRobot monitor can email the
# operator when a chain degrades. Cached so frequent pings don't hammer OpenRouter.
_MODEL_STATUS_TTL_S = 600
_model_status_cache: dict = {"at": 0.0, "body": None, "code": 200}


@app.api_route("/health/models", methods=["GET", "HEAD"])
async def health_models():
    now = time.time()
    if _model_status_cache["body"] and now - _model_status_cache["at"] < _MODEL_STATUS_TTL_S:
        return JSONResponse(_model_status_cache["body"], status_code=_model_status_cache["code"])

    if "openrouter.ai" not in ENV_LLM_BASE_URL:
        return {"ok": True, "note": "model check only supports OpenRouter"}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get("https://openrouter.ai/api/v1/models")
            r.raise_for_status()
            catalog = {m["id"]: m for m in r.json().get("data", [])}
    except Exception as e:
        return JSONResponse({"ok": False, "error": f"could not reach OpenRouter: {e!r}"}, status_code=503)

    def status(model_id: str) -> str:
        m = catalog.get(model_id)
        if not m:
            return "missing"
        pricing = m.get("pricing") or {}
        free = all(float(pricing.get(k) or 0) == 0 for k in ("prompt", "completion"))
        return "free" if free else "paid"

    chains = {
        "vision": [ENV_VISION_MODEL, *ENV_VISION_FALLBACKS],
        "text": [ENV_TEXT_MODEL, *ENV_TEXT_FALLBACKS],
    }
    report = {kind: [{"model": m, "status": status(m)} for m in models] for kind, models in chains.items()}
    problems = [f"{kind}: {e['model']} is {e['status']}"
                for kind, entries in report.items() for e in entries if e["status"] != "free"]
    body = {"ok": not problems, "problems": problems, "chains": report}
    # 503 makes a plain HTTP uptime monitor alert; the JSON says which model to replace.
    code = 200 if not problems else 503
    _model_status_cache.update(at=now, body=body, code=code)
    return JSONResponse(body, status_code=code)


@app.post("/scan")
async def scan_product(
    req: ScanRequest,
    user_id: Optional[str] = Depends(get_user_id),
    byok: BYOK = Depends(get_byok),
):
    cuisines_str = ", ".join(req.user_profile.home_cuisines) if req.user_profile.home_cuisines else "Unknown"
    dietary_str = ", ".join(req.user_profile.dietary_preferences) if req.user_profile.dietary_preferences else "none"

    prompt = f"""You are HomeCart, a culturally-aware grocery assistant for immigrants.

USER CONTEXT:
- Home country: {req.user_profile.home_country or 'Unknown'}
- Home region: {req.user_profile.home_region or 'Unknown'}
- Home cuisines: {cuisines_str}
- Cooking confidence (1-5): {req.user_profile.cooking_confidence}
- Dietary restrictions: {dietary_str}

TASK:
1. Identify the product in the image (name, brand if visible, category) and where the brand comes from.
2. Describe the product and how it is typically used.
3. Find 1-3 similar products from the user's home country. For each, score how close this product is to it (0-100, where 100 = identical) and explain how the user could use this product in its place.
4. Suggest the IDEAL product they'd want from a specialty store catering to their cuisine, if applicable.
5. If the user could make a closer alternative at home (and their cooking confidence allows), describe it briefly.
6. Give one practical tip for using this product or substituting it.

Output ONLY valid JSON (no preamble, no markdown fences):
{{
  "detected_product": "<product name>",
  "detected_brand": "<brand or null>",
  "brand_origin": "<country the brand comes from, e.g. 'Mexico', 'USA', 'Italy' — or null if unknown>",
  "detected_category": "<rice|flour|cheese|spice|sauce|etc>",
  "description": "<1-2 sentences: what this product is and how it is typically used>",
  "home_matches": [
    {{
      "name": "<SHORT name of a similar product from the user's home country, MAX 6 words>",
      "match_score": <0-100: how close this product is to that one>,
      "how_to_use": "<one sentence: how the user could use this product in place of it>"
    }}
  ],
  "cultural_equivalent": "<one sentence: what is this in their cuisine?>",
  "match_score": <0-100: the highest match_score in home_matches>,
  "real_version_name": "<SHORT product name, MAX 6 words, e.g. 'Amul Fresh Cream' or 'San Marzano DOP Tomatoes' or 'Alphonso Mango' — never a sentence, never parenthetical store list. Or null.>",
  "ai_tip": "<one practical tip>",
  "can_make_at_home": <true/false>,
  "home_recipe_summary": "<one sentence on how to make it, or null>",
  "availability_breadth": "<one of: 'mainstream' (common in any US supermarket, e.g. cauliflower, chicken, butter), 'specialty_only' (only in ethnic specialty stores, e.g. Alphonso mango, fresh paneer, banchan, curry leaves, masa harina), 'both' (mainstream carries a passable version but specialty has the real thing, e.g. basmati rice, soy sauce, olive oil)>",
  "preferred_store_types": <array of store-type tokens that carry this product. Pick from: "supermarket", "warehouse_club", "indian_grocery", "south_asian_specialty", "chinese_grocery", "korean_grocery", "japanese_grocery", "vietnamese_grocery", "thai_grocery", "filipino_grocery", "mexican_grocery", "italian_specialty", "middle_eastern_grocery", "halal_grocery", "caribbean_grocery", "african_grocery", "european_grocery", "latin_grocery", "southeast_asian_grocery". Always include 1-4 tokens.>
}}

home_matches must have 1-3 items, best match first.
If the image is unclear or not a food product, use match_score: 0, home_matches: [], and explain in description.
"""

    try:
        if not byok.llm_key:
            _enforce_daily_quota(byok.user_id, "scan")
        response_text = await call_llm_vision(
            # Headroom for free "thinking" models, which otherwise run out of tokens
            # before writing the JSON and return an empty reply.
            req.image_base64, prompt, max_tokens=4000,
            override_key=byok.llm_key, override_model=byok.llm_vision_model,
            validate=parse_json_from_response,
        )
        result = parse_json_from_response(response_text)
        _coerce_store_types(result)
        _coerce_home_matches(result)

        # Persist scan if user authenticated
        if user_id:
            try:
                supabase.table("scans").insert({
                    "user_id": user_id,
                    "detected_product": result.get("detected_product"),
                    "detected_brand": result.get("detected_brand"),
                    "detected_category": result.get("detected_category"),
                    "cultural_equivalent": result.get("cultural_equivalent"),
                    "match_score": result.get("match_score"),
                    "ai_tip": result.get("ai_tip"),
                    "can_make_at_home": result.get("can_make_at_home", False),
                    "home_recipe_summary": result.get("home_recipe_summary"),
                    "real_version_name": result.get("real_version_name"),
                    "availability_breadth": result.get("availability_breadth"),
                    "preferred_store_types": result.get("preferred_store_types") or [],
                    "raw_vision_response": result,
                }).execute()
            except Exception as e:
                print(f"[scan] Failed to persist: {e}")

        return result
    except json.JSONDecodeError as e:
        raise HTTPException(500, f"AI response parse error: {e}")
    except httpx.HTTPError as e:
        raise HTTPException(500, f"AI API error: {e}")


@app.post("/recipe")
async def import_recipe(
    req: RecipeImportRequest,
    user_id: Optional[str] = Depends(get_user_id),
    byok: BYOK = Depends(get_byok),
):
    cuisines_str = ", ".join(req.user_profile.home_cuisines) if req.user_profile.home_cuisines else "Unknown"
    dietary_str = ", ".join(req.user_profile.dietary_preferences) if req.user_profile.dietary_preferences else "none"

    prompt = f"""You are HomeCart, helping an immigrant shop for their home cuisine in American grocery stores.

USER:
- Home cuisines: {cuisines_str}
- Cooking confidence (1-5): {req.user_profile.cooking_confidence}
- Dietary: {dietary_str}

DISH: {req.dish_name}

TASK:
1. List the 8-15 essential ingredients for this dish.
2. For each, give the closest US grocery store equivalent (specific brand if possible).
3. Match score 0-100 (100 = identical to home version).
4. Aisle hint (where in a typical American grocery store).
5. One AI tip (substitute hint, brand to look for, what to avoid).
6. Can they make it at home from simpler ingredients?

Output ONLY valid JSON (no preamble, no markdown):
{{
  "dish_name": "{req.dish_name}",
  "ingredients": [
    {{
      "original_ingredient": "<home name>",
      "us_equivalent_product": "<SHORT US product name, MAX 6 words, no parentheticals, no examples list — e.g. 'Sun Noodles fresh ramen' or 'Gekkeikan dry sake' or 'whole milk ricotta'. This text shows in a single-line UI banner.>",
      "us_brand": "<specific brand or null>",
      "match_score": <0-100>,
      "aisle_location": "<aisle hint>",
      "ai_tip": "<one tip>",
      "can_make_at_home": <true/false>,
      "availability_breadth": "<'mainstream' | 'specialty_only' | 'both'>",
      "preferred_store_types": <1-4 tokens from: "supermarket", "warehouse_club", "indian_grocery", "south_asian_specialty", "chinese_grocery", "korean_grocery", "japanese_grocery", "vietnamese_grocery", "thai_grocery", "filipino_grocery", "mexican_grocery", "italian_specialty", "middle_eastern_grocery", "halal_grocery", "caribbean_grocery", "african_grocery", "european_grocery", "latin_grocery", "southeast_asian_grocery">
    }}
  ]
}}
"""

    try:
        if not byok.llm_key:
            _enforce_daily_quota(byok.user_id, "recipe")
        response_text = await call_llm_text(
            prompt, max_tokens=5000,
            override_key=byok.llm_key, override_model=byok.llm_text_model,
            validate=parse_json_from_response,
        )
        result = parse_json_from_response(response_text)
        for ing in result.get("ingredients", []):
            _coerce_store_types(ing)

        # Persist if authenticated
        list_id = None
        if user_id:
            try:
                list_resp = supabase.table("shopping_lists").insert({
                    "user_id": user_id,
                    "title": f"{req.dish_name} -- shopping list",
                    "source_dish": req.dish_name,
                    "status": "planning",
                }).execute()
                list_id = list_resp.data[0]["id"]

                items = [
                    {
                        "list_id": list_id,
                        "original_ingredient": ing.get("original_ingredient"),
                        "us_equivalent_product": ing.get("us_equivalent_product"),
                        "us_equivalent_brand": ing.get("us_brand"),
                        "match_score": ing.get("match_score"),
                        "aisle_location": ing.get("aisle_location"),
                        "ai_tip": ing.get("ai_tip"),
                        "can_make_at_home": ing.get("can_make_at_home", False),
                        "availability_breadth": ing.get("availability_breadth"),
                        "preferred_store_types": ing.get("preferred_store_types") or [],
                    }
                    for ing in result.get("ingredients", [])
                ]
                if items:
                    supabase.table("list_items").insert(items).execute()
            except Exception as e:
                print(f"[recipe] Failed to persist: {e}")

        result["list_id"] = list_id
        return result
    except json.JSONDecodeError as e:
        raise HTTPException(500, f"AI response parse error: {e}")
    except httpx.HTTPError as e:
        raise HTTPException(500, f"AI API error: {e}")


@app.get("/profile/{user_id}")
async def get_profile(
    user_id: str,
    auth_user_id: Optional[str] = Depends(get_user_id),
):
    # Backend runs with SUPABASE_SERVICE_KEY which bypasses RLS, so we have to
    # enforce ownership in code — otherwise any caller can read any profile by UUID.
    if not auth_user_id:
        raise HTTPException(401, "Authentication required")
    if auth_user_id != user_id:
        raise HTTPException(403, "Forbidden")
    response = supabase.table("profiles").select("*").eq("id", user_id).execute()
    return response.data[0] if response.data else {"error": "Profile not found"}


# ============================
# STORES NEARBY
# ============================

PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

# Cuisine -> search terms for Google Places Text Search
CUISINE_QUERIES: dict[str, list[str]] = {
    "india": ["indian grocery", "south asian grocery", "patel brothers"],
    "indian": ["indian grocery", "south asian grocery", "patel brothers"],
    "south_asian": ["indian grocery", "pakistani grocery", "bangladeshi grocery"],
    "pakistan": ["pakistani grocery", "halal grocery", "south asian grocery"],
    "china": ["chinese grocery", "99 ranch", "asian supermarket"],
    "chinese": ["chinese grocery", "99 ranch", "asian supermarket"],
    "korea": ["korean grocery", "h mart", "asian supermarket"],
    "korean": ["korean grocery", "h mart", "asian supermarket"],
    "japan": ["japanese grocery", "mitsuwa", "japanese market"],
    "japanese": ["japanese grocery", "mitsuwa", "japanese market"],
    "vietnam": ["vietnamese grocery", "asian supermarket"],
    "vietnamese": ["vietnamese grocery", "asian supermarket"],
    "philippines": ["filipino grocery", "seafood city"],
    "filipino": ["filipino grocery", "seafood city"],
    "thailand": ["thai grocery", "asian supermarket"],
    "mexico": ["mexican grocery", "mexican market", "carniceria"],
    "mexican": ["mexican grocery", "mexican market", "carniceria"],
    "italy": ["italian grocery", "italian deli", "eataly"],
    "italian": ["italian grocery", "italian deli", "eataly"],
    "lebanon": ["middle eastern grocery", "halal grocery", "lebanese grocery"],
    "middle_eastern": ["middle eastern grocery", "halal grocery"],
    "turkey": ["turkish grocery", "middle eastern grocery"],
    "turkish": ["turkish grocery", "middle eastern grocery"],
    "nigeria": ["nigerian grocery", "african grocery", "west african grocery"],
    "nigerian": ["nigerian grocery", "african grocery"],
    "poland": ["polish grocery", "eastern european grocery"],
    "polish": ["polish grocery", "eastern european grocery"],
    # South Asia
    "bangladesh": ["bangladeshi grocery", "south asian grocery", "halal grocery"],
    "srilanka": ["sri lankan grocery", "south asian grocery", "indian grocery"],
    "nepal": ["nepali grocery", "himalayan grocery", "south asian grocery"],
    # East & Southeast Asia
    "taiwan": ["taiwanese grocery", "99 ranch", "asian supermarket"],
    "hongkong": ["hong kong supermarket", "cantonese grocery", "asian supermarket"],
    "indonesia": ["indonesian grocery", "southeast asian grocery", "asian supermarket"],
    "malaysia": ["malaysian grocery", "southeast asian grocery", "asian supermarket"],
    "singapore": ["southeast asian grocery", "malaysian grocery", "asian supermarket"],
    "cambodia": ["cambodian grocery", "southeast asian grocery", "asian supermarket"],
    "laos": ["lao grocery", "southeast asian grocery", "asian supermarket"],
    "myanmar": ["burmese grocery", "southeast asian grocery", "asian supermarket"],
    # Europe
    "france": ["french grocery", "french bakery", "european market"],
    "spain": ["spanish grocery", "european market", "gourmet grocery"],
    "portugal": ["portuguese grocery", "portuguese bakery", "european market"],
    "greece": ["greek grocery", "greek deli", "mediterranean market"],
    "germany": ["german deli", "german grocery", "european market"],
    "ireland": ["irish grocery", "british grocery", "european market"],
    "uk": ["british grocery", "british shop", "european market"],
    "sweden": ["scandinavian grocery", "swedish deli", "european market"],
    "hungary": ["hungarian deli", "eastern european grocery", "european market"],
    "czechia": ["czech deli", "eastern european grocery", "european market"],
    "romania": ["romanian grocery", "eastern european grocery", "european market"],
    "croatia": ["croatian grocery", "balkan grocery", "european market"],
    "serbia": ["serbian grocery", "balkan grocery", "eastern european grocery"],
    "bosnia": ["bosnian grocery", "balkan grocery", "halal grocery"],
    "albania": ["albanian grocery", "balkan grocery", "mediterranean market"],
    "armenia": ["armenian grocery", "middle eastern grocery", "mediterranean market"],
    "russia": ["russian grocery", "eastern european grocery", "european deli"],
    "ukraine": ["ukrainian grocery", "eastern european grocery", "european deli"],
    # Middle East & Central Asia
    "afghanistan": ["afghan grocery", "halal grocery", "middle eastern grocery"],
    "egypt": ["egyptian grocery", "middle eastern grocery", "halal grocery"],
    "iran": ["persian grocery", "middle eastern grocery", "halal grocery"],
    "iraq": ["iraqi grocery", "middle eastern grocery", "halal grocery"],
    "israel": ["kosher grocery", "israeli grocery", "middle eastern grocery"],
    "syria": ["syrian grocery", "middle eastern grocery", "halal grocery"],
    "uzbekistan": ["uzbek grocery", "halal grocery", "russian grocery"],
    # Africa
    "ethiopia": ["ethiopian grocery", "ethiopian market", "african grocery"],
    "ghana": ["ghanaian grocery", "west african grocery", "african grocery"],
    "kenya": ["kenyan grocery", "east african grocery", "african grocery"],
    "morocco": ["moroccan grocery", "halal grocery", "middle eastern grocery"],
    "somalia": ["somali grocery", "halal grocery", "east african grocery"],
    "southafrica": ["south african shop", "african grocery", "british grocery"],
    # Americas
    "argentina": ["argentinian grocery", "south american grocery", "latin grocery"],
    "brazil": ["brazilian market", "brazilian grocery", "latin grocery"],
    "colombia": ["colombian grocery", "latin grocery", "latin american market"],
    "cuba": ["cuban grocery", "cuban bakery", "latin grocery"],
    "dominicanrepublic": ["dominican grocery", "latin grocery", "caribbean grocery"],
    "ecuador": ["ecuadorian grocery", "latin grocery", "latin american market"],
    "elsalvador": ["salvadoran grocery", "central american market", "latin grocery"],
    "guatemala": ["guatemalan grocery", "central american market", "latin grocery"],
    "haiti": ["haitian grocery", "caribbean grocery", "west indian grocery"],
    "honduras": ["honduran grocery", "central american market", "latin grocery"],
    "jamaica": ["jamaican grocery", "caribbean grocery", "west indian grocery"],
    "peru": ["peruvian grocery", "latin grocery", "south american grocery"],
    "venezuela": ["venezuelan grocery", "latin grocery", "latin american market"],
}
DEFAULT_QUERIES = ["grocery store", "supermarket", "international market"]

# Store-type -> Places text-search keywords. Used when the LLM has classified a product and
# attached preferred_store_types; takes precedence over CUISINE_QUERIES.
STORE_TYPE_QUERIES: dict[str, list[str]] = {
    "supermarket": ["supermarket", "grocery store"],
    "warehouse_club": ["costco", "bj's wholesale", "sam's club"],
    "indian_grocery": ["indian grocery", "patel brothers", "apna bazaar"],
    "south_asian_specialty": ["south asian grocery", "pakistani grocery", "bangladeshi grocery"],
    "chinese_grocery": ["chinese grocery", "99 ranch", "asian supermarket"],
    "korean_grocery": ["korean grocery", "h mart"],
    "japanese_grocery": ["japanese grocery", "mitsuwa", "japanese market"],
    "vietnamese_grocery": ["vietnamese grocery", "asian supermarket"],
    "thai_grocery": ["thai grocery", "asian supermarket"],
    "filipino_grocery": ["filipino grocery", "seafood city"],
    "mexican_grocery": ["mexican grocery", "carniceria", "mexican market"],
    "italian_specialty": ["italian deli", "eataly", "italian grocery"],
    "middle_eastern_grocery": ["middle eastern grocery", "lebanese grocery"],
    "halal_grocery": ["halal grocery", "halal market"],
    "caribbean_grocery": ["caribbean grocery", "west indian grocery"],
    "african_grocery": ["african grocery", "west african grocery"],
    "european_grocery": ["european grocery", "polish grocery", "eastern european grocery"],
    "latin_grocery": ["latin grocery", "latin american market", "central american market"],
    "southeast_asian_grocery": ["southeast asian grocery", "asian supermarket"],
}

# Coarse mapping from a chain's metadata to the store-type tokens it represents.
# Used to compute coverage (does this store carry items needing X store-type?) and to
# decide whether a store qualifies as a "preferred" store for the active product context.
_MAINSTREAM_STORE_TYPES = {"supermarket", "warehouse_club"}
_FRESH_PROTEIN_RE = re.compile(
    r"\b(chicken|beef|pork|lamb|mutton|goat|veal|turkey|duck|fish|salmon|tuna|cod|"
    r"shrimp|prawns?|seafood|meat|bacon|sausage|ham)\b",
    re.IGNORECASE,
)


def _store_carries(ing: "IngredientCoverage", store_types_set: set) -> bool:
    """Whether a store plausibly stocks a recipe ingredient (recipe-coverage view)."""
    ing_types = set(ing.preferred_store_types or [])
    if not ing_types or (ing_types & store_types_set):
        return True
    # The model tags everyday staples (rice, produce, dairy, spices, oil) "supermarket" only,
    # but full-line specialty grocers stock them too — without this, Patel Brothers scored
    # 1/10 on biryani (just the saffron). Fresh meat/seafood is the exception: many specialty
    # grocers (Patel Brothers included) don't sell it, halal grocers do.
    is_specialty_grocer = bool(store_types_set - _MAINSTREAM_STORE_TYPES)
    if is_specialty_grocer and (ing_types & _MAINSTREAM_STORE_TYPES):
        if _FRESH_PROTEIN_RE.search(ing.name or ""):
            return "halal_grocery" in store_types_set
        return True
    return False


def _store_types_for_chain(chain: Optional[dict]) -> list[str]:
    if not chain:
        return []
    tokens: list[str] = []
    tier = chain.get("authenticity_tier")
    cuisines = chain.get("cuisines") or []
    if tier in (3, 4) or "general" in cuisines:
        tokens.append("supermarket")
    if "costco" in chain["chain_name"].lower() or "bj" in chain["chain_name"].lower() or "sam's" in chain["chain_name"].lower():
        tokens.append("warehouse_club")
    cuisine_to_type = {
        "indian": "indian_grocery",
        "south_asian": "south_asian_specialty",
        "pakistani": "south_asian_specialty",
        "bangladeshi": "south_asian_specialty",
        "chinese": "chinese_grocery",
        "korean": "korean_grocery",
        "japanese": "japanese_grocery",
        "vietnamese": "vietnamese_grocery",
        "thai": "thai_grocery",
        "filipino": "filipino_grocery",
        "mexican": "mexican_grocery",
        "italian": "italian_specialty",
        "middle_eastern": "middle_eastern_grocery",
        "lebanese": "middle_eastern_grocery",
        "syrian": "middle_eastern_grocery",
        "caribbean": "caribbean_grocery",
        "african": "african_grocery",
        "nigerian": "african_grocery",
    }
    for c in cuisines:
        t = cuisine_to_type.get(c)
        if t and t not in tokens:
            tokens.append(t)
    return tokens


# Heuristic fallback when Places returns an independent store (no chain match).
# Only includes ETHNIC keywords (high precision: "indian", "halal", "h mart" really do
# mean those things). The generic "supermarket" word and mainstream-chain names were
# removed because:
#   - All major US chains (Walmart, ShopRite, Wegmans, Whole Foods, Costco, BJ's, ...)
#     are already in chain_personas, so the chain matcher catches them with confidence.
#   - Random independent stores named "X Supermarket" or "Y Foods" were being
#     mis-tagged as mainstream-supermarket store-type and ranked RECOMMENDED for
#     mainstream-product searches (e.g. "Brothers Supermarket & Liquor" recommended
#     for pork shoulder). Trusting only chain_personas + ethnic-keyword signals
#     drops those false positives.
def _store_types_from_name(display_name: str) -> list[str]:
    name = display_name.lower()
    tokens: list[str] = []
    keyword_to_type = [
        ("indian", "indian_grocery"),
        ("patel", "indian_grocery"),
        ("apna", "indian_grocery"),
        ("subzi", "indian_grocery"),
        ("desi", "south_asian_specialty"),
        ("pakistani", "south_asian_specialty"),
        ("bangladeshi", "south_asian_specialty"),
        ("halal", "halal_grocery"),
        ("h mart", "korean_grocery"),
        ("hmart", "korean_grocery"),
        ("h-mart", "korean_grocery"),
        ("korean", "korean_grocery"),
        ("japanese", "japanese_grocery"),
        ("mitsuwa", "japanese_grocery"),
        ("99 ranch", "chinese_grocery"),
        ("chinese", "chinese_grocery"),
        ("hong kong", "chinese_grocery"),
        ("vietnamese", "vietnamese_grocery"),
        ("thai", "thai_grocery"),
        ("filipino", "filipino_grocery"),
        ("mexican", "mexican_grocery"),
        ("carniceria", "mexican_grocery"),
        ("italian", "italian_specialty"),
        ("eataly", "italian_specialty"),
        ("middle eastern", "middle_eastern_grocery"),
        ("lebanese", "middle_eastern_grocery"),
        ("turkish", "middle_eastern_grocery"),
        ("caribbean", "caribbean_grocery"),
        ("west indian", "caribbean_grocery"),
        ("african", "african_grocery"),
        ("ethiopian", "african_grocery"),
        ("somali", "african_grocery"),
        ("ghanaian", "african_grocery"),
        ("jamaican", "caribbean_grocery"),
        ("haitian", "caribbean_grocery"),
        ("polish", "european_grocery"),
        ("european", "european_grocery"),
        ("russian", "european_grocery"),
        ("ukrainian", "european_grocery"),
        ("balkan", "european_grocery"),
        ("romanian", "european_grocery"),
        ("hungarian", "european_grocery"),
        ("greek", "european_grocery"),
        ("portuguese", "european_grocery"),
        ("british", "european_grocery"),
        ("irish", "european_grocery"),
        ("scandinavian", "european_grocery"),
        ("persian", "middle_eastern_grocery"),
        ("armenian", "middle_eastern_grocery"),
        ("afghan", "middle_eastern_grocery"),
        ("mediterranean", "middle_eastern_grocery"),
        ("latin", "latin_grocery"),
        ("latino", "latin_grocery"),
        ("hispanic", "latin_grocery"),
        ("salvadoran", "latin_grocery"),
        ("guatemalan", "latin_grocery"),
        ("honduran", "latin_grocery"),
        ("dominican", "latin_grocery"),
        ("colombian", "latin_grocery"),
        ("peruvian", "latin_grocery"),
        ("ecuadorian", "latin_grocery"),
        ("venezuelan", "latin_grocery"),
        ("brazilian", "latin_grocery"),
        ("cuban", "latin_grocery"),
        ("cambodian", "southeast_asian_grocery"),
        ("burmese", "southeast_asian_grocery"),
        ("indonesian", "southeast_asian_grocery"),
        ("malaysian", "southeast_asian_grocery"),
        ("lao", "southeast_asian_grocery"),
    ]
    for kw, tok in keyword_to_type:
        # Match at a word start so "latin" doesn't fire on "Palatine" or "thai" on "Mathai".
        if tok not in tokens and re.search(r"\b" + re.escape(kw.strip()), name):
            tokens.append(tok)
    return tokens


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance in km between two coordinates."""
    R = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def _cache_key(lat: float, lon: float, cuisine: Optional[str], product_context: Optional[dict] = None) -> str:
    # Round to 2 decimal places (~1.1 km grid) so nearby users share cache hits.
    # Product-aware searches get their own cache namespace keyed by preferred_store_types.
    base = f"lat:{round(lat, 2)},lon:{round(lon, 2)}"
    if product_context and product_context.get("preferred_store_types"):
        types_key = ",".join(sorted(product_context["preferred_store_types"]))
        breadth = product_context.get("availability_breadth") or "both"
        return f"{base},product:{breadth}:{types_key}"
    return f"{base},cuisine:{cuisine or 'general'}"


async def _search_places(query: str, lat: float, lon: float, radius_m: int = 10000) -> list:
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        # Only request fields we use — keeps us in the cheaper tier
        "X-Goog-FieldMask": (
            "places.id,places.displayName,places.formattedAddress,"
            "places.location,places.rating,places.userRatingCount,"
            "places.priceLevel,places.businessStatus"
        ),
    }
    body = {
        "textQuery": query,
        "locationBias": {
            "circle": {
                "center": {"latitude": lat, "longitude": lon},
                "radius": float(radius_m),
            }
        },
        "maxResultCount": 10,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(PLACES_TEXT_SEARCH_URL, headers=headers, json=body)
        r.raise_for_status()
        return r.json().get("places", [])


def _classify_chain(display_name: str, chains: list) -> Optional[dict]:
    """Match a place's display name against known chain personas."""
    name_lower = display_name.lower()
    for c in chains:
        if c["chain_name"].lower() in name_lower:
            return c
        for alias in (c.get("chain_aliases") or []):
            if alias.lower() in name_lower:
                return c
    return None


class IngredientCoverage(BaseModel):
    name: str
    preferred_store_types: List[str] = []


class ProductContext(BaseModel):
    availability_breadth: Optional[str] = None  # 'mainstream' | 'specialty_only' | 'both'
    preferred_store_types: List[str] = []
    needed_items: Optional[List[IngredientCoverage]] = None  # for recipe coverage ranking


class NearbyStoresRequest(BaseModel):
    lat: float
    lon: float
    cuisine: Optional[str] = None
    product_context: Optional[ProductContext] = None


@app.post("/stores/nearby")
async def stores_nearby(
    req: NearbyStoresRequest,
    user_id: Optional[str] = Depends(get_user_id),
    byok: BYOK = Depends(get_byok),
):
    # Maps key is operator-only. User-supplied GCP keys would override this in older
    # builds, but most user keys were Android-restricted and failed server-side. The
    # operator key has per-day quota caps for cost protection (see CLAUDE.md).
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(503, "Google Maps API key not configured")

    pc = req.product_context
    pc_dict = pc.model_dump() if pc else None
    cache_key = _cache_key(req.lat, req.lon, req.cuisine, pc_dict)

    # Check 24-hour cache
    try:
        cached = supabase.table("store_cache").select("*").eq("cache_key", cache_key).execute()
        if cached.data:
            created = datetime.fromisoformat(cached.data[0]["created_at"].replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - created < timedelta(hours=24):
                return {"stores": cached.data[0]["results"], "from_cache": True}
    except Exception as e:
        print(f"[stores] Cache read failed: {e}")

    # Build query list: product_context takes precedence over cuisine.
    queries: list[str] = []
    if pc and pc.preferred_store_types:
        seen_q: set = set()
        for token in pc.preferred_store_types:
            for q in STORE_TYPE_QUERIES.get(token, []):
                if q not in seen_q:
                    seen_q.add(q)
                    queries.append(q)
        queries = queries[:4]
    if not queries:
        queries = CUISINE_QUERIES.get(req.cuisine or "", DEFAULT_QUERIES)[:3]

    # Fetch from Google Places
    all_places: list = []
    seen_ids: set = set()
    for q in queries:
        try:
            places = await _search_places(q, req.lat, req.lon)
            for p in places:
                pid = p.get("id", "")
                if pid and pid not in seen_ids:
                    seen_ids.add(pid)
                    all_places.append(p)
        except Exception as e:
            print(f"[stores] Places query '{q}' failed: {e}")

    # Load chain personas for classification
    try:
        chains = supabase.table("chain_personas").select("*").execute().data or []
    except Exception:
        chains = []

    breadth = pc.availability_breadth if pc else None
    preferred_set = set(pc.preferred_store_types) if pc else set()

    # Rank and enrich results
    results = []
    for p in all_places:
        display_name = p.get("displayName", {}).get("text", "")
        loc = p.get("location", {})
        plat = loc.get("latitude", 0.0)
        plon = loc.get("longitude", 0.0)
        dist_km = _haversine(req.lat, req.lon, plat, plon)

        chain = _classify_chain(display_name, chains)
        store_types = _store_types_for_chain(chain) if chain else _store_types_from_name(display_name)
        store_types_set = set(store_types)
        is_preferred = bool(preferred_set & store_types_set) if preferred_set else False

        # Scoring path. Three regimes:
        # 1) product_context with breadth = specialty_only: heavily penalize non-preferred stores.
        # 2) product_context with breadth = mainstream OR both: pure distance-first, authenticity is tiebreaker.
        # 3) No product_context (cuisine-only legacy path): existing cultural-tier ranking.
        if pc and preferred_set:
            base = 70 if is_preferred else 35
            if breadth == "specialty_only":
                if not is_preferred:
                    base -= 60  # near-exclude mainstream when the product is specialty-only
            elif breadth in ("mainstream", "both"):
                # Distance-first: clamp the cultural bonus so distance dominates.
                base = min(base, 60)
            cultural_score = base
        elif chain:
            tier = chain["authenticity_tier"]
            cuisine_match = req.cuisine and req.cuisine in chain["cuisines"]
            if cuisine_match and tier == 1:
                cultural_score = 95
            elif cuisine_match and tier == 2:
                cultural_score = 70
            elif tier == 1:
                cultural_score = 60
            elif tier == 2:
                cultural_score = 50
            elif tier == 3:
                cultural_score = 35
            else:
                cultural_score = 20
        else:
            if req.cuisine and queries != DEFAULT_QUERIES:
                cultural_score = 80
            else:
                cultural_score = 40

        # Distance penalty: -3.3 points per km, capped at -50
        dist_penalty = min(50.0, dist_km * 3.3)
        final_score = max(0.0, cultural_score - dist_penalty)

        # Per-ingredient coverage when the recipe flow asks for it.
        coverage_matched = 0
        coverage_items: list[str] = []
        if pc and pc.needed_items:
            for ing in pc.needed_items:
                if _store_carries(ing, store_types_set):
                    coverage_matched += 1
                    coverage_items.append(ing.name)

        results.append({
            "place_id": p.get("id", ""),
            "name": display_name,
            "address": p.get("formattedAddress", ""),
            "lat": plat,
            "lon": plon,
            "rating": p.get("rating"),
            "rating_count": p.get("userRatingCount"),
            "price_level": p.get("priceLevel"),
            "distance_km": round(dist_km, 2),
            "chain_name": chain["chain_name"] if chain else None,
            "cuisines": chain["cuisines"] if chain else [],
            "authenticity_tier": chain["authenticity_tier"] if chain else None,
            "price_tier": chain["price_tier"] if chain else None,
            "notes": chain["notes"] if chain else None,
            "store_types": store_types,
            "is_preferred": is_preferred,
            "is_specialty": cultural_score >= 80 or (chain and chain.get("authenticity_tier") == 1),
            "cultural_score": round(cultural_score),
            "final_score": round(final_score, 1),
            "coverage_matched": coverage_matched,
            "coverage_total": len(pc.needed_items) if (pc and pc.needed_items) else 0,
            "coverage_items": coverage_items,
        })

    # Sort + filter. Recipe flow with needed_items: drop stores that cover ZERO ingredients
    # (no point showing them on a recipe map), then sort by distance ASC, coverage DESC as
    # tiebreaker. Earlier behaviour (coverage-first sort) over-promoted distant general stores;
    # this ranks proximity first, which is what users actually optimize for when shopping.
    if pc and pc.needed_items:
        results = [r for r in results if r["coverage_matched"] > 0]
        results.sort(key=lambda r: (r["distance_km"], -r["coverage_matched"]))
    elif pc and breadth == "specialty_only":
        results.sort(key=lambda r: (0 if r["is_preferred"] else 1, -r["final_score"], r["distance_km"]))
    elif pc and breadth in ("mainstream", "both"):
        # Preferred (chain-classified) stores first, then distance. This keeps
        # real ShopRite / Walmart / Costco above random "X Supermarket" corner stores
        # even when the corner store is a hair closer.
        results.sort(key=lambda r: (0 if r["is_preferred"] else 1, r["distance_km"]))
    else:
        results.sort(key=lambda r: (-r["final_score"], r["distance_km"]))
    results = results[:15]

    # Cache write — fire and forget
    try:
        supabase.table("store_cache").upsert({"cache_key": cache_key, "results": results}).execute()
    except Exception as e:
        print(f"[stores] Cache write failed: {e}")

    return {"stores": results, "from_cache": False}
