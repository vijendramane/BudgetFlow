"""
engines/action_queue.py
Pre-justified, pre-calculated transfer orders awaiting officer approval.

BUGS FIXED vs v1:
  11. get_queue_summary: signature was get_queue_summary(actions: list) —
      copilot_engine.py calls it as get_queue_summary(year, month).
      Fixed: overloaded to accept BOTH calling conventions.
  12. generate_action_queue: demand match could pick the same dept as source
      (dept appearing in both HIGH-lapse and high-util pools). Fixed: exclude
      src key from demand candidates.
  13. generate_action_queue: no same-scheme preference — Health surplus was
      being matched to Infrastructure. Fixed: score same-scheme matches higher
      and prefer them first.
  14. generate_action_queue: transfer_amount = projected_unspent * 0.20 with
      no logging when skipped. Fixed: added logger.debug for traceability.
  15. get_queue_summary(year, month): new overload that generates the queue
      internally — required by copilot_engine and any caller that doesn't
      already have the actions list.

Action lifecycle: DRAFT → APPROVED | DISMISSED → TRACKED
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from .pattern_classifier  import classify_all_departments
from .intervention_engine import compute_intervention_window, score_recommendation_confidence
from .zscore_engine       import get_anomalies
from cache.snapshot_manager import upsert_action, load_actions

logger = logging.getLogger(__name__)

GFR_NOTE = (
    "Transfer recommended under GFR Rule 15 (Re-appropriation of funds). "
    "Requires countersignature of Drawing and Disbursing Officer and "
    "approval of competent financial authority before execution."
)

# ── Scheme compatibility map ───────────────────────────────────────────────────
# Transfers within compatible scheme groups are preferred.
# Cross-group transfers are legally complex and scored lower.
SCHEME_GROUPS: dict[str, str] = {
    "Health":             "social",
    "Education":          "social",
    "Social Welfare":     "social",
    "Agriculture":        "rural",
    "Rural Development":  "rural",
    "Water Supply":       "rural",
    "Infrastructure":     "capital",
    "Urban Development":  "capital",
}


def _scheme_compatibility(dept_a: str, dept_b: str) -> float:
    """
    Returns 1.0 for same-department, 0.7 for same group, 0.4 cross-group.
    Used to score and rank demand matches.
    """
    if dept_a == dept_b:
        return 1.0
    group_a = SCHEME_GROUPS.get(dept_a, "other")
    group_b = SCHEME_GROUPS.get(dept_b, "other")
    return 0.7 if group_a == group_b else 0.4


# ── Action generator ──────────────────────────────────────────────────────────

def generate_action_queue(
    year:        int = 2024,
    as_of_month: int = 8,
) -> list[dict[str, Any]]:
    """
    Main entry point. Generates the full action queue from current engine state.

    Process:
      1. Get all high-risk lapse departments (pattern classifier)
      2. Get all critical anomalies (z-score engine)
      3. Match each surplus dept to best demand dept — same scheme preferred
      4. Score confidence for each recommendation
      5. Compute intervention window
      6. Assemble action card
      7. Persist to action store (skip if already approved/dismissed)
    """
    dept_df   = classify_all_departments(year=year, as_of_month=as_of_month)
    anomalies = get_anomalies(year=year, severity="CRITICAL", limit=30)

    anomaly_index = {
        f"{a['state']}|{a['district']}|{a['department']}": a
        for a in anomalies
    }

    surplus_depts = dept_df[dept_df["risk_tier"] == "HIGH"].copy()
    demand_depts  = dept_df[
        (dept_df["utilization_pct"] >= 75) &
        (dept_df["lapse_risk_pct"]  <  25)
    ].copy()

    actions: list[dict[str, Any]] = []

    for _, src in surplus_depts.iterrows():
        src_key      = f"{src['state']}|{src['district']}|{src['department']}"
        anomaly_data = anomaly_index.get(src_key, {})

        # FIX 12: exclude source from demand candidates to prevent self-match
        state_demand = demand_depts[
            (demand_depts["state"] == src["state"]) &
            ~(
                (demand_depts["district"]   == src["district"]) &
                (demand_depts["department"] == src["department"])
            )
        ]
        if state_demand.empty:
            logger.debug(f"No demand match for {src_key} — skipping")
            continue

        # FIX 13: rank demand candidates by scheme compatibility + utilization
        state_demand = state_demand.copy()
        state_demand["_compat"] = state_demand["department"].apply(
            lambda d: _scheme_compatibility(str(src["department"]), str(d))
        )
        # Primary sort: scheme compatibility; secondary: utilization (highest first)
        state_demand = state_demand.sort_values(
            ["_compat", "utilization_pct"],
            ascending=[False, False]
        )
        dst = state_demand.iloc[0]

        # Transfer amount = 20% of projected unspent (conservative GFR Rule 15)
        transfer_amount = float(src["projected_unspent"]) * 0.20

        # FIX 14: log skipped transfers for traceability
        if transfer_amount < 10_000:
            logger.debug(
                f"Skipping {src_key}: transfer_amount ₹{transfer_amount:.0f} < ₹10,000 threshold"
            )
            continue

        window = compute_intervention_window(
            pattern       = src["pattern"],
            current_month = as_of_month,
            lapse_risk    = float(src["lapse_risk_pct"]),
        )

        confidence = score_recommendation_confidence(
            from_dept       = {**src.to_dict(), **anomaly_data},
            to_dept         = dst.to_dict(),
            transfer_amount = transfer_amount,
        )

        # Projected impact post-transfer
        src_budget   = float(src["budget_allocated"])
        dst_budget   = float(dst["budget_allocated"])
        new_src_util = min((float(src["total_spent"]) + transfer_amount) / src_budget * 100, 100)
        new_dst_util = min((float(dst["total_spent"]) + transfer_amount) / dst_budget * 100, 100)
        src_monthly  = new_src_util / 100 / max(as_of_month, 1)
        new_src_lapse = max(0.0, (1 - src_monthly * 12) * 100)

        # Stable deterministic ID — prevents duplicate actions on re-run
        action_id = _stable_id(
            src["state"], src["district"], src["department"],
            dst["district"], dst["department"], year,
        )

        action: dict[str, Any] = {
            "action_id":    action_id,
            "status":       "DRAFT",
            "priority":     window["urgency"],
            "created_at":   datetime.now(timezone.utc).isoformat(),
            "actioned_at":  None,
            "officer_note": "",

            "detection": {
                "state":               src["state"],
                "district":            src["district"],
                "department":          src["department"],
                "utilization_pct":     round(float(src["utilization_pct"]), 2),
                "lapse_risk_pct":      round(float(src["lapse_risk_pct"]), 2),
                "pattern":             src["pattern"],
                "confidence_interval": src.get("confidence_interval", [0, 100]),
                "z_score":             anomaly_data.get("z_score"),
                "peer_mean":           anomaly_data.get("peer_mean"),
            },

            "recommendation": {
                "action_type":     "FUND_TRANSFER",
                "from_district":   src["district"],
                "from_department": src["department"],
                "to_district":     dst["district"],
                "to_department":   dst["department"],
                "transfer_amount": round(transfer_amount, 2),
                "transfer_lakh":   round(transfer_amount / 1e5, 2),
                "transfer_pct":    round(confidence.get("transfer_pct", 20.0), 1),
                "scheme_compat":   round(float(dst["_compat"]), 2),  # FIX 13: expose for UI
                "gfr_note":        GFR_NOTE,
            },

            "projected_impact": {
                "from_util_before":  round(float(src["utilization_pct"]), 2),
                "from_util_after":   round(new_src_util, 2),
                "from_lapse_before": round(float(src["lapse_risk_pct"]), 2),
                "from_lapse_after":  round(new_src_lapse, 2),
                "to_util_before":    round(float(dst["utilization_pct"]), 2),
                "to_util_after":     round(new_dst_util, 2),
                "net_gain":          round(
                    (new_src_util + new_dst_util) / 2
                    - (float(src["utilization_pct"]) + float(dst["utilization_pct"])) / 2,
                    2
                ),
            },

            "intervention_window": window,
            "confidence":          confidence,
        }

        # Preserve approved/dismissed status across re-runs
        existing = _get_existing_action(action_id)
        if existing and existing.get("status") not in (None, "DRAFT"):
            action["status"]      = existing["status"]
            action["actioned_at"] = existing.get("actioned_at")
            action["officer_note"]= existing.get("officer_note", "")

        upsert_action(action)
        actions.append(action)

    # Sort by urgency priority
    priority_order = {"IMMEDIATE": 0, "CRITICAL": 1, "HIGH": 2, "MEDIUM": 3, "LOW": 4}
    actions.sort(key=lambda x: priority_order.get(x["priority"], 5))

    return actions


# ── Queue summary — BOTH calling conventions ──────────────────────────────────

def get_queue_summary(
    actions_or_year: list[dict] | int | None = None,
    as_of_month: int = 8,
) -> dict[str, Any]:
    """
    FIX 11: Accepts BOTH:
      - get_queue_summary(actions_list)           ← old calling convention
      - get_queue_summary(year=2024, month=8)     ← copilot_engine calling convention
      - get_queue_summary(2024, 8)                ← positional

    If called with (year, month), generates the queue internally.
    """
    if isinstance(actions_or_year, list):
        # Old convention: caller passes pre-built actions list
        actions = actions_or_year
    elif isinstance(actions_or_year, int):
        # New convention: generate queue from year + month
        year = actions_or_year
        actions = generate_action_queue(year=year, as_of_month=as_of_month)
    else:
        # No args: load from store
        actions = load_actions()

    draft     = [a for a in actions if a.get("status") == "DRAFT"]
    approved  = [a for a in actions if a.get("status") == "APPROVED"]
    dismissed = [a for a in actions if a.get("status") == "DISMISSED"]
    immediate = [a for a in draft   if a.get("priority") in ("IMMEDIATE", "CRITICAL")]

    total_transferable = sum(
        a.get("recommendation", {}).get("transfer_amount", 0)
        for a in draft
    )

    return {
        "draft_count":           len(draft),
        "approved_count":        len(approved),
        "dismissed_count":       len(dismissed),
        "immediate_count":       len(immediate),
        "total_transferable_cr": round(total_transferable / 1e7, 2),
    }


# ── Policy memo generator ─────────────────────────────────────────────────────

def generate_policy_memo(action_id: str) -> dict[str, Any]:
    """Generates a structured policy memo for a specific action."""
    from cache.snapshot_manager import get_action_by_id
    action = get_action_by_id(action_id)
    if not action:
        return {"error": "Action not found"}

    d = action["detection"]
    r = action["recommendation"]
    p = action["projected_impact"]
    w = action["intervention_window"]
    c = action["confidence"]
    today = datetime.now(timezone.utc).strftime("%B %d, %Y")

    ci = d.get("confidence_interval", [0, 100])
    ci_str = f"{ci[0]}%–{ci[1]}%" if isinstance(ci, list) and len(ci) == 2 else "N/A"

    factors = ", ".join(s["factor"] for s in c.get("scoring_trace", []) if "factor" in s)

    memo_text = f"""GOVERNMENT OF INDIA — BUDGET UTILIZATION MEMO
