"""
services/ai_service.py
======================
Service d'analyse IA multi-moteurs pour LOCATION.

  1. Gemini (priorité par défaut) — Google Generative Language API
  2. DeepSeek                      — API compatible OpenAI
  3. Fallback                      — parser de mots-clés pur Python

Chaîne de fallback : moteur préféré → moteur alternatif → keyword parser.
"""

from __future__ import annotations

import json
import logging
import os
import re
from contextvars import ContextVar
from typing import Any, Callable, Optional

import httpx
from pydantic import ValidationError

from schemas import AISearchInterpretation

logger = logging.getLogger(__name__)


# ============================================================
#  CONFIGURATION
# ============================================================
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "").strip()
DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "").strip()
AI_TIMEOUT: float = float(os.getenv("AI_TIMEOUT", "10"))
AI_ENGINE_PREFERENCE: str = os.getenv("AI_ENGINE_PREFERENCE", "gemini").strip().lower()

GEMINI_API_URL = os.getenv(
    "GEMINI_API_URL",
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
)
DEEPSEEK_API_URL = os.getenv(
    "DEEPSEEK_API_URL", "https://api.deepseek.com/v1/chat/completions"
)
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")


# ============================================================
#  CONTEXTUEL : moteur utilisé pour la requête courante
# ============================================================
_last_engine: ContextVar[str] = ContextVar(
    "last_engine", default="keyword-matcher-v0"
)


# ============================================================
#  EXCEPTION CUSTOM
# ============================================================
class AIServiceError(Exception):
    """Erreur d'un moteur IA (timeout, quota, réponse invalide...)."""


# ============================================================
#  DÉTECTION DES CLÉS VALIDES
# ============================================================
_PLACEHOLDER_KEYS: set[str] = {
    "",
    "change_me",
    "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "your_api_key_here",
}


def _is_valid_key(key: str) -> bool:
    if not key:
        return False
    if key in _PLACEHOLDER_KEYS:
        return False
    if key.startswith("sk-") and key[3:] and set(key[3:].lower()) == {"x"}:
        return False
    if key.startswith("AIza") and key[4:] and set(key[4:].lower()) == {"x"}:
        return False
    return True


def is_ai_configured() -> bool:
    return _is_valid_key(GEMINI_API_KEY) or _is_valid_key(DEEPSEEK_API_KEY)


def get_active_engine() -> str:
    if not is_ai_configured():
        return "keyword-matcher-v0"

    if AI_ENGINE_PREFERENCE == "deepseek" and _is_valid_key(DEEPSEEK_API_KEY):
        return "deepseek"
    if AI_ENGINE_PREFERENCE == "gemini" and _is_valid_key(GEMINI_API_KEY):
        return "gemini"

    if _is_valid_key(GEMINI_API_KEY):
        return "gemini"
    if _is_valid_key(DEEPSEEK_API_KEY):
        return "deepseek"

    return "keyword-matcher-v0"


def get_last_engine() -> str:
    return _last_engine.get()


# ============================================================
#  PROMPT COMMUN  ⚠️ MODIFIÉ — sous-types chambre inclus
# ============================================================
def _build_prompt(query: str) -> str:
    return (
        "Tu es un assistant pour LOCATION, plateforme immobilière au Bénin. "
        "Extrais les critères de recherche immobilière de cette requête utilisateur : "
        f'"{query}".\n\n'
        "Réponds UNIQUEMENT par un objet JSON (sans texte avant ni après, "
        "sans balises Markdown) avec exactement ces champs :\n"
        '- "type": "chambre" | "chambre_sanitaire" | "chambre_ordinaire" | '
        '"studio" | "appartement" | "maison" | "villa" | "terrain" | "bureau" | null\n'
        '  Note : "chambre_sanitaire" = chambre avec douche/WC privés ; '
        '"chambre_ordinaire" = sanitaires partagés ; "chambre" = générique.\n'
        '- "city": string | null (nom canonique d\'une ville du Bénin ; '
        '"Calavi" → "Abomey-Calavi")\n'
        '- "max_price": number | null (FCFA ; "30k" → 30000, "1.5M" → 1500000)\n'
        '- "min_price": number | null (FCFA ; mêmes conversions)\n'
        '- "keywords": array of string (max 5 mots-clés libres, hors type/ville/prix)\n'
    )


