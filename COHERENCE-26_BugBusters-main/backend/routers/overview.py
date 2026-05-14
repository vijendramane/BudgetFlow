"""
routers/overview.py — National KPI summary
"""
from fastapi import APIRouter, Query
from engines.graph_engine    import get_flow_summary
from engines.zscore_engine   import get_anomaly_summary
from engines.lapse_projector import get_lapse_summary

router = APIRouter(prefix="/api", tags=["Overview"])


@router.get("/overview")
def overview(year: int = Query(2024)):
    flow    = get_flow_summary(year=year)
    anomaly = get_anomaly_summary(year=year)
    lapse   = get_lapse_summary(year=year)

    total_released = flow.get("total_released_cr", 0) * 1e7
    total_received = flow.get("total_received_cr", 0) * 1e7
    absorption_pct = flow.get("overall_absorption_pct", 0)

    return {
        "year":                     year,
        "total_allocated":          total_released,
        "total_released":           total_released,
        "total_spent":              total_received,
        "overall_utilization_pct":  absorption_pct,
        "overall_absorption_pct":   absorption_pct,
        "leakage_edges_count":      flow.get("leakage_edge_count", 0),
        "critical_anomalies_count": anomaly.get("critical_count", 0),
        "high_lapse_risk_count":    lapse.get("high_risk_count", 0),
        "health_score":             _health(flow, anomaly, lapse),
        # zscore_engine uses states_affected / departments_affected
        "states_covered":           anomaly.get("states_affected", 0),
        "departments_covered":      anomaly.get("departments_affected", 0),
    }


def _health(flow: dict, anomaly: dict, lapse: dict) -> int:
    score = 100
    score -= min(flow.get("leakage_edge_count", 0) * 5, 25)
    score -= min(anomaly.get("critical_count", 0) * 4, 20)
    score -= min(lapse.get("high_risk_count", 0) * 3, 15)
    absorption = flow.get("overall_absorption_pct", 100) / 100
    if absorption < 0.85:
        score -= int((0.85 - absorption) * 100)
    return max(0, min(100, score))