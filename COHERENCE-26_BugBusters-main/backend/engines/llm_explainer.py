"""
llm_explainer.py
Converts structured anomaly/leakage data into plain-English policy explanations.

Primary path  → Groq API (llama-3.3-70b-versatile by default, configurable)
Fallback path → Rule-based template engine (always pre-computed, zero API risk)

Output schema (identical regardless of which path fires):
    {
        explanation: str,
        causes: list[str],          # 3 items, most to least likely
        recommendation: str,
        confidence: "ai" | "rule",
        model_used: str             # which groq model was used (or "rule_engine")
    }

Environment variables:
    GROQ_API_KEY        → required for AI path
    GROQ_MODEL          → optional, defaults to "llama-3.3-70b-versatile"
    GROQ_MAX_TOKENS     → optional, defaults to 500
    GROQ_TEMPERATURE    → optional, defaults to 0.3
    GROQ_MAX_AI_CALLS   → optional, defaults to 5 (batch cap)
"""

from __future__ import annotations

import os
import json
import logging
from typing import Any

from groq import Groq

logger = logging.getLogger(__name__)

# ── Dynamic config from environment ──────────────────────────────────────────

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL      = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_MAX_TOKENS = int(os.getenv("GROQ_MAX_TOKENS", "500"))
GROQ_TEMP       = float(os.getenv("GROQ_TEMPERATURE", "0.3"))
GROQ_MAX_CALLS  = int(os.getenv("GROQ_MAX_AI_CALLS", "5"))

# Available Groq models you can switch to via GROQ_MODEL env var:
#   llama-3.3-70b-versatile     ← default, best quality
#   llama-3.1-8b-instant        ← fastest, lowest latency
#   llama3-8b-8192              ← compact, good for batch
#   llama3-70b-8192             ← large context
#   gemma2-9b-it                ← Google Gemma via Groq
#   mixtral-8x7b-32768          ← large context window


# ── Rule-based fallback templates ─────────────────────────────────────────────

_UNDERUTIL_CAUSES = [
    "Procurement delays — tenders not finalized or contractor not mobilized",
    "Administrative bottlenecks — approvals pending at district/state level",
    "Fund release timing mismatch — tranches received late from higher level",
]

_SPIKE_CAUSES = [
    "March Rush behavior — deliberate year-end spend surge to avoid lapse",
    "Bulk procurement — large single contract executed after long inactivity",
    "Data entry backlog — previously unrecorded transactions entered together",
]

_LEAKAGE_CAUSES = [
    "Inter-level diversion — funds retained at intermediate administrative level",
    "Delayed remittance — funds transferred but not credited in time",
    "Misreporting — amount_received understated due to accounting discrepancy",
]


def _rule_fallback(anomaly: dict[str, Any]) -> dict[str, Any]:
    """
    Generates a structured explanation from rule templates.
    Deterministic, always available, never fails.
    """
    atype    = anomaly.get("anomaly_type", "underutilization")
    dept     = anomaly.get("department", "the department")
    district = anomaly.get("district", "the district")
    state    = anomaly.get("state", "")
    util     = anomaly.get("utilization_rate", anomaly.get("absorption_ratio", 0))
    peer_avg = anomaly.get("peer_mean", None)
    z        = anomaly.get("z_score", None)
    severity = anomaly.get("severity", "WARNING")
    gap_amt  = anomaly.get("gap_amount", None)

    if atype in ("underutilization", "severe_underutilization"):
        peer_str = f" compared to the state peer average of {round(peer_avg, 1)}%" if peer_avg else ""
        z_str    = f" ({abs(round(z, 1))} standard deviations from peer norm)" if z else ""
        explanation = (
            f"{dept} department in {district}{', ' + state if state else ''} has utilized "
            f"only {round(util, 1)}% of its allocated budget{peer_str}{z_str}. "
            f"This is classified as {severity.lower()} underutilization and indicates "
            f"fund absorption capacity constraints at the ground level."
        )
        causes = _UNDERUTIL_CAUSES
        recommendation = (
            f"Conduct an immediate expenditure review for {dept} in {district}. "
            f"Identify pending procurement files and unblock approvals before the "
            f"next quarterly review. If absorption capacity is structurally limited, "
            f"initiate reallocation to higher-demand departments within the state."
        )

    elif atype == "spending_spike":
        explanation = (
            f"{dept} department in {district} shows an abnormal spending spike "
            f"of {round(util, 1)}%"
            f"{f', against peer average of {round(peer_avg, 1)}%' if peer_avg else ''}. "
            f"This pattern is consistent with reactive year-end spending rather than "
            f"planned programmatic delivery."
        )
        causes = _SPIKE_CAUSES
        recommendation = (
            f"Audit the procurement records for {dept} in {district} for the flagged period. "
            f"Verify whether expenditure reflects genuine project delivery or bulk payment "
            f"of pending bills. Flag for next CAG sample audit."
        )

    else:  # leakage
        gap_str = f"₹{round(gap_amt / 1e5, 2)} Lakh unaccounted" if gap_amt else "gap detected"
        explanation = (
            f"Fund flow from {anomaly.get('from_entity', 'sender')} to "
            f"{anomaly.get('to_entity', 'receiver')} shows a leakage signal — "
            f"{gap_str}. Absorption ratio of "
            f"{round(util, 3) if util < 2 else round(util, 1)} "
            f"is below the acceptable threshold of 0.85, indicating funds may not have "
            f"reached the intended beneficiary level."
        )
        causes = _LEAKAGE_CAUSES
        recommendation = (
            f"Initiate a payment trail audit for this transfer. Cross-verify bank records "
            f"of both sending and receiving entities. If diversion is confirmed, escalate "
            f"to state vigilance under PFMS protocols."
        )

    return {
        "explanation":    explanation,
        "causes":         causes,
        "recommendation": recommendation,
        "confidence":     "rule",
        "model_used":     "rule_engine",
    }