# ============================================================
#  HELPERS HTTP
# ============================================================
def _raise_for_status(response: httpx.Response, engine: str) -> None:
    if response.status_code == 200:
        return
    code = response.status_code
    if code == 401:
        raise AIServiceError(f"{engine} : clé API invalide (401)")
    if code == 403:
        raise AIServiceError(f"{engine} : accès interdit (403)")
    if code == 429:
        raise AIServiceError(f"{engine} : quota / rate-limit dépassé (429)")
    if 500 <= code < 600:
        raise AIServiceError(f"{engine} : erreur serveur ({code})")
    raise AIServiceError(f"{engine} : réponse inattendue ({code})")


def _parse_json_safely(text: str, engine: str) -> dict[str, Any]:
    cleaned = text.strip()

    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()

    if not cleaned.startswith("{"):
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if match:
            cleaned = match.group(0)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise AIServiceError(f"{engine} : JSON invalide ({exc})")

    if not isinstance(data, dict):
        raise AIServiceError(f"{engine} : la réponse n'est pas un objet JSON")

    return data


# ============================================================
#  MOTEUR GEMINI
# ============================================================
def _call_gemini(query: str) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "contents": [{"parts": [{"text": _build_prompt(query)}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 256,
            "responseMimeType": "application/json",
        },
    }
    url = f"{GEMINI_API_URL}?key={GEMINI_API_KEY}"

    try:
        with httpx.Client(timeout=AI_TIMEOUT) as client:
            response = client.post(url, json=payload)
    except httpx.TimeoutException:
        raise AIServiceError(f"Gemini : timeout après {AI_TIMEOUT}s")
    except httpx.HTTPError as exc:
        raise AIServiceError(f"Gemini : erreur transport ({exc.__class__.__name__})")

    _raise_for_status(response, "Gemini")

    try:
        body = response.json()
        text = body["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, ValueError) as exc:
        raise AIServiceError(f"Gemini : réponse mal formée ({exc.__class__.__name__})")

    return _parse_json_safely(text, "Gemini")


# ============================================================
#  MOTEUR DEEPSEEK
# ============================================================
def _call_deepseek(query: str) -> dict[str, Any]:
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": "Tu réponds UNIQUEMENT en JSON strict."},
            {"role": "user", "content": _build_prompt(query)},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
        "max_tokens": 256,
    }
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=AI_TIMEOUT) as client:
            response = client.post(DEEPSEEK_API_URL, json=payload, headers=headers)
    except httpx.TimeoutException:
        raise AIServiceError(f"DeepSeek : timeout après {AI_TIMEOUT}s")
    except httpx.HTTPError as exc:
        raise AIServiceError(f"DeepSeek : erreur transport ({exc.__class__.__name__})")

    _raise_for_status(response, "DeepSeek")

    try:
        body = response.json()
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError) as exc:
        raise AIServiceError(f"DeepSeek : réponse mal formée ({exc.__class__.__name__})")

    return _parse_json_safely(content, "DeepSeek")


# ============================================================
#  PARSER DE FALLBACK (keywords, pur Python)
# ============================================================
_TYPE_KEYWORDS: dict[str, list[str]] = {
    "chambre_sanitaire": ["chambre sanitaire", "chambre avec douche", "chambre avec wc"],
    "chambre_ordinaire": ["chambre ordinaire", "chambre simple", "chambre etudiante"],
    "chambre":     ["chambre", "chambres"],
    "studio":      ["studio", "studios", "studette"],
    "appartement": ["appartement", "appartements", "appart", "apparts", "f2", "f3"],
    "maison":      ["maison", "maisons", "bicoque"],
    "villa":       ["villa", "villas"],
    "terrain":     ["terrain", "terrains", "parcelle"],
    "bureau":      ["bureau", "bureaux", "local commercial"],
}

_CITY_ALIASES: dict[str, str] = {
    "cotonou": "Cotonou",
    "calavi": "Abomey-Calavi",
    "abomey-calavi": "Abomey-Calavi",
    "abomey calavi": "Abomey-Calavi",
    "porto-novo": "Porto-Novo",
    "porto novo": "Porto-Novo",
    "parakou": "Parakou",
    "bohicon": "Bohicon",
    "natitingou": "Natitingou",
    "ouidah": "Ouidah",
    "abomey": "Abomey",
}

