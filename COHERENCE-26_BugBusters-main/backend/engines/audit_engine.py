"""
engines/audit_engine.py  — Production Audit Intelligence Engine
================================================================

Five independent financial intelligence signals:

SIGNAL 1 · VELOCITY TRAJECTORY  (weight 25%)
SIGNAL 2 · SCHEME BENCHMARK DEVIATION  (weight 20%)
SIGNAL 3 · MARCH RUSH PROBABILITY  (weight 20%)
SIGNAL 4 · CROSS-YEAR PERSISTENCE  (weight 20%)
SIGNAL 5 · FUND PARKING / RELEASE LAG  (weight 15%)
"""

from __future__ import annotations
import os
from functools import lru_cache
from typing import Any
import numpy as np
import pandas as pd

DATA_DIR        = os.path.join(os.path.dirname(__file__), "..", "data")
EXPENDITURE_CSV = os.path.join(DATA_DIR, "expenditures.csv")
RELEASES_CSV    = os.path.join(DATA_DIR, "fund_releases.csv")

SCHEME_CURVES: dict[str, list[float]] = {
    "MGNREGS": [0.08, 0.17, 0.25, 0.33, 0.42, 0.50, 0.58, 0.67, 0.75, 0.83, 0.92, 1.00],
    "NHM":     [0.05, 0.11, 0.18, 0.25, 0.33, 0.42, 0.50, 0.58, 0.67, 0.75, 0.85, 1.00],
    "SSA":     [0.05, 0.10, 0.17, 0.25, 0.33, 0.42, 0.50, 0.58, 0.67, 0.75, 0.85, 1.00],
    "PMKSY":   [0.03, 0.07, 0.12, 0.18, 0.25, 0.33, 0.42, 0.50, 0.60, 0.72, 0.85, 1.00],
    "PMGSY":   [0.02, 0.04, 0.07, 0.12, 0.18, 0.25, 0.33, 0.43, 0.55, 0.68, 0.82, 1.00],
    "PMAY":    [0.03, 0.06, 0.10, 0.15, 0.22, 0.30, 0.39, 0.49, 0.60, 0.72, 0.85, 1.00],
    "JJM":     [0.03, 0.07, 0.12, 0.18, 0.25, 0.33, 0.42, 0.52, 0.63, 0.75, 0.87, 1.00],
    "AMRUT":   [0.02, 0.05, 0.09, 0.14, 0.20, 0.28, 0.37, 0.47, 0.58, 0.70, 0.83, 1.00],
}

OBJECTION_TYPES = {
    "UC_PENDING":        "Non-submission of Utilization Certificates within stipulated period",
    "IDLE_FUNDS":        "Funds kept idle / parked in bank accounts without utilization",
    "RUSH_EXPENDITURE":  "Injudicious rush expenditure at year-end to avoid lapse",
    "DIVERSION":         "Diversion of scheme funds to unintended purposes",
    "SHORT_UTILIZATION": "Persistent short utilization of allocated funds",
    "SLOW_PROGRESS":     "Slow physical and financial progress against approved targets",
    "ADVANCE_PENDING":   "Advances outstanding beyond prescribed period without adjustment",
}

TARGET_UTIL            = 0.85
PARKING_THRESHOLD      = 2.5
MAX_MONTHLY_VELOCITY   = 0.12
PERSISTENCE_MONTHS     = 8


@lru_cache(maxsize=1)
def _exp() -> pd.DataFrame:
    return pd.read_csv(EXPENDITURE_CSV)

@lru_cache(maxsize=1)
def _rel() -> pd.DataFrame:
    return pd.read_csv(RELEASES_CSV)


# ── Signal 1: Velocity ────────────────────────────────────────────────────────

