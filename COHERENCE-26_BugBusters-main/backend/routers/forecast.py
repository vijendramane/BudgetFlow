"""
routers/forecast.py — Lapse risk forecasting
"""
from fastapi import APIRouter, Query
from typing import Optional
from engines.lapse_projector import get_lapse_risks, get_lapse_summary, get_trajectory_chart

router = APIRouter(prefix="/api/forecast", tags=["Forecast"])


@router.get("/lapse-risks")
def lapse_risks(
    year:        int           = Query(2024),
    as_of_month: int           = Query(8),
    risk_tier:   Optional[str] = Query(None),
    state:       Optional[str] = Query(None),
    limit:       int           = Query(50),
):
    risks   = get_lapse_risks(year=year, as_of_month=as_of_month,
                               risk_tier=risk_tier, state=state, limit=limit)
    summary = get_lapse_summary(year=year, as_of_month=as_of_month)

    # Normalize to match frontend LapseRisk interface
    normalized = []
    for r in risks:
        normalized.append({
            "department":       r["department"],
            "district":         r["district"],
            "state":            r["state"],
            "scheme":           r.get("scheme", ""),
            "year":             year,
            "as_of_month":      as_of_month,
            "monthly_rate":     r["utilization_pct"] / 100 / as_of_month,
            "projected_final":  1 - r["lapse_risk_pct"] / 100,
            "lapse_risk_pct":   r["lapse_risk_pct"],
            "risk_tier":        r["risk_tier"],
            "budget_allocated": r["budget_allocated"],
            "amount_spent_so_far": r["total_spent"],
        })

    return normalized


@router.get("/trajectory")
def trajectory(
    department: str = Query(...),
    district:   str = Query(...),
    state:      str = Query(...),
    year:       int = Query(2024),
):
    raw = get_trajectory_chart(
        department=department, district=district,
        state=state, year=year,
    )

    # Normalize to match frontend Trajectory interface
    monthly_data = []
    for pt in raw.get("actual", []):
        monthly_data.append({
            "month":           pt["month"],
            "cumulative_rate": pt["rate"] / 100,
            "projected":       False,
        })
    for pt in raw.get("projected", []):
        monthly_data.append({
            "month":           pt["month"],
            "cumulative_rate": pt["rate"] / 100,
            "projected":       True,
        })

    return {
        "department":       department,
        "district":         district,
        "state":            state,
        "year":             year,
        "monthly_data":     monthly_data,
        "projected_final":  1 - raw.get("lapse_risk_pct", 0) / 100,
        "lapse_risk_pct":   raw.get("lapse_risk_pct", 0),
        "risk_tier":        raw.get("risk_tier", "LOW"),
    }