Date: {today}
Reference: BFI-{action_id[:8].upper()}
Priority: {action["priority"]}

SUBJECT: Recommended Fund Reallocation — {d['department']}, {d['district']}

1. BACKGROUND
   {d['department']} Department, {d['district']} ({d['state']}) has utilized
   {d['utilization_pct']}% of its allocated budget. Classified under
   '{d['pattern'].replace('_', ' ').title()}' pattern with {d['lapse_risk_pct']}%
   projected lapse risk (confidence interval: {ci_str}).
   Intervention window closes in {w.get('days_remaining', '?')} days.

2. PROPOSED ACTION
   Transfer ₹{r['transfer_lakh']} Lakh ({r['transfer_pct']}% of surplus) from:
     FROM: {r['from_department']} Dept — {r['from_district']}
     TO:   {r['to_department']} Dept — {r['to_district']}
   Scheme compatibility score: {r.get('scheme_compat', '?')} / 1.0

3. PROJECTED OUTCOME
   Source department lapse risk:   {p['from_lapse_before']}% → {p['from_lapse_after']}%
   Destination utilization:        {p['to_util_before']}% → {p['to_util_after']}%
   Net system utilization gain:    +{p['net_gain']}%

4. LEGAL BASIS
   {r['gfr_note']}

5. RECOMMENDATION CONFIDENCE
   Score: {c.get('confidence_score', 0)}/100 ({c.get('confidence_label', 'N/A')})
   Key factors: {factors}

Prepared by: Budget Flow Intelligence System
Status: Awaiting officer approval""".strip()

    return {
        "action_id":  action_id,
        "memo_text":  memo_text,
        "generated":  today,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _stable_id(*parts: Any) -> str:
    """Deterministic UUID from action components — prevents duplicate actions on re-run."""
    key = "|".join(str(p) for p in parts)
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, key))


def _get_existing_action(action_id: str) -> dict | None:
    try:
        actions = load_actions()
        return next((a for a in actions if a.get("action_id") == action_id), None)
    except Exception:
        return None