def _compute_velocity(grp: pd.DataFrame, as_of_month: int) -> dict:
    monthly = grp.sort_values("month").copy()
    current_util = float(monthly["cumulative_rate"].max())
    monthly["delta"] = monthly["cumulative_rate"].diff().fillna(monthly["cumulative_rate"].iloc[0])

    recent_velocity = float(monthly.tail(3)["delta"].mean()) if len(monthly) >= 2 else 0.01

    if len(monthly) >= 6:
        prior_velocity = float(monthly.iloc[-6:-3]["delta"].mean())
        velocity_ratio = recent_velocity / prior_velocity if prior_velocity > 0.001 else 1.0
    else:
        velocity_ratio = 1.0

    if velocity_ratio > 1.15:   trend = "ACCELERATING"
    elif velocity_ratio < 0.70: trend = "DECELERATING"
    elif recent_velocity < 0.002: trend = "FLATLINED"
    else:                       trend = "STABLE"

    months_remaining = max(1, 12 - as_of_month)
    projected_util   = min(1.0, current_util + recent_velocity * months_remaining)
    gap_to_target    = max(0, TARGET_UTIL - current_util)
    required_velocity = gap_to_target / months_remaining
    catchup_feasible  = required_velocity <= MAX_MONTHLY_VELOCITY

    deficit = TARGET_UTIL - current_util
    if deficit <= 0:
        ponr_month = 0
    else:
        months_needed = deficit / MAX_MONTHLY_VELOCITY
        ponr_month = max(0, int(12 - months_needed))

    if trend == "FLATLINED" or recent_velocity < 0.005:
        score = 90.0
    elif not catchup_feasible:
        score = 75.0
    elif trend == "DECELERATING":
        score = 60.0
    else:
        ratio = recent_velocity / required_velocity if required_velocity > 0.001 else 2.0
        score = max(0.0, min(100.0, (1 - min(ratio, 1)) * 60))

    return {
        "current_util_pct":      round(current_util * 100, 2),
        "recent_velocity_pct":   round(recent_velocity * 100, 3),
        "required_velocity_pct": round(required_velocity * 100, 3),
        "projected_util_pct":    round(projected_util * 100, 2),
        "velocity_trend":        trend,
        "catchup_feasible":      catchup_feasible,
        "ponr_month":            ponr_month,
        "velocity_score":        round(score, 1),
    }


# ── Signal 2: Scheme Deviation ────────────────────────────────────────────────

def _compute_scheme_deviation(scheme: str, current_util: float, as_of_month: int) -> dict:
    curve    = SCHEME_CURVES.get(scheme, SCHEME_CURVES["NHM"])
    expected = curve[as_of_month - 1]
    deviation = current_util - expected
    score = min(100.0, abs(deviation) / expected * 100) if deviation < 0 and expected > 0 else 0.0
    return {
        "scheme_expected_util_pct": round(expected * 100, 1),
        "scheme_deviation_pct":     round(deviation * 100, 2),
        "scheme_deviation_score":   round(score, 1),
    }


# ── Signal 3: March Rush ──────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _rush_signatures() -> pd.DataFrame:
    df = _exp()
    d23   = df[df["year"] == 2023]
    total = d23.groupby(["state", "district", "department"])["amount_spent"].sum()
    rush  = d23[d23["month"] >= 10].groupby(["state", "district", "department"])["amount_spent"].sum()
    pct   = (rush / total).fillna(0.33).reset_index()
    pct.columns = ["state", "district", "department", "historical_rush_pct"]
    return pct

def _compute_march_rush(state, district, dept, current_util) -> dict:
    sigs = _rush_signatures()
    row  = sigs[(sigs["state"] == state) & (sigs["district"] == district) & (sigs["department"] == dept)]
    hist = float(row["historical_rush_pct"].iloc[0]) if len(row) > 0 else 0.33
    prob = min(1.0, hist * 0.7 + (1 - current_util) * 0.3)
    risk = "HIGH" if hist > 0.65 else "MEDIUM" if hist > 0.35 else "LOW"
    return {
        "historical_rush_pct":    round(hist * 100, 1),
        "march_rush_probability": round(prob * 100, 1),
        "rush_risk":              risk,
        "march_rush_score":       round(prob * 100, 1),
    }


# ── Signal 4: Cross-year Persistence ─────────────────────────────────────────

@lru_cache(maxsize=1)
def _m8_2023() -> pd.DataFrame:
    df = _exp()
    return (
        df[(df["year"] == 2023) & (df["month"] == PERSISTENCE_MONTHS)]
        .groupby(["state", "district", "department"])["cumulative_rate"]
        .mean().reset_index().rename(columns={"cumulative_rate": "util_2023"})
    )

def _compute_persistence(state, district, dept, util_2024) -> dict:
    df23 = _m8_2023()
    row  = df23[(df23["state"] == state) & (df23["district"] == district) & (df23["department"] == dept)]
    util_2023    = float(row["util_2023"].iloc[0]) if len(row) > 0 else util_2024
    delta        = util_2024 - util_2023
    deteriorating = delta < -0.02
    both_low     = util_2023 < 0.35 and util_2024 < 0.35

    if both_low and deteriorating:   score = 85.0
    elif both_low:                   score = 70.0
    elif util_2024 < 0.35 and deteriorating: score = 60.0
    elif util_2024 < 0.35:           score = 40.0
    elif deteriorating:              score = 30.0
    else:                            score = max(0.0, (0.35 - util_2024) / 0.35 * 30)

    return {
        "util_2023_pct":     round(util_2023 * 100, 2),
        "util_2024_pct":     round(util_2024 * 100, 2),
        "persistence_delta": round(delta * 100, 2),
        "is_deteriorating":  deteriorating,
        "persistence_score": round(score, 1),
    }


