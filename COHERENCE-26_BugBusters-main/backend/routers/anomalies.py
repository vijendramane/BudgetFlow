"""
routers/anomalies.py — Z-score anomaly detection
"""
from fastapi import APIRouter, Query
from typing import Optional
from engines.zscore_engine import get_anomalies, get_anomaly_summary, get_department_zscore_trend
from engines.llm_explainer import explain_anomaly, _rule_fallback

router = APIRouter(prefix="/api/anomalies", tags=["Anomalies"])

# ── Hard cap: never more than 5 LLM calls per request ────────────────────────
MAX_LLM_CALLS = 5


@router.get("")
def anomalies(
    year:     int           = Query(2024),
    month:    Optional[int] = Query(None),
    state:    Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    explain:  bool          = Query(False),
    limit:    int           = Query(20),   # ← default reduced from 50 to 20
):
    results = get_anomalies(
        year=year, month=month, state=state, severity=severity,
        limit=min(limit, 20)   # ← hard cap at 20 rows max
    )

    if explain:
        ai_calls_used = 0
        for i, item in enumerate(results):
            # Only use LLM for first MAX_LLM_CALLS CRITICAL items
            use_llm = (
                ai_calls_used < MAX_LLM_CALLS and
                item.get("severity") == "CRITICAL"
            )
            if use_llm:
                expl = explain_anomaly(item)
                ai_calls_used += 1
            else:
                # Rule-based fallback for everything else — instant, no API call
                expl = _rule_fallback(item)

            item["explanation"]    = expl.get("explanation", "")
            item["causes"]         = expl.get("causes", [])
            item["recommendation"] = expl.get("recommendation", "")
            item["confidence"]     = expl.get("confidence", "rule")
    else:
        for item in results:
            item["explanation"]    = ""
            item["causes"]         = []
            item["recommendation"] = ""
            item["confidence"]     = "none"

    return results


@router.get("/summary")
def anomaly_summary(year: int = Query(2024)):
    raw = get_anomaly_summary(year=year)
    return {
        "year":                     year,
        "total_anomalies":          raw["total_anomalies"],
        "critical_count":           raw["critical_count"],
        "warning_count":            raw["warning_count"],
        "underutilization_count":   raw.get("underutilization_count", 0),
        "spending_spike_count":     raw.get("spending_spike_count", 0),
        "exposed_budget_cr":        raw.get("exposed_budget_cr", 0),
        "states_affected":          raw.get("states_affected", 0),
        "departments_affected":     raw.get("departments_affected", 0),
        "top_affected_departments": [],
        "top_affected_states":      [],
    }


@router.get("/trend")
def anomaly_trend(
    department: str = Query(...),
    state:      str = Query(...),
    year:       int = Query(2024),
):
    return get_department_zscore_trend(department=department, state=state, year=year)