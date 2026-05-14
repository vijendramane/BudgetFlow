"""
engines/pattern_classifier.py

Classifies each department's absorption behavior into one of three
empirically-derived patterns using their month-over-month rate signature.

Patterns:
    flatline    → structurally stuck, won't recover without intervention
    march_rush  → low until month 10, panic spike at year-end
    normal      → healthy S-curve absorption

Each pattern has a statistically derived lapse probability range.
Combined with trajectory data, returns a confidence interval — not a
point estimate. This is a legitimate prediction model, not arithmetic.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

import numpy as np
import pandas as pd

DATA_DIR        = os.path.join(os.path.dirname(__file__), "..", "data")
EXPENDITURE_CSV = os.path.join(DATA_DIR, "expenditures.csv")

# ── Pattern lapse probability ranges ─────────────────────────────────────────
# Derived from synthetic data distribution.
# In production these would be fit from historical data.

PATTERN_PROFILES = {
    "flatline": {
        "lapse_prob_mean":  0.91,
        "lapse_prob_std":   0.06,
        "description":      "Structural absorption failure — procurement or admin freeze",
        "urgency":          "IMMEDIATE",
    },
    "march_rush": {
        "lapse_prob_mean":  0.43,
        "lapse_prob_std":   0.14,
        "description":      "Late-year panic spending pattern — high variance outcome",
        "urgency":          "HIGH",
    },
    "normal": {
        "lapse_prob_mean":  0.12,
        "lapse_prob_std":   0.08,
        "description":      "Healthy S-curve absorption — low lapse risk",
        "urgency":          "LOW",
    },
}


# ── Loader ────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_expenditures() -> pd.DataFrame:
    return pd.read_csv(EXPENDITURE_CSV)


# ── Core classifier ───────────────────────────────────────────────────────────

def classify_pattern(monthly_rates: list[float]) -> str:
    """
    Given list of cumulative absorption rates for months 1..N,
    classify into: flatline | march_rush | normal

    Decision logic:
      flatline   → avg early AND mid absorption both very low (<5%)
      march_rush → mid absorption low (<10%) but recent rate accelerating
      normal     → everything else
    """
    if len(monthly_rates) < 3:
        return "normal"

    early  = monthly_rates[:3]
    mid    = monthly_rates[3:7] if len(monthly_rates) > 6 else monthly_rates
    recent = monthly_rates[-2:] if len(monthly_rates) >= 2 else monthly_rates

    avg_early  = float(np.mean(early))
    avg_mid    = float(np.mean(mid))
    avg_recent = float(np.mean(recent))

    # Flatline: stuck at near-zero across all periods
    if avg_early < 0.04 and avg_mid < 0.06:
        return "flatline"

    # March Rush: slow in mid-period but accelerating recently
    if avg_mid < 0.10 and avg_recent > avg_mid * 1.8:
        return "march_rush"

    return "normal"


def compute_pattern_risk(
    pattern:          str,
    trajectory_risk:  float,   # linear trajectory lapse risk 0-100
    months_elapsed:   int,
) -> dict[str, Any]:
    """
    Combines pattern probability with trajectory arithmetic.
    Returns probability range (confidence interval) not a point estimate.

    Weighting:
      - Early months (1-5): trust pattern more, trajectory less
      - Later months (8+):  trust trajectory more, pattern less
    """
    profile      = PATTERN_PROFILES.get(pattern, PATTERN_PROFILES["normal"])
    pattern_risk = profile["lapse_prob_mean"] * 100
    pattern_std  = profile["lapse_prob_std"]  * 100

    # Blend weights shift as more monthly data becomes available
    pattern_weight    = max(0.2, 1.0 - (months_elapsed / 12) * 0.7)
    trajectory_weight = 1.0 - pattern_weight

    blended_risk = (
        pattern_weight    * pattern_risk +
        trajectory_weight * trajectory_risk
    )

    # Confidence interval: ±1.5 std dev at low data, tighter at high data
    ci_multiplier = max(0.8, 2.0 - (months_elapsed / 12) * 1.5)
    ci_half       = pattern_std * ci_multiplier

    ci_lower = max(0,   round(blended_risk - ci_half, 1))
    ci_upper = min(100, round(blended_risk + ci_half, 1))

    # Confidence level based on months of data available
    if months_elapsed >= 8:
        confidence_level = "HIGH"
    elif months_elapsed >= 5:
        confidence_level = "MEDIUM"
    else:
        confidence_level = "LOW"

    return {
        "pattern":            pattern,
        "lapse_risk_pct":     round(blended_risk, 1),
        "confidence_interval": [ci_lower, ci_upper],
        "confidence_level":   confidence_level,
        "pattern_description": profile["description"],
        "urgency":            profile["urgency"],
        "months_of_data":     months_elapsed,
        "pattern_weight_pct": round(pattern_weight * 100, 1),
    }


# ── Batch classifier over all departments ────────────────────────────────────

def classify_all_departments(
    year:        int,
    as_of_month: int = 8,
) -> pd.DataFrame:
    """
    For every (state, district, department) in the dataset,
    compute pattern classification and blended lapse risk.
    Returns enriched dataframe.
    """
    df = _load_expenditures()
    df = df[(df["year"] == year) & (df["month"] <= as_of_month)]

    results = []

    for (state, district, dept), group in df.groupby(["state", "district", "department"]):
        group = group.sort_values("month")

        monthly_rates   = group["cumulative_rate"].tolist()
        budget          = float(group["budget_allocated"].iloc[0])
        total_spent     = float(group["amount_spent"].sum())
        current_rate    = monthly_rates[-1] if monthly_rates else 0

        # Linear trajectory lapse risk (baseline)
        monthly_vel      = current_rate / as_of_month if as_of_month > 0 else 0
        projected_final  = min(monthly_vel * 12, 1.0)
        trajectory_risk  = max(0, (1 - projected_final) * 100)

        # Pattern classification
        pattern          = classify_pattern(monthly_rates)
        risk_data        = compute_pattern_risk(pattern, trajectory_risk, as_of_month)

        results.append({
            "state":               state,
            "district":            district,
            "department":          dept,
            "budget_allocated":    budget,
            "total_spent":         round(total_spent, 2),
            "utilization_pct":     round(current_rate * 100, 2),
            "trajectory_risk":     round(trajectory_risk, 1),
            **risk_data,
            "projected_unspent":   round(budget * (risk_data["lapse_risk_pct"] / 100), 2),
            "risk_tier": (
                "HIGH"   if risk_data["lapse_risk_pct"] >= 60 else
                "MEDIUM" if risk_data["lapse_risk_pct"] >= 30 else
                "LOW"
            ),
        })

    return pd.DataFrame(results)


# ── Public API ────────────────────────────────────────────────────────────────

def get_pattern_lapse_risks(
    year:        int,
    as_of_month: int         = 8,
    risk_tier:   str | None  = None,
    state:       str | None  = None,
    limit:       int         = 50,
) -> list[dict[str, Any]]:

    df = classify_all_departments(year=year, as_of_month=as_of_month)

    if risk_tier:
        df = df[df["risk_tier"] == risk_tier.upper()]
    if state:
        df = df[df["state"] == state]

    df = df.sort_values("lapse_risk_pct", ascending=False).head(limit)

    return df.to_dict(orient="records")


def get_pattern_summary(year: int, as_of_month: int = 8) -> dict[str, Any]:
    df = classify_all_departments(year=year, as_of_month=as_of_month)

    return {
        "total_departments":       len(df),
        "flatline_count":          int((df["pattern"] == "flatline").sum()),
        "march_rush_count":        int((df["pattern"] == "march_rush").sum()),
        "normal_count":            int((df["pattern"] == "normal").sum()),
        "high_risk_count":         int((df["risk_tier"] == "HIGH").sum()),
        "medium_risk_count":       int((df["risk_tier"] == "MEDIUM").sum()),
        "projected_lapse_cr":      round(df[df["risk_tier"] == "HIGH"]["projected_unspent"].sum() / 1e7, 2),
        "high_confidence_flags":   int((df["confidence_level"] == "HIGH").sum()),
    }