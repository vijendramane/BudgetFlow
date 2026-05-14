"""
routers/flow.py — Fund flow graph + Sankey data
"""
from fastapi import APIRouter, Query
from typing import Optional
from engines.graph_engine import get_sankey_data, get_leakage_edges, get_flow_summary

router = APIRouter(prefix="/api/flow", tags=["Fund Flow"])


@router.get("/sankey")
def sankey(
    year:  int           = Query(2024),
    state: Optional[str] = Query(None),
):
    raw = get_sankey_data(year=year, state=state)

    # Normalize node shape: backend returns {name, level} → frontend expects {id, level}
    nodes = [{"id": n["name"], "level": n.get("level", "")} for n in raw["nodes"]]

    # Normalize link shape: backend returns numeric source/target → frontend expects string id
    # Also backend uses 'leakage_score' — frontend expects 'is_leakage' bool + 'absorption_ratio'
    node_names = [n["name"] for n in raw["nodes"]]
    links = []
    for lnk in raw["links"]:
        src_idx = lnk["source"]
        tgt_idx = lnk["target"]
        links.append({
            "source":           node_names[src_idx] if isinstance(src_idx, int) else src_idx,
            "target":           node_names[tgt_idx] if isinstance(tgt_idx, int) else tgt_idx,
            "value":            lnk["value"],
            "absorption_ratio": lnk.get("absorption_ratio", 1.0),
            "is_leakage":       lnk.get("leakage_score", 0) >= 15,  # >15% gap = leakage
        })

    return {"nodes": nodes, "links": links}


@router.get("/leakage-edges")
def leakage_edges(
    year:      int           = Query(2024),
    state:     Optional[str] = Query(None),
    min_score: float         = Query(1.0),
):
    return get_leakage_edges(year=year, state=state, min_score=min_score)


@router.get("/summary")
def flow_summary(year: int = Query(2024)):
    raw = get_flow_summary(year=year)
    # Normalize keys to match frontend FlowSummary interface
    return {
        "year":                 year,
        "total_released":       raw.get("total_released_cr", 0) * 1e7,
        "total_received":       raw.get("total_received_cr", 0) * 1e7,
        "avg_absorption_ratio": raw.get("overall_absorption_pct", 0) / 100,
        "leakage_edge_count":   raw.get("leakage_edge_count", 0),
        "total_gap_amount":     raw.get("total_gap_cr", 0) * 1e7,
    }