# ── Signal 5: Fund Parking ────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _all_parking() -> pd.DataFrame:
    rel = _rel()
    exp = _exp()
    dr  = rel[(rel["from_level"] == "District") & (rel["to_level"] == "Department")]

    rel_t = (dr.groupby(["year", "state", "district", "department"])
               .apply(lambda g: float(np.average(g["month"], weights=g["amount_received"]))
                      if g["amount_received"].sum() > 0 else 6.0)
               .reset_index(name="avg_release_month"))

    exp_t = (exp.groupby(["year", "state", "district", "department"])
                .apply(lambda g: float(np.average(g["month"], weights=g["amount_spent"]))
                       if g["amount_spent"].sum() > 0 else 6.0)
                .reset_index(name="avg_spend_month"))

    m = rel_t.merge(exp_t, on=["year", "state", "district", "department"])
    m["lag_months"] = m["avg_spend_month"] - m["avg_release_month"]
    return m

def _compute_parking(state, district, dept, year) -> dict:
    park = _all_parking()
    row  = park[(park["year"] == year) & (park["state"] == state) &
                (park["district"] == district) & (park["department"] == dept)]
    if row.empty:
        return {"avg_release_month": 6.0, "avg_spend_month": 6.5, "lag_months": 0.5, "parking_score": 10.0}
    lag = float(row["lag_months"].iloc[0])
    return {
        "avg_release_month": round(float(row["avg_release_month"].iloc[0]), 1),
        "avg_spend_month":   round(float(row["avg_spend_month"].iloc[0]), 1),
        "lag_months":        round(lag, 2),
        "parking_score":     round(min(100.0, max(0.0, (lag / 6.0) * 100)), 1),
    }


# ── Objection predictor ───────────────────────────────────────────────────────

def _predict_objections(vel_trend, rush_risk, lag, dev_pct, pers_score, deteriorating):
    objs = []
    if lag > PARKING_THRESHOLD:     objs.append("IDLE_FUNDS")
    if rush_risk == "HIGH":         objs.append("RUSH_EXPENDITURE")
    if vel_trend in ("FLATLINED", "DECELERATING"): objs.append("SLOW_PROGRESS")
    if dev_pct < -25:               objs.append("SHORT_UTILIZATION")
    if pers_score > 60 and deteriorating: objs.append("SHORT_UTILIZATION")
    if lag > 3.5:                   objs.append("ADVANCE_PENDING")
    if not objs:                    objs.append("SHORT_UTILIZATION")
    return objs[0], list(dict.fromkeys(objs[1:]))[:2]


# ── Intervention urgency ──────────────────────────────────────────────────────

def _urgency(as_of_month, ponr_month, catchup_feasible, score):
    mtp = ponr_month - as_of_month
    if not catchup_feasible and mtp <= 0: return "POINT_OF_NO_RETURN"
    if score >= 75 or mtp <= 1:           return "IMMEDIATE"
    if score >= 55 or mtp <= 2:           return "THIS_MONTH"
    if score >= 35 or mtp <= 3:           return "NEXT_QUARTER"
    return "MONITOR"


# ── Main function ─────────────────────────────────────────────────────────────

