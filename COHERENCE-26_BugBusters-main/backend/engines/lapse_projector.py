"""
lapse_projector.py
Projects each department's fund absorption trajectory to fiscal year-end (Month 12).
Uses linear projection on current absorption velocity.

Lapse Risk formula:
    monthly_rate        = cumulative_absorption / months_elapsed
    projected_final     = monthly_rate * 12
    lapse_risk_pct      = max(0, (1 - projected_final)) * 100
    projected_unspent   = budget_allocated * max(0, 1 - projected_final)

Risk tiers:
    HIGH    → lapse_risk > 60%
    MEDIUM  → lapse_risk 30–60%
    LOW     → lapse_risk < 30%
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

import numpy as np
import pandas as pd

# ── Config ────────────────────────────────────────────────────────────────────

DATA_DIR        = os.path.join(os.path.dirname(__file__), "..", "data")
EXPENDITURE_CSV = os.path.join(DATA_DIR, "expenditures.csv")

FISCAL_YEAR_MONTHS   = 12
HIGH_RISK_THRESHOLD  = 60.0
MED_RISK_THRESHOLD   = 30.0
CURRENT_MONTH        = 8    # Simulate: we are in Month 8 of fiscal year


# ── Loader ────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_expenditures() -> pd.DataFrame:
    return pd.read_csv(EXPENDITURE_CSV)


# ── Core projection ───────────────────────────────────────────────────────────

def project_lapse_risk(
    year:          int,
    as_of_month:   int = CURRENT_MONTH,
) -> pd.DataFrame:
    """
    For each (state, district, department) compute lapse risk
    based on absorption data up to as_of_month.
    """
    df = _load_expenditures()
    df = df[(df["year"] == year) & (df["month"] <= as_of_month)]

    # Aggregate cumulative stats per entity
    grouped = (
        df.groupby(["state", "district", "department", "scheme"])
        .agg(
            budget_allocated = ("budget_allocated", "first"),
            total_spent      = ("amount_spent", "sum"),
            months_reported  = ("month", "nunique"),
            project_count    = ("project_count", "sum"),
        )
        .reset_index()
    )

    grouped["months_elapsed"]       = as_of_month
    grouped["cumulative_rate"]      = (grouped["total_spent"] / grouped["budget_allocated"]).clip(0, 1)
    grouped["monthly_absorption"]   = (grouped["cumulative_rate"] / grouped["months_elapsed"]).clip(0)
    grouped["projected_final_rate"] = (grouped["monthly_absorption"] * FISCAL_YEAR_MONTHS).clip(0, 1)
    grouped["lapse_risk_pct"]       = ((1 - grouped["projected_final_rate"]) * 100).clip(0, 100).round(2)
    grouped["projected_unspent"]    = (grouped["budget_allocated"] * (1 - grouped["projected_final_rate"])).round(2)
    grouped["months_remaining"]     = FISCAL_YEAR_MONTHS - as_of_month
    grouped["risk_tier"]            = grouped["lapse_risk_pct"].apply(_risk_tier)
    grouped["utilization_pct"]      = (grouped["cumulative_rate"] * 100).round(2)

    return grouped


def _risk_tier(pct: float) -> str:
    if pct >= HIGH_RISK_THRESHOLD:
        return "HIGH"
    elif pct >= MED_RISK_THRESHOLD:
        return "MEDIUM"
    return "LOW"


# ── Monthly trajectory for chart ─────────────────────────────────────────────

def get_trajectory_chart(
    department:  str,
    district:    str,
    state:       str,
    year:        int,
) -> dict[str, Any]:
    """
    Returns actual absorption per month + projected curve to month 12.
    Used for the fiscal year timeline chart on the forecast page.
    """
    df = _load_expenditures()
    df = df[
        (df["year"] == year) &
        (df["department"] == department) &
        (df["district"] == district) &
        (df["state"] == state)
    ].sort_values("month")

    if df.empty:
        return {"actual": [], "projected": [], "budget_allocated": 0}

    budget  = float(df["budget_allocated"].iloc[0])
    actuals = []
    cumulative = 0.0

    for _, row in df.iterrows():
        cumulative += float(row["amount_spent"])
        actuals.append({
            "month":      int(row["month"]),
            "cumulative": round(cumulative, 2),
            "rate":       round(cumulative / budget * 100, 2),
        })

    # Project forward from last actual month
    last_month      = actuals[-1]["month"] if actuals else 0
    last_rate       = actuals[-1]["rate"] / 100 if actuals else 0
    monthly_rate    = last_rate / last_month if last_month > 0 else 0

    projected = []
    for m in range(last_month + 1, FISCAL_YEAR_MONTHS + 1):
        proj_rate = min(monthly_rate * m, 1.0)
        projected.append({
            "month":      m,
            "cumulative": round(budget * proj_rate, 2),
            "rate":       round(proj_rate * 100, 2),
        })

    lapse_risk = max(0, (1 - monthly_rate * FISCAL_YEAR_MONTHS) * 100)

    return {
        "department":       department,
        "district":         district,
        "state":            state,
        "year":             year,
        "budget_allocated": budget,
        "actual":           actuals,
        "projected":        projected,
        "lapse_risk_pct":   round(lapse_risk, 2),
        "risk_tier":        _risk_tier(lapse_risk),
        "months_remaining": FISCAL_YEAR_MONTHS - last_month,
        "projected_unspent": round(budget * max(0, 1 - monthly_rate * FISCAL_YEAR_MONTHS), 2),
    }


# ── Public API ────────────────────────────────────────────────────────────────

def get_lapse_risks(
    year:        int,
    as_of_month: int        = CURRENT_MONTH,
    risk_tier:   str | None = None,
    state:       str | None = None,
    limit:       int        = 50,
) -> list[dict[str, Any]]:
    """
    Returns list of departments sorted by lapse_risk_pct desc.
    """
    df = project_lapse_risk(year=year, as_of_month=as_of_month)

    if risk_tier:
        df = df[df["risk_tier"] == risk_tier.upper()]
    if state:
        df = df[df["state"] == state]

    df = df.sort_values("lapse_risk_pct", ascending=False).head(limit)

    return [
        {
            "state":              row["state"],
            "district":           row["district"],
            "department":         row["department"],
            "scheme":             row["scheme"],
            "budget_allocated":   round(float(row["budget_allocated"]), 2),
            "total_spent":        round(float(row["total_spent"]), 2),
            "utilization_pct":    round(float(row["utilization_pct"]), 2),
            "lapse_risk_pct":     round(float(row["lapse_risk_pct"]), 2),
            "projected_unspent":  round(float(row["projected_unspent"]), 2),
            "months_remaining":   int(row["months_remaining"]),
            "risk_tier":          row["risk_tier"],
            "project_count":      int(row["project_count"]),
        }
        for _, row in df.iterrows()
    ]


def get_lapse_summary(year: int, as_of_month: int = CURRENT_MONTH) -> dict[str, Any]:
    """
    Aggregate lapse risk across all departments.
    """
    df = project_lapse_risk(year=year, as_of_month=as_of_month)

    high_risk   = df[df["risk_tier"] == "HIGH"]
    medium_risk = df[df["risk_tier"] == "MEDIUM"]

    total_at_risk_budget  = high_risk["budget_allocated"].sum()
    total_projected_lapse = high_risk["projected_unspent"].sum()

    return {
        "as_of_month":              as_of_month,
        "high_risk_count":          int(len(high_risk)),
        "medium_risk_count":        int(len(medium_risk)),
        "low_risk_count":           int(len(df[df["risk_tier"] == "LOW"])),
        "total_at_risk_budget_cr":  round(total_at_risk_budget / 1e7, 2),
        "projected_lapse_cr":       round(total_projected_lapse / 1e7, 2),
        "states_at_risk":           int(high_risk["state"].nunique()),
        "departments_at_risk":      int(high_risk["department"].nunique()),
    }