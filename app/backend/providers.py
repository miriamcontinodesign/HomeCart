"""LLM provider router for HomeCart BYOK.

Three adapters: OpenRouter (default), OpenAI direct, Anthropic direct. The active
provider is auto-detected from the API key prefix so the user only has to paste
ONE key into the Settings UI without picking a provider explicitly:

    sk-ant-...   -> Anthropic direct (Messages API shape)
    sk-or-...    -> OpenRouter (OpenAI-compatible chat completions)
    sk-...       -> OpenAI direct (OpenAI chat completions)

User can also override the model IDs per call via override_vision_model /
override_text_model — those flow through from the X-User-LLM-*-Model headers
on the request. Falls back to PROVIDER_DEFAULTS when not supplied.

Parameter normalization is critical: OpenAI reasoning models (o-series, all
GPT-5.x) reject `max_tokens` and require `max_completion_tokens`; Gemini
rejects penalties; Anthropic uses a different shape entirely.
"""
from __future__ import annotations
import os
import re
from typing import Callable, Optional
import httpx
from fastapi import HTTPException


# Env-driven defaults (the operator's keys). These are used when no user override is provided.
ENV_LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://openrouter.ai/api/v1")
ENV_LLM_API_KEY = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("LLM_API_KEY", "")
# Free-tier defaults are intentionally cheap — protect the operator's wallet when non-BYOK users hit /scan and /recipe.
ENV_VISION_MODEL = os.environ.get("LLM_VISION_MODEL", "openai/gpt-5.4-nano")
ENV_TEXT_MODEL = os.environ.get("LLM_TEXT_MODEL", "deepseek/deepseek-v4-flash")
# Comma-separated backups tried in order when the primary model errors, is rate-limited, or returns nothing.
# Operator path only — BYOK users get exactly the model they picked.
ENV_VISION_FALLBACKS = [m.strip() for m in os.environ.get("LLM_VISION_FALLBACKS", "").split(",") if m.strip()]
ENV_TEXT_FALLBACKS = [m.strip() for m in os.environ.get("LLM_TEXT_FALLBACKS", "").split(",") if m.strip()]

# OpenRouter analytics headers — harmless, helps with leaderboard listing.
LLM_APP_REFERRER = os.environ.get("LLM_APP_REFERRER", "https://homecart.app")
LLM_APP_TITLE = os.environ.get("LLM_APP_TITLE", "HomeCart")


# Per-provider routing config. Default model IDs apply when the user supplies a key but doesn't pick a model.
PROVIDER_DEFAULTS = {
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "vision_model": "openai/gpt-5.4-nano",
        "text_model": "deepseek/deepseek-v4-flash",
        "shape": "openai",
    },
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "vision_model": "gpt-5.4-nano",
        "text_model": "gpt-5.4-nano",
        "shape": "openai",
    },
    "anthropic": {
        "base_url": "https://api.anthropic.com/v1",
        "vision_model": "claude-haiku-4-5-20251001",
        "text_model": "claude-haiku-4-5-20251001",
        "shape": "anthropic",
    },
}


def detect_provider(key: str) -> str:
    if not key:
        return "openrouter"
    if key.startswith("sk-ant-"):
        return "anthropic"
    if key.startswith("sk-or-"):
        return "openrouter"
    if key.startswith("sk-"):
        return "openai"
    return "openrouter"


# Reasoning-model detection: OpenAI's o-series and all GPT-5.x reject `max_tokens` and `temperature`.
# Matches "o1", "o3", "o4-mini", "gpt-5", "gpt-5.4", "gpt-5.5-pro", "openai/gpt-5.4-nano" etc.
_OPENAI_REASONING_RE = re.compile(r"(^|/)(o[1-9](-|$)|gpt-5(\.|$|-))", re.IGNORECASE)


def _is_openai_reasoning(model: str) -> bool:
    return bool(_OPENAI_REASONING_RE.search(model or ""))


def _is_gemini(model: str) -> bool:
    m = (model or "").lower()
    return m.startswith("google/") or "gemini" in m


def _normalize_openai_body(model: str, body: dict) -> dict:
    """Strip / rename params that the target model rejects.

    OpenAI reasoning models: max_tokens -> max_completion_tokens, drop temperature.
    Gemini (via OpenRouter): drop frequency_penalty / presence_penalty / n / logprobs.
    """
    body = dict(body)
    if _is_openai_reasoning(model):
        if "max_tokens" in body:
            body["max_completion_tokens"] = body.pop("max_tokens")
        body.pop("temperature", None)
    if _is_gemini(model):
        for p in ("frequency_penalty", "presence_penalty", "n", "logprobs", "logit_bias"):
            body.pop(p, None)
    return body


async def _post_openai_shape(base_url: str, key: str, model: str, messages: list, max_tokens: int) -> str:
    """OpenAI-compatible chat completions (OpenRouter, OpenAI direct). Returns the assistant text."""
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": LLM_APP_REFERRER,
        "X-Title": LLM_APP_TITLE,
    }
    body = _normalize_openai_body(model, {"model": model, "max_tokens": max_tokens, "messages": messages})
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{base_url}/chat/completions", headers=headers, json=body)
        if r.status_code >= 400:
            raise HTTPException(r.status_code, f"LLM gateway error: {r.text[:300]}")
        data = r.json()
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content")
        if not content:
            # Free/reasoning models occasionally return an empty message or an in-body error.
            raise HTTPException(502, f"LLM returned no content: {str(data)[:300]}")
        return content


