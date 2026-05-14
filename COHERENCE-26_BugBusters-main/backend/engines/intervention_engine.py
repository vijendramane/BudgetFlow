"""
engines/intervention_engine.py

Computes exactly HOW LONG a finance officer has to act
before a department's fiscal trajectory locks in.

This answers the question no existing system answers:
"When does the window to prevent this lapse close?"

Three window types:
    IMMEDIATE  → flatline pattern, structural — intervene now or never
    CLOSING    → march_rush, window closes at month 10
    OPEN       → normal pattern, trajectory still flexible

Also generates the Daily Digest — a pre-computed briefing
for finance officers summarizing what changed and what needs
action today. This runs on startup and is served cached.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any

import pandas as pd

from .pattern_classifier import classify_all_departments, PATTERN_PROFILES

DATA_DIR        = os.path.join(os.path.dirname(__file__), "..", "data")
FISCAL_MONTHS   = 12
MARCH_RUSH_LOCK = 10     # Month after which march_rush trajectory is locked


# ── Intervention window calculator ───────────────────────────────────────────

def compute_intervention_window(
    pattern:       str,
    current_month: int,
    lapse_risk:    float,
) -> dict[str, Any]:
    """
    Returns intervention window details for a single department.
    """
    if pattern == "flatline":
        window_closes_month = current_month + 1
        urgency             = "IMMEDIATE"
        rationale           = (
            "Structural absorption failure — every additional month of "
            "inaction reduces recovery probability. Intervene this week."
        )

    elif pattern == "march_rush":
        window_closes_month = MARCH_RUSH_LOCK
        urgency             = "CRITICAL" if current_month >= 8 else "HIGH"
        days_to_lock        = (window_closes_month - current_month) * 30
        rationale           = (
            f"March Rush pattern detected. Spending trajectory locks in at Month "
            f"{MARCH_RUSH_LOCK}. You have approximately {days_to_lock} days before "
            f"reallocation becomes administratively infeasible."
        )

    else:
        window_closes_month = min(current_month + 3, 11)
        urgency             = "MEDIUM" if lapse_risk > 50 else "LOW"
        rationale           = (
            "Normal pattern with elevated lapse risk. Trajectory is still "
            "adjustable. Monitor monthly and intervene if rate doesn't improve."
        )

    days_remaining       = max(0, (window_closes_month - current_month) * 30)
    action_required      = days_remaining < 60 or urgency in ("IMMEDIATE", "CRITICAL")

    return {
        "window_closes_month": window_closes_month,
        "days_remaining":      days_remaining,
        "urgency":             urgency,
        "action_required":     action_required,
        "rationale":           rationale,
    }


# ── Confidence scoring for recommendations ───────────────────────────────────

def score_recommendation_confidence(
    from_dept:         dict,
    to_dept:           dict,
    transfer_amount:   float,
) -> dict[str, Any]:
    """
    Produces a structured confidence score with reasoning trace
    for a proposed fund transfer recommendation.

    This is explainable AI — every point in the score is traceable.
    """
    score   = 0
    reasons = []

    # Source department signals
    z_score = abs(from_dept.get("z_score", 0))
    if z_score >= 3.0:
        score += 30
        reasons.append({
            "factor":  "Source z-score CRITICAL",
            "points":  "+30",
            "detail":  f"z={round(z_score, 2)} — 3+ std devs below peer norm"
        })
    elif z_score >= 2.0:
        score += 20
        reasons.append({
            "factor":  "Source z-score WARNING",
            "points":  "+20",
            "detail":  f"z={round(z_score, 2)} — significant peer deviation"
        })

    # Pattern certainty
    pattern = from_dept.get("pattern", "normal")
    if pattern == "flatline":
        score += 25
        reasons.append({
            "factor":  "Flatline pattern confirmed",
            "points":  "+25",
            "detail":  "3+ months of near-zero absorption — structural problem"
        })
    elif pattern == "march_rush":
        score += 15
        reasons.append({
            "factor":  "March Rush pattern detected",
            "points":  "+15",
            "detail":  "Late-year spike pattern — high lapse probability"
        })

    # Destination absorption capacity
    to_util = to_dept.get("utilization_pct", 0)
    if to_util >= 85:
        score += 20
        reasons.append({
            "factor":  "Destination high utilization",
            "points":  "+20",
            "detail":  f"{round(to_util, 1)}% — confirmed absorption capacity"
        })
    elif to_util >= 70:
        score += 12
        reasons.append({
            "factor":  "Destination good utilization",
            "points":  "+12",
            "detail":  f"{round(to_util, 1)}% — likely absorption capacity"
        })

    # Same-state transfer (administratively valid under GFR)
    if from_dept.get("state") == to_dept.get("state"):
        score += 15
        reasons.append({
            "factor":  "Same-state transfer",
            "points":  "+15",
            "detail":  "Valid under GFR Rule 15 reappropriation"
        })

    # Transfer size penalty if too aggressive
    from_budget = from_dept.get("budget_allocated", 1)
    transfer_pct = (transfer_amount / from_budget * 100) if from_budget > 0 else 0
    if transfer_pct > 15:
        score -= 8
        reasons.append({
            "factor":  "Large transfer size",
            "points":  "-8",
            "detail":  f"{round(transfer_pct, 1)}% of budget — may face approval delays"
        })

    # Data quality penalty
    confidence_level = from_dept.get("confidence_level", "LOW")
    if confidence_level == "LOW":
        score -= 5
        reasons.append({
            "factor":  "Limited data",
            "points":  "-5",
            "detail":  "Fewer than 5 months of data — prediction less reliable"
        })

    final_score = max(0, min(100, score))
    confidence_label = (
        "VERY HIGH" if final_score >= 85 else
        "HIGH"      if final_score >= 70 else
        "MEDIUM"    if final_score >= 50 else
        "LOW"
    )

    return {
        "confidence_score":  final_score,
        "confidence_label":  confidence_label,
        "scoring_trace":     reasons,
        "transfer_pct":      round(transfer_pct, 1),
    }


# ── Daily digest generator ────────────────────────────────────────────────────

def generate_daily_digest(
    delta:       dict,
    lapse_risks: list[dict],
    year:        int,
    as_of_month: int,
) -> dict[str, Any]:
    """
    Pre-computes a structured Daily Digest from delta + current risks.
    Served cached on every dashboard load — not re-run per request.
    """
    items = []

    # New critical anomalies
    for a in delta.get("new_anomalies", [])[:3]:
        if a.get("severity") == "CRITICAL":
            items.append({
                "type":       "NEW_CRITICAL",
                "emoji":      "🔴",
                "headline":   f"{a['department']} in {a['district']} — new critical anomaly",
                "detail":     f"Utilization {round(a.get('utilization_rate', 0), 1)}% vs peer avg {round(a.get('peer_mean', 0), 1)}%",
                "action":     "Review immediately",
                "priority":   1,
            })

    # Worsening departments
    for w in delta.get("worsened", [])[:2]:
        items.append({
            "type":     "WORSENING",
            "emoji":    "🟡",
            "headline": f"{w['department']} in {w['district']} — situation worsening",
            "detail":   f"Z-score moved from {round(abs(w.get('prev_z_score', 0)), 2)} → {round(abs(w.get('z_score', 0)), 2)}",
            "action":   "Monitor closely",
            "priority": 2,
        })

    # Resolved risks (positive news)
    for r in delta.get("resolved_anomalies", [])[:2]:
        items.append({
            "type":     "RESOLVED",
            "emoji":    "🟢",
            "headline": f"{r['department']} in {r['district']} — removed from watchlist",
            "detail":   "Absorption normalized to within peer range",
            "action":   "No action needed",
            "priority": 4,
        })

    # High lapse risks with closing windows
    high_lapse = [l for l in lapse_risks if l.get("risk_tier") == "HIGH"][:3]
    for l in high_lapse:
        window = compute_intervention_window(
            l.get("pattern", "normal"), as_of_month, l.get("lapse_risk_pct", 0)
        )
        if window["action_required"]:
            items.append({
                "type":     "LAPSE_WINDOW",
                "emoji":    "⏱",
                "headline": f"{l['department']} in {l['district']} — {window['days_remaining']} days to intervene",
                "detail":   f"₹{round(l.get('projected_unspent', 0)/1e5, 1)}L at risk · {l.get('lapse_risk_pct', 0)}% lapse probability",
                "action":   "Initiate reallocation",
                "priority": 1 if window["urgency"] == "IMMEDIATE" else 2,
            })

    # Sort by priority
    items.sort(key=lambda x: x["priority"])

    # Summary line
    total_at_risk = sum(l.get("projected_unspent", 0) for l in high_lapse)

    return {
        "generated_at":    datetime.now(timezone.utc).isoformat(),
        "year":            year,
        "as_of_month":     as_of_month,
        "has_urgent":      any(i["priority"] == 1 for i in items),
        "items":           items[:8],           # cap at 8 digest items
        "summary_line":    (
            f"{len(delta.get('new_anomalies', []))} new anomalies · "
            f"{len(high_lapse)} high-risk lapses · "
            f"₹{round(total_at_risk / 1e7, 1)}Cr at risk"
        ),
        "changes_since_last_run": delta.get("has_changes", False),
    }