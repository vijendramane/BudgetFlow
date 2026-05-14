"""
zscore_engine.py
Detects anomalous departments by comparing utilization_rate
against national peer groups (same department type + same month).

WHY NATIONAL GROUPING:
    State-level grouping (4-6 districts per state) caps z-score at ~2.0
    because the single outlier inflates the std, cancelling itself out.
    National grouping (30 districts per group) gives meaningful z-scores
    where true outliers score 4-6+ standard deviations.

Anomaly logic:
    z_score = (dept_utilization - national_peer_mean) / national_peer_std
    |z_score| > 2.0  → WARNING
    |z_score| > 3.0  → CRITICAL

A Health dept in Varanasi is compared against ALL Health depts
nationally for the same month — not just within Uttar Pradesh.
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

WARNING_THRESHOLD  = 2.0
CRITICAL_THRESHOLD = 3.0
MIN_PEER_SIZE      = 5     # national grouping gives 30 peers, so 5 is safe


# ── Data loader ───────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_expenditures() -> pd.DataFrame:
    df = pd.read_csv(EXPENDITURE_CSV)
    df["utilization_rate"] = pd.to_numeric(df["utilization_rate"], errors="coerce").fillna(0)
    return df


# ── Core z-score computation ──────────────────────────────────────────────────

def compute_zscores(
    year:  int | None = None,
    month: int | None = None,
) -> pd.DataFrame:
    """
    Compute z-score per (department, month) national peer group.
    Returns full dataframe with z_score, anomaly_flag, severity columns.
    """
    df = _load_expenditures()

    if year:
        df = df[df["year"] == year]
    if month:
        df = df[df["month"] == month]

    # ── NATIONAL peer group: same department + same month across all states ──
    peer_stats = (
        df.groupby(["department", "month"])["utilization_rate"]
        .agg(peer_mean="mean", peer_std="std", peer_count="count")
        .reset_index()
    )

    df = df.merge(peer_stats, on=["department", "month"], how="left")

    # Avoid division by zero
    df["peer_std"] = df["peer_std"].fillna(0).replace(0, 0.001)

    df["z_score"] = ((df["utilization_rate"] - df["peer_mean"]) / df["peer_std"]).round(4)
    df["abs_z"]   = df["z_score"].abs()

    # Only flag where peer group is meaningful
    df["anomaly_flag"] = (df["abs_z"] >= WARNING_THRESHOLD) & (df["peer_count"] >= MIN_PEER_SIZE)
    df["severity"]     = df.apply(_classify_severity, axis=1)
    df["anomaly_type"] = df.apply(_anomaly_type, axis=1)

    return df


def _classify_severity(row: pd.Series) -> str:
    if not row["anomaly_flag"]:
        return "NORMAL"
    if row["abs_z"] >= CRITICAL_THRESHOLD:
        return "CRITICAL"
    return "WARNING"


def _anomaly_type(row: pd.Series) -> str:
    if not row["anomaly_flag"]:
        return "none"
    if row["z_score"] < 0:
        return "underutilization" if row["abs_z"] < CRITICAL_THRESHOLD else "severe_underutilization"
    return "spending_spike"


# ── Public API ────────────────────────────────────────────────────────────────

def get_anomalies(
    year:     int | None = None,
    month:    int | None = None,
    state:    str | None = None,
    severity: str | None = None,
    limit:    int        = 50,
) -> list[dict[str, Any]]:
    df = compute_zscores(year=year, month=month)
    df = df[df["anomaly_flag"]]

    if state:
        df = df[df["state"] == state]
    if severity:
        df = df[df["severity"] == severity.upper()]

    df = df.sort_values("abs_z", ascending=False).head(limit)

    return [
        {
            "exp_id":            int(row["exp_id"]),
            "year":              int(row["year"]),
            "month":             int(row["month"]),
            "state":             row["state"],
            "district":          row["district"],
            "department":        row["department"],
            "scheme":            row["scheme"],
            "budget_allocated":  round(float(row["budget_allocated"]), 2),
            "amount_spent":      round(float(row["amount_spent"]), 2),
            "utilization_rate":  round(float(row["utilization_rate"]), 2),
            "peer_mean":         round(float(row["peer_mean"]), 2),
            "peer_std":          round(float(row["peer_std"]), 2),
            "peer_count":        int(row["peer_count"]),
            "z_score":           round(float(row["z_score"]), 4),
            "severity":          row["severity"],
            "anomaly_type":      row["anomaly_type"],
        }
        for _, row in df.iterrows()
    ]


def get_anomaly_summary(year: int | None = None) -> dict[str, Any]:
    df = compute_zscores(year=year)
    anomalies = df[df["anomaly_flag"]]

    critical = anomalies[anomalies["severity"] == "CRITICAL"]
    warning  = anomalies[anomalies["severity"] == "WARNING"]
    under    = anomalies[anomalies["anomaly_type"].str.contains("underutilization")]
    spikes   = anomalies[anomalies["anomaly_type"] == "spending_spike"]

    return {
        "total_anomalies":        int(len(anomalies)),
        "critical_count":         int(len(critical)),
        "warning_count":          int(len(warning)),
        "underutilization_count": int(len(under)),
        "spending_spike_count":   int(len(spikes)),
        "exposed_budget_cr":      round(anomalies["budget_allocated"].sum() / 1e7, 2),
        "states_affected":        int(anomalies["state"].nunique()),
        "departments_affected":   int(anomalies["department"].nunique()),
    }


def get_department_zscore_trend(
    department: str,
    state:      str,
    year:       int,
) -> list[dict[str, Any]]:
    df = compute_zscores(year=year)
    df = df[(df["department"] == department) & (df["state"] == state)]
    df = df.sort_values("month")

    return [
        {
            "month":            int(row["month"]),
            "utilization_rate": round(float(row["utilization_rate"]), 2),
            "peer_mean":        round(float(row["peer_mean"]), 2),
            "z_score":          round(float(row["z_score"]), 4),
            "severity":         row["severity"],
        }
        for _, row in df.iterrows()
    ]