"""
Shared Gemini client using the ``google-genai`` SDK
(lighter than the legacy ``google-generativeai`` stack).
"""

from __future__ import annotations

import os
import re
from typing import Any, Optional, Tuple

from google import genai
from google.genai import types
from google.genai.types import GenerateContentResponse

_client: Optional[genai.Client] = None


def normalize_model_id(name: str) -> str:
    if name.startswith("models/"):
        return name[len("models/"):]
    return name


def resolve_model_id_from_env() -> str:
    user = os.getenv("AI_MODEL_NAME")
    if user:
        return normalize_model_id(user)
    return "gemini-2.0-flash"


def get_gemini_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY is not set.")
        timeout_ms = int(os.getenv("GEMINI_HTTP_TIMEOUT_MS", "120000"))
        _client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=float(timeout_ms)),
        )
    return _client


def _default_safety_settings() -> list[types.SafetySetting]:
    return [
        types.SafetySetting(
            category=types.HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold=types.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        ),
        types.SafetySetting(
            category=types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold=types.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        ),
        types.SafetySetting(
            category=types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold=types.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        ),
        types.SafetySetting(
            category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold=types.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        ),
    ]


def _extract_text_and_finish(
    response: GenerateContentResponse,
) -> Tuple[Optional[str], Any]:
    try:
        t = response.text
        if t and str(t).strip():
            return str(t).strip(), None
    except Exception:
        pass

    finish_reason = None
    candidates = getattr(response, "candidates", None)
    if candidates and len(candidates) > 0:
        candidate = candidates[0]
        finish_reason = getattr(candidate, "finish_reason", None)
        content = getattr(candidate, "content", None)
        if content:
            parts = getattr(content, "parts", None)
            if parts:
                parts_text = []
                try:
                    for part in parts:
                        text = getattr(part, "text", "")
                        if text:
                            parts_text.append(str(text))
                except TypeError:
                    text = getattr(parts, "text", "")
                    if text:
                        parts_text.append(str(text))
                if parts_text:
                    return "".join(parts_text).strip(), finish_reason

    if not candidates or len(candidates) == 0:
        try:
            parts = getattr(response, "parts", None)
            if parts:
                parts_text = []
                for part in parts:
                    text = getattr(part, "text", "")
                    if text:
                        parts_text.append(str(text))
                if parts_text:
                    return "".join(parts_text).strip(), finish_reason
        except Exception:
            pass

    return None, finish_reason


def generate_content_text(
    prompt: str,
    *,
    model_id: str,
    max_output_tokens: int,
    temperature: float,
    safety_settings: Optional[list[types.SafetySetting]] = None,
) -> str:
    """
    Run generateContent and return plain text.
    Raises on API errors or empty usable text.
    """
    client = get_gemini_client()
    mid = normalize_model_id(model_id)
    cfg = types.GenerateContentConfig(
        temperature=float(temperature),
        max_output_tokens=int(max_output_tokens),
        safety_settings=safety_settings or _default_safety_settings(),
    )

    try:
        response = client.models.generate_content(
            model=mid,
            contents=prompt,
            config=cfg,
        )
    except Exception as api_error:
        error_str = str(api_error)
        if (
            "429" in error_str
            or "quota" in error_str.lower()
            or "rate.limit" in error_str.lower()
        ):
            retry_delay = None
            if "retry_delay" in error_str or "retry in" in error_str.lower():
                delay_match = re.search(
                    r"retry.*?(\d+\.?\d*)\s*s", error_str, re.IGNORECASE
                )
                if delay_match:
                    retry_delay = float(delay_match.group(1))
            if retry_delay:
                error_msg = (
                    f"API quota exceeded. Please wait {int(retry_delay)} "
                    "seconds before trying again. "
                    "You can check your usage at https://ai.dev/usage"
                )
            else:
                error_msg = (
                    "API quota exceeded. Please check your Google Cloud billing "
                    "and quota limits at https://ai.dev/usage"
                )
            quota_error = ValueError(error_msg)
            quota_error.retry_delay = retry_delay  # type: ignore[attr-defined]
            quota_error.is_quota_error = True  # type: ignore[attr-defined]
            raise quota_error
        raise

    response_text, finish_reason = _extract_text_and_finish(response)

    if finish_reason == types.FinishReason.MAX_TOKENS and not response_text:
        raise Exception("Response hit token limit before generating content.")
    if finish_reason == types.FinishReason.SAFETY:
        raise Exception("Content was blocked by safety filters.")
    if finish_reason == types.FinishReason.RECITATION:
        raise Exception("Content was blocked due to recitation detection.")

    if response_text:
        return response_text

    msg = f"Gemini API returned empty response. finish_reason={finish_reason!r}"
    raise Exception(msg)