def compute_audit_risk(year: int = 2024, as_of_month: int = 8, state: str | None = None) -> list[dict]:
    exp = _exp()
    cur = exp[(exp["year"] == year) & (exp["month"] <= as_of_month)]
    if state:
        cur = cur[cur["state"] == state]

    results = []
    for (st, dist, dept), grp in cur.groupby(["state", "district", "department"]):
        scheme = grp["scheme"].iloc[0]
        budget = float(grp["budget_allocated"].iloc[0])

        vel  = _compute_velocity(grp, as_of_month)
        util = vel["current_util_pct"] / 100
        dev  = _compute_scheme_deviation(scheme, util, as_of_month)
        rush = _compute_march_rush(st, dist, dept, util)
        pers = _compute_persistence(st, dist, dept, util)
        park = _compute_parking(st, dist, dept, year)

        w_vel  = vel["velocity_score"]          * 0.25
        w_dev  = dev["scheme_deviation_score"]  * 0.20
        w_rush = rush["march_rush_score"]        * 0.20
        w_pers = pers["persistence_score"]       * 0.20
        w_park = park["parking_score"]           * 0.15

        score    = min(100.0, round(w_vel + w_dev + w_rush + w_pers + w_park, 1))
        tier     = "CRITICAL" if score >= 70 else "HIGH" if score >= 50 else "MEDIUM" if score >= 30 else "LOW"
        pobj, sobj = _predict_objections(
            vel["velocity_trend"], rush["rush_risk"], park["lag_months"],
            dev["scheme_deviation_pct"], pers["persistence_score"], pers["is_deteriorating"]
        )
        urg = _urgency(as_of_month, vel["ponr_month"], vel["catchup_feasible"], score)

        results.append({
            "state": st, "district": dist, "department": dept,
            "scheme": scheme, "budget_lakh": round(budget / 1e5, 2),
            "audit_risk_score": score, "risk_score": score, "risk_tier": tier,
            "intervention_urgency": urg,
            "months_to_ponr": max(0, vel["ponr_month"] - as_of_month),
            "catchup_feasible": vel["catchup_feasible"],
            # Signal 1
            "current_util_pct": vel["current_util_pct"],
            "projected_util_pct": vel["projected_util_pct"],
            "velocity_trend": vel["velocity_trend"],
            "recent_velocity_pct": vel["recent_velocity_pct"],
            "required_velocity_pct": vel["required_velocity_pct"],
            "ponr_month": vel["ponr_month"],
            # Signal 2
            "scheme_expected_util_pct": dev["scheme_expected_util_pct"],
            "scheme_deviation_pct": dev["scheme_deviation_pct"],
            # Signal 3
            "historical_rush_pct": rush["historical_rush_pct"],
            "march_rush_probability": rush["march_rush_probability"],
            "rush_risk": rush["rush_risk"],
            # Signal 4
            "util_2023_pct": pers["util_2023_pct"],
            "util_2024_pct": pers["util_2024_pct"],
            "persistence_delta": pers["persistence_delta"],
            "is_deteriorating": pers["is_deteriorating"],
            # Signal 5
            "avg_release_month": park["avg_release_month"],
            "avg_spend_month": park["avg_spend_month"],
            "lag_months": park["lag_months"],
            # Objections
            "primary_objection": pobj, "predicted_objection": pobj,
            "secondary_objections": sobj,
            "objection_text": OBJECTION_TYPES.get(pobj, "General non-compliance"),
            # Breakdown
            "score_breakdown": {
                "velocity":         round(w_vel, 1),
                "scheme_deviation": round(w_dev, 1),
                "march_rush":       round(w_rush, 1),
                "persistence":      round(w_pers, 1),
                "parking":          round(w_park, 1),
            },
        })

    return sorted(results, key=lambda x: x["audit_risk_score"], reverse=True)


def get_audit_summary(year: int = 2024, as_of_month: int = 8) -> dict:
    risks = compute_audit_risk(year=year, as_of_month=as_of_month)
    df    = pd.DataFrame(risks)
    if df.empty:
        return {}
    crit = df[df["risk_tier"] == "CRITICAL"]
    high = df[df["risk_tier"] == "HIGH"]
    return {
        "total_departments":     len(df),
        "critical_count":        len(crit),
        "high_risk_count":       len(crit) + len(high),
        "medium_risk_count":     len(df[df["risk_tier"] == "MEDIUM"]),
        "low_risk_count":        len(df[df["risk_tier"] == "LOW"]),
        "avg_audit_score":       round(float(df["audit_risk_score"].mean()), 1),
        "ponr_count":            int((df["intervention_urgency"] == "POINT_OF_NO_RETURN").sum()),
        "total_at_risk_lakh":    round(float(crit["budget_lakh"].sum()), 2),
        "pct_march_rush_high":   round(float((df["rush_risk"] == "HIGH").mean() * 100), 1),
        "pct_deteriorating":     round(float(df["is_deteriorating"].mean() * 100), 1),
        "avg_lag_months":        round(float(df["lag_months"].mean()), 2),
        "worst_state":           df.groupby("state")["audit_risk_score"].mean().idxmax() if len(df) else "N/A",
        "worst_department":      df.groupby("department")["audit_risk_score"].mean().idxmax() if len(df) else "N/A",
        "most_common_objection": df["primary_objection"].value_counts().index[0] if len(df) else "N/A",
        "objection_breakdown":   df["primary_objection"].value_counts().to_dict(),
        "urgency_breakdown": {u: int((df["intervention_urgency"] == u).sum())
                               for u in ["POINT_OF_NO_RETURN", "IMMEDIATE", "THIS_MONTH", "NEXT_QUARTER", "MONITOR"]},
        "velocity_breakdown": {v: int((df["velocity_trend"] == v).sum())
                                for v in ["FLATLINED", "DECELERATING", "STABLE", "ACCELERATING"]},
    }