_STOPWORDS: set[str] = {
    "le", "la", "les", "un", "une", "des", "du", "de", "d", "à", "a",
    "au", "aux", "dans", "sur", "pour", "avec", "sans", "et", "ou",
    "je", "tu", "il", "elle", "nous", "vous", "ils", "elles",
    "veux", "cherche", "voudrais", "souhaite", "besoin", "d'un", "d'une",
    "max", "maximum", "jusqu'à", "jusqua", "moins", "plus", "environ", "vers",
    "fcfa", "cfa", "f", "francs", "franc",
}


def _extract_price(text: str) -> Optional[float]:
    tl = text.lower()

    m = re.search(r"(\d+(?:[.,]\d+)?)\s*k\b", tl)
    if m:
        return float(m.group(1).replace(",", ".")) * 1000.0

    m = re.search(r"\b(\d{1,3}(?:[ ,.]\d{3})+)\b", tl)
    if m:
        cleaned = re.sub(r"[ ,.]", "", m.group(1))
        try:
            return float(cleaned)
        except ValueError:
            pass

    m = re.search(r"\b(\d{4,})\b", tl)
    if m:
        return float(m.group(1))

    return None


def _keyword_parser(query: str) -> AISearchInterpretation:
    q_lower = query.lower()

    detected_type: Optional[str] = None
    for type_name, keywords in _TYPE_KEYWORDS.items():
        if any(kw in q_lower for kw in keywords):
            detected_type = type_name
            break

    detected_city: Optional[str] = None
    for alias in sorted(_CITY_ALIASES.keys(), key=len, reverse=True):
        if alias in q_lower:
            detected_city = _CITY_ALIASES[alias]
            break

    max_price: Optional[float] = None
    min_price: Optional[float] = None

    m_min = re.search(r"(?:min|minimum|à partir de|a partir de)\s*(\d[\d ,.]*k?)", q_lower)
    if m_min:
        parsed = _extract_price(m_min.group(1))
        if parsed:
            min_price = parsed

    m_max = re.search(r"(?:max|maximum|moins de|jusqu'?à|<=?|≤)\s*(\d[\d ,.]*k?)", q_lower)
    if m_max:
        parsed = _extract_price(m_max.group(1))
        if parsed:
            max_price = parsed

    if max_price is None and min_price is None:
        bare = _extract_price(q_lower)
        if bare is not None:
            max_price = bare

    tokens = re.findall(r"\b[a-zàâäéèêëîïôöùûüç'-]{3,}\b", q_lower)
    keywords = [t for t in tokens if t not in _STOPWORDS and t not in _CITY_ALIASES]

    return AISearchInterpretation(
        type=detected_type,
        city=detected_city,
        max_price=max_price,
        min_price=min_price,
        keywords=keywords[:10],
    )


# ============================================================
#  CHAÎNE DE FALLBACK
# ============================================================
EngineCaller = Callable[[str], dict[str, Any]]


def _candidate_engines() -> list[tuple[str, EngineCaller]]:
    engines: list[tuple[str, EngineCaller]] = []

    gemini_ok = _is_valid_key(GEMINI_API_KEY)
    deepseek_ok = _is_valid_key(DEEPSEEK_API_KEY)

    if AI_ENGINE_PREFERENCE == "deepseek":
        if deepseek_ok:
            engines.append(("deepseek", _call_deepseek))
        if gemini_ok:
            engines.append(("gemini", _call_gemini))
    else:
        if gemini_ok:
            engines.append(("gemini", _call_gemini))
        if deepseek_ok:
            engines.append(("deepseek", _call_deepseek))

    return engines


# ============================================================
#  POINT D'ENTRÉE PUBLIC
# ============================================================
def parse_query_with_ai(query: str) -> AISearchInterpretation:
    for engine_name, caller in _candidate_engines():
        try:
            raw = caller(query)
            interpretation = AISearchInterpretation(**raw)
        except AIServiceError as exc:
            logger.warning("⚠️ %s indisponible : %s", engine_name, exc)
            continue
        except ValidationError as exc:
            logger.warning(
                "⚠️ %s : schéma invalide (%d erreurs)", engine_name, exc.error_count()
            )
            continue
        except Exception as exc:
            logger.warning(
                "⚠️ %s : erreur inattendue (%s)", engine_name, exc.__class__.__name__
            )
            continue

        _last_engine.set(engine_name)
        logger.info("🤖 Moteur IA utilisé : %s", engine_name)
        return interpretation

    logger.info("🔙 Fallback parser local (keyword-matcher-v0)")
    _last_engine.set("keyword-matcher-v0")
    return _keyword_parser(query)