def _anthropic_messages_from_openai(messages: list) -> list:
    out = []
    for m in messages:
        content = m.get("content")
        if isinstance(content, str):
            out.append({"role": m["role"], "content": content})
            continue
        parts = []
        for part in content:
            if part.get("type") == "image_url":
                url = part["image_url"]["url"]
                if url.startswith("data:"):
                    header, b64 = url.split(",", 1)
                    media_type = header.split(";")[0].replace("data:", "") or "image/jpeg"
                else:
                    raise HTTPException(400, "Anthropic provider only accepts base64 data URLs for images")
                parts.append({"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}})
            elif part.get("type") == "text":
                parts.append({"type": "text", "text": part["text"]})
        out.append({"role": m["role"], "content": parts})
    return out


async def _post_anthropic_shape(base_url: str, key: str, model: str, messages: list, max_tokens: int) -> str:
    anthropic_messages = _anthropic_messages_from_openai(messages)
    headers = {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {"model": model, "max_tokens": max_tokens, "messages": anthropic_messages}
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{base_url}/messages", headers=headers, json=body)
        if r.status_code >= 400:
            raise HTTPException(r.status_code, f"Anthropic error: {r.text[:300]}")
        data = r.json()
        for block in data.get("content", []):
            if block.get("type") == "text":
                return block["text"]
        raise HTTPException(502, f"Unexpected Anthropic shape: {str(data)[:300]}")


def _resolve_model(provider: str, kind: str, override: Optional[str]) -> str:
    """User-picked model wins. Falls back to provider default for the (provider, kind) pair."""
    if override:
        return override
    cfg = PROVIDER_DEFAULTS[provider]
    return cfg["vision_model"] if kind == "vision" else cfg["text_model"]


async def call_llm(
    messages: list,
    max_tokens: int,
    kind: str = "text",
    override_key: Optional[str] = None,
    override_model: Optional[str] = None,
    validate: Optional[Callable[[str], object]] = None,
) -> str:
    """Single entry point. Routes by key prefix; uses override_model when supplied.

    `validate` (operator fallback chain only) is called on each reply; if it raises, the
    reply counts as a failure and the next model is tried — free models sometimes return
    truncated or malformed JSON.
    """
    if override_key:
        provider = detect_provider(override_key)
        cfg = PROVIDER_DEFAULTS[provider]
        model = _resolve_model(provider, kind, override_model)
        if cfg["shape"] == "anthropic":
            return await _post_anthropic_shape(cfg["base_url"], override_key, model, messages, max_tokens)
        return await _post_openai_shape(cfg["base_url"], override_key, model, messages, max_tokens)

    if not ENV_LLM_API_KEY:
        raise HTTPException(503, "LLM API key not configured on the server (and no user key supplied)")
    if override_model:
        models = [override_model]
    elif kind == "vision":
        models = [ENV_VISION_MODEL, *ENV_VISION_FALLBACKS]
    else:
        models = [ENV_TEXT_MODEL, *ENV_TEXT_FALLBACKS]

    last_error: Optional[HTTPException] = None
    for model in models:
        try:
            content = await _post_openai_shape(ENV_LLM_BASE_URL, ENV_LLM_API_KEY, model, messages, max_tokens)
            if validate:
                try:
                    validate(content)
                except Exception as e:
                    print(f"[llm] {model} returned an unusable reply: {e}")
                    last_error = HTTPException(502, f"AI response parse error: {e}")
                    continue
            return content
        except HTTPException as e:
            if e.status_code == 401:
                raise  # bad operator key — every model would fail the same way
            print(f"[llm] {model} failed ({e.status_code}): {str(e.detail)[:200]}")
            last_error = e
        except httpx.HTTPError as e:
            print(f"[llm] {model} failed (network): {e!r}")
            last_error = HTTPException(504, f"LLM network error: {e!r}")
    if len(models) > 1:
        # Don't pass an upstream 429 through: the app reserves 429 for the daily quota.
        raise HTTPException(503, "All AI models are busy right now. Please try again in a minute.")
    raise last_error


async def llm_vision(
    image_base64: str,
    prompt: str,
    max_tokens: int = 1500,
    override_key: Optional[str] = None,
    override_model: Optional[str] = None,
    validate: Optional[Callable[[str], object]] = None,
) -> str:
    messages = [{
        "role": "user",
        "content": [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}},
            {"type": "text", "text": prompt},
        ],
    }]
    return await call_llm(messages, max_tokens=max_tokens, kind="vision",
                          override_key=override_key, override_model=override_model, validate=validate)


async def llm_text(
    prompt: str,
    max_tokens: int = 1500,
    override_key: Optional[str] = None,
    override_model: Optional[str] = None,
    validate: Optional[Callable[[str], object]] = None,
) -> str:
    messages = [{"role": "user", "content": prompt}]
    return await call_llm(messages, max_tokens=max_tokens, kind="text",
                          override_key=override_key, override_model=override_model, validate=validate)