# ── Groq API path ─────────────────────────────────────────────────────────────

def _build_prompt(anomaly: dict[str, Any]) -> str:
    return f"""You are a senior public finance auditor reviewing government budget data for India.

An AI system has detected the following anomaly in fund utilization:

{json.dumps(anomaly, indent=2)}

Respond ONLY with a valid JSON object — no markdown, no explanation outside the JSON, no code fences.

{{
  "explanation": "2-3 sentence plain-English explanation of what this anomaly means, written for a state finance officer",
  "causes": ["most likely cause", "second likely cause", "third possible cause"],
  "recommendation": "one specific, actionable policy recommendation the finance officer can implement within 30 days"
}}

Use Indian public finance terminology (PFMS, scheme-wise expenditure, lapse, reappropriation, CAG) where appropriate.
Be specific about the department, district, and numbers in the input. Do not hallucinate numbers not given."""


def _call_groq(anomaly: dict[str, Any], model: str = GROQ_MODEL) -> dict[str, Any]:
    """
    Calls the Groq API with the configured (or overridden) model.
    Raises on API or parse error — caller handles fallback.
    """
    client = Groq(api_key=GROQ_API_KEY)

    response = client.chat.completions.create(
        model       = model,
        messages    = [
            {
                "role": "system",
                "content": (
                    "You are a public finance auditor. Always respond with valid JSON only. "
                    "No markdown fences, no preamble, no extra text outside the JSON object."
                ),
            },
            {
                "role": "user",
                "content": _build_prompt(anomaly),
            },
        ],
        temperature  = GROQ_TEMP,
        max_tokens   = GROQ_MAX_TOKENS,
        response_format={"type": "json_object"},   # Groq supports JSON mode
    )

    raw = response.choices[0].message.content.strip()

    # Safety: strip accidental markdown fences if JSON mode not honoured
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    parsed = json.loads(raw)
    parsed["confidence"] = "ai"
    parsed["model_used"] = model
    return parsed


# ── Public interface ──────────────────────────────────────────────────────────

def explain_anomaly(
    anomaly:  dict[str, Any],
    model:    str | None = None,
) -> dict[str, Any]:
    """
    Primary entry point.
    Tries Groq API (with optional per-call model override),
    falls back to rule engine on any error.

    Args:
        anomaly: structured anomaly dict from the detection engines
        model:   Groq model name override. If None, uses GROQ_MODEL env var.

    Returns:
        dict with keys: explanation, causes, recommendation, confidence, model_used
    """
    if not GROQ_API_KEY:
        logger.info("GROQ_API_KEY not set — using rule fallback")
        return _rule_fallback(anomaly)

    active_model = model or GROQ_MODEL

    try:
        return _call_groq(anomaly, model=active_model)
    except Exception as exc:
        logger.warning(f"Groq explainer fell back to rule engine [{active_model}]: {exc}")
        return _rule_fallback(anomaly)


def explain_batch(
    anomalies:    list[dict[str, Any]],
    max_ai_calls: int       = GROQ_MAX_CALLS,
    model:        str | None = None,
) -> list[dict[str, Any]]:
    """
    Explains a list of anomalies.
    Uses Groq API for top `max_ai_calls` by severity, rule fallback for the rest.
    Caps API usage to prevent rate-limit issues during demo.

    Args:
        anomalies:    list of anomaly dicts
        max_ai_calls: max Groq API calls (overrides GROQ_MAX_AI_CALLS env var if set)
        model:        optional Groq model override for the whole batch

    Returns:
        list of anomaly dicts each enriched with an `explanation_data` key
    """
    results      = []
    ai_calls_used = 0

    for anomaly in anomalies:
        severity = anomaly.get("severity", "WARNING")
        use_ai   = (
            GROQ_API_KEY and
            ai_calls_used < max_ai_calls and
            severity in ("CRITICAL", "HIGH")
        )

        if use_ai:
            result = explain_anomaly(anomaly, model=model)
            if result["confidence"] == "ai":
                ai_calls_used += 1
        else:
            result = _rule_fallback(anomaly)

        results.append({**anomaly, "explanation_data": result})

    logger.info(
        f"explain_batch: {len(anomalies)} anomalies processed, "
        f"{ai_calls_used} Groq API calls, "
        f"{len(anomalies) - ai_calls_used} rule fallbacks"
    )

    return results


# ── Model info helper ─────────────────────────────────────────────────────────

def get_active_model_info() -> dict[str, Any]:
    """
    Returns current runtime config — useful for /health or /api/overview endpoints.
    """
    return {
        "provider":      "groq",
        "model":         GROQ_MODEL,
        "max_tokens":    GROQ_MAX_TOKENS,
        "temperature":   GROQ_TEMP,
        "max_ai_calls":  GROQ_MAX_CALLS,
        "api_key_set":   bool(GROQ_API_KEY),
        "available_models": [
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "llama3-8b-8192",
            "llama3-70b-8192",
            "gemma2-9b-it",
            "mixtral-8x7b-32768",
        ],
    }