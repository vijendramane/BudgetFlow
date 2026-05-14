"""
graph_engine.py — Improved
NetworkX does all graph math.
Two output formats:
  1. D3-Sankey  → proportional flow bands, red leakage edges
  2. React Flow → interactive node-edge graph, animated red leakage edges

Key improvements over v1:
  - Nodes sorted by administrative level (Centre first, Dept last)
  - Links sorted by leakage_score desc (worst leakage most prominent)
  - Each link carries color + tooltip data (no extra API calls from frontend)
  - React Flow format with animated=true on leakage edges
  - stroke_width scales with leakage severity
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

import networkx as nx
import pandas as pd

DATA_DIR          = os.path.join(os.path.dirname(__file__), "..", "data")
RELEASES_CSV      = os.path.join(DATA_DIR, "fund_releases.csv")
LEAKAGE_THRESHOLD = 0.85
SEVERE_THRESHOLD  = 0.70

LEVEL_ORDER = {"Centre": 0, "State": 1, "District": 2, "Department": 3}
X_POSITIONS = {0: 50, 1: 320, 2: 640, 3: 980}   # px per level for React Flow


# ── Loader ────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_releases() -> pd.DataFrame:
    df = pd.read_csv(RELEASES_CSV)
    df["amount_released"]  = pd.to_numeric(df["amount_released"],  errors="coerce").fillna(0)
    df["amount_received"]  = pd.to_numeric(df["amount_received"],  errors="coerce").fillna(0)
    # If amount_received is all 0 but absorption_ratio column exists, derive received from it
    if "absorption_ratio" in df.columns and (df["amount_received"] == 0).all():
        df["absorption_ratio"] = pd.to_numeric(df["absorption_ratio"], errors="coerce").fillna(1.0)
        df["amount_received"]  = (df["amount_released"] * df["absorption_ratio"]).round(2)
    df["absorption_ratio"] = df["amount_received"].div(df["amount_released"].replace(0, 1)).round(4)
    df["gap_amount"]       = (df["amount_released"] - df["amount_received"]).clip(lower=0).round(2)
    for col in ["from_level", "to_level"]:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip().str.title()
    return df


# ── Graph builder ─────────────────────────────────────────────────────────────

def build_graph(year: int | None = None, state: str | None = None) -> nx.DiGraph:
    df = _load_releases()
    if year:  df = df[df["year"] == year]
    if state: df = df[df["state"] == state]

    G = nx.DiGraph()

    for _, row in df.iterrows():
        src, dst = str(row["from_entity"]).strip(), str(row["to_entity"]).strip()
        for node, level in [(src, row["from_level"]), (dst, row["to_level"])]:
            # Normalize level to Title Case: "centre" → "Centre", "STATE" → "State"
            level_clean = str(level).strip().title()
            if not G.has_node(node):
                G.add_node(node, level=level_clean, level_order=LEVEL_ORDER.get(level_clean, 99))

        if G.has_edge(src, dst):
            G[src][dst]["amount_released"] += row["amount_released"]
            G[src][dst]["amount_received"] += row["amount_received"]
            G[src][dst]["gap_amount"]       += row["gap_amount"]
            G[src][dst]["count"]            += 1
        else:
            G.add_edge(src, dst,
                amount_released = float(row["amount_released"] or 0),
                amount_received = float(row["amount_received"] or 0),
                gap_amount      = float(row["gap_amount"] or 0),
                state           = str(row["state"]).strip()      if str(row.get("state",      "")) not in ("", "nan") else "",
                district        = str(row["district"]).strip()   if str(row.get("district",   "")) not in ("", "nan") else "",
                department      = str(row["department"]).strip() if str(row.get("department", "")) not in ("", "nan") else "",
                from_level      = str(row["from_level"]).strip().title(),
                to_level        = str(row["to_level"]).strip().title(),
                count           = 1,
            )

    # Derive metrics on aggregated edges — all values guaranteed float, never NaN/None
    for u, v, d in G.edges(data=True):
        rel = _safe_float(d.get("amount_released"))
        rec = _safe_float(d.get("amount_received"))

        # If amount_received is 0 but absorption_ratio exists in CSV, derive received from it
        if rec == 0 and rel > 0:
            stored_ratio = _safe_float(d.get("absorption_ratio"), -1.0)
            if 0 < stored_ratio <= 1.0:
                rec = round(rel * stored_ratio, 2)

        d["amount_released"]  = rel
        d["amount_received"]  = rec
        d["gap_amount"]       = max(round(rel - rec, 2), 0)

        absorption            = round(rec / rel, 4) if rel > 0 else 1.0
        d["absorption_ratio"] = absorption
        d["leakage_score"]    = round(max((1 - absorption) * 100, 0), 2)
        d["is_leakage"]       = bool(absorption < LEAKAGE_THRESHOLD)
        d["is_severe"]        = bool(absorption < SEVERE_THRESHOLD)
        d["severity"]         = _severity(absorption)
        d["gap_lakh"]         = round(d["gap_amount"] / 1e5, 2)
        d["color"]            = _edge_color(d["severity"])
        d["stroke_width"]     = _stroke_width(d["leakage_score"])

    return G


# ── Helpers ───────────────────────────────────────────────────────────────────



def _safe_float(val, fallback: float = 0.0) -> float:
    try:
        f = float(val)
        return f if (f == f and abs(f) != float("inf")) else fallback
    except (TypeError, ValueError):
        return fallback

def _safe_str(val, fallback: str = "") -> str:
    s = str(val).strip()
    return fallback if s in ("", "nan", "None", "NaN") else s

def _severity(ratio: float) -> str:
    if ratio < SEVERE_THRESHOLD:  return "CRITICAL"
    if ratio < LEAKAGE_THRESHOLD: return "HIGH"
    if ratio < 0.92:              return "MEDIUM"
    return "NORMAL"

def _edge_color(severity: str) -> str:
    return {"CRITICAL": "#ef4444", "HIGH": "#f97316", "MEDIUM": "#eab308", "NORMAL": "#22c55e"}.get(severity, "#64748b")

def _stroke_width(leakage_score: float) -> float:
    if leakage_score >= 25: return 3.5
    if leakage_score >= 15: return 2.5
    if leakage_score >= 5:  return 1.5
    return 1.0


# ── D3-Sankey format ──────────────────────────────────────────────────────────

def get_sankey_data(year: int | None = None, state: str | None = None) -> dict[str, Any]:
    """
    D3-Sankey format.
    Nodes sorted by administrative level.
    Links sorted worst leakage first — they render most prominently.
    Every link carries color + full tooltip so frontend calls no extra APIs.
    """
    G = build_graph(year=year, state=state)

    sorted_nodes = sorted(G.nodes(data=True), key=lambda n: (n[1].get("level_order", 99), n[0]))
    node_index   = {name: i for i, (name, _) in enumerate(sorted_nodes)}

    nodes = [
        {"id": name, "name": name, "level": attrs.get("level", ""), "level_order": attrs.get("level_order", 99)}
        for name, attrs in sorted_nodes
    ]

    raw_links = []
    for u, v, d in G.edges(data=True):
        if u not in node_index or v not in node_index:
            continue
        raw_links.append({
            "source":           node_index[u],
            "target":           node_index[v],
            "source_name":      _safe_str(u, "Unknown"),
            "target_name":      _safe_str(v, "Unknown"),
            "value":            max(round(_safe_float(d.get("amount_released")) / 1e5, 2), 0.01),
            "absorption_ratio": _safe_float(d.get("absorption_ratio"), 1.0),
            "leakage_score":    _safe_float(d.get("leakage_score"), 0.0),
            "is_leakage":       bool(d.get("is_leakage", False)),
            "is_severe":        bool(d.get("is_severe",  False)),
            "severity":         _safe_str(d.get("severity"), "NORMAL"),
            "color":            _safe_str(d.get("color"),    "#22c55e"),
            "stroke_width":     _safe_float(d.get("stroke_width"), 1.0),
            "gap_lakh":         _safe_float(d.get("gap_lakh"), 0.0),
            "tooltip": {
                "from":           _safe_str(u, "Unknown"),
                "to":             _safe_str(v, "Unknown"),
                "released_lakh":  round(_safe_float(d.get("amount_released")) / 1e5, 2),
                "received_lakh":  round(_safe_float(d.get("amount_received")) / 1e5, 2),
                "gap_lakh":       round(_safe_float(d.get("gap_lakh")), 2),
                "absorption_pct": round(_safe_float(d.get("absorption_ratio"), 1.0) * 100, 2),
                "severity":       _safe_str(d.get("severity"), "NORMAL"),
                "state":          _safe_str(d.get("state"),      "N/A"),
                "department":     _safe_str(d.get("department"), "N/A"),
            }
        })

    # Leakage first, then by leakage_score desc
    links = sorted(raw_links, key=lambda l: (0 if l["is_leakage"] else 1, -l["leakage_score"]))
    return {"nodes": nodes, "links": links}


# ── React Flow format ─────────────────────────────────────────────────────────

def get_react_flow_data(year: int | None = None, state: str | None = None) -> dict[str, Any]:
    """
    React Flow (@xyflow/react) format.
    Interactive graph — users click nodes and edges to inspect.
    Leakage edges: animated=True + red stroke + label showing gap %.
    Normal edges: static + green/yellow stroke + 50% opacity.
    Nodes positioned by level (x-axis) and alphabetically (y-axis).
    """
    G = build_graph(year=year, state=state)

    # Group and sort nodes by level for clean layout
    level_groups: dict[int, list[str]] = {}
    for name, attrs in G.nodes(data=True):
        lo = attrs.get("level_order", 99)
        level_groups.setdefault(lo, []).append(name)
    for lo in level_groups:
        level_groups[lo] = sorted(level_groups[lo])

    # Position nodes
    rf_nodes = []
    node_positions: dict[str, dict] = {}

    for lo, names in sorted(level_groups.items()):
        x     = X_POSITIONS.get(lo, lo * 300 + 50)
        count = len(names)
        for i, name in enumerate(names):
            y = (i + 1) * (max(600, count * 60) / (count + 1))
            node_positions[name] = {"x": x, "y": y}
            attrs = G.nodes[name]
            rf_nodes.append({
                "id":       name,
                "type":     "budgetNode",
                "position": {"x": x, "y": round(y)},
                "data": {
                    "label":       name,
                    "level":       attrs.get("level", ""),
                    "level_order": attrs.get("level_order", 99),
                    "level_color": _level_color(attrs.get("level", "")),
                }
            })

    # Build edges — leakage edges animated and red
    rf_edges = []
    for u, v, d in G.edges(data=True):
        edge_id = f"e_{u}_{v}".replace(" ", "_").replace("→", "_")
        rf_edges.append({
            "id":       edge_id,
            "source":   u,
            "target":   v,
            "type":     "smoothstep",
            "animated": d["is_leakage"],                    # ← red edges animate
            "style": {
                "stroke":      d["color"],
                "strokeWidth": d["stroke_width"],
                "opacity":     1.0 if d["is_leakage"] else 0.45,
            },
            "label":      f"⚠ {d['leakage_score']}% gap" if d["is_leakage"] else "",
            "labelStyle": {"fill": "#ef4444", "fontWeight": 700, "fontSize": 11},
            "labelBgStyle": {"fill": "#1a1a2e", "fillOpacity": 0.85},
            "data": {
                "absorption_ratio": d["absorption_ratio"],
                "leakage_score":    d["leakage_score"],
                "is_leakage":       d["is_leakage"],
                "is_severe":        d["is_severe"],
                "severity":         d["severity"],
                "gap_lakh":         d["gap_lakh"],
                "released_lakh":    round(d["amount_released"] / 1e5, 2),
                "received_lakh":    round(d["amount_received"] / 1e5, 2),
                "state":            d.get("state", ""),
                "department":       d.get("department", ""),
            }
        })

    # Leakage edges on top
    rf_edges.sort(key=lambda e: (0 if e["animated"] else 1, -e["data"]["leakage_score"]))

    return {
        "nodes": rf_nodes,
        "edges": rf_edges,
        "summary": {
            "total_nodes":   len(rf_nodes),
            "total_edges":   len(rf_edges),
            "leakage_edges": sum(1 for e in rf_edges if e["animated"]),
            "normal_edges":  sum(1 for e in rf_edges if not e["animated"]),
        }
    }


def _level_color(level: str) -> str:
    return {
        "Centre":     "#3b82f6",  # blue
        "State":      "#8b5cf6",  # purple
        "District":   "#06b6d4",  # cyan
        "Department": "#22c55e",  # green
    }.get(level, "#64748b")


# ── Leakage edges list ────────────────────────────────────────────────────────

def get_leakage_edges(
    year:      int | None = None,
    state:     str | None = None,
    min_score: float      = 1.0,
) -> list[dict[str, Any]]:
    G   = build_graph(year=year, state=state)
    out = [
        {
            "from_entity":      u,
            "to_entity":        v,
            "from_level":       d.get("from_level"),
            "to_level":         d.get("to_level"),
            "state":            d.get("state"),
            "district":         d.get("district"),
            "department":       d.get("department"),
            "amount_released":  round(d["amount_released"], 2),
            "amount_received":  round(d["amount_received"], 2),
            "gap_amount":       round(d["gap_amount"], 2),
            "gap_lakh":         d["gap_lakh"],
            "absorption_ratio": d["absorption_ratio"],
            "leakage_score":    d["leakage_score"],
            "is_leakage":       d["is_leakage"],
            "is_severe":        d["is_severe"],
            "severity":         d["severity"],
            "color":            d["color"],
        }
        for u, v, d in G.edges(data=True)
        if d["leakage_score"] >= min_score
    ]
    return sorted(out, key=lambda x: x["leakage_score"], reverse=True)


# ── Flow summary KPIs ─────────────────────────────────────────────────────────

def get_flow_summary(year: int | None = None) -> dict[str, Any]:
    df = _load_releases()
    if year: df = df[df["year"] == year]

    total_released = df["amount_released"].sum()
    total_received = df["amount_received"].sum()
    total_gap      = df["gap_amount"].sum()

    return {
        "total_released_cr":      round(total_released / 1e7, 2),
        "total_received_cr":      round(total_received / 1e7, 2),
        "total_gap_cr":           round(total_gap / 1e7, 2),
        "overall_absorption_pct": round((total_received / total_released) * 100, 2) if total_released else 0,
        "leakage_edge_count":     int((df["absorption_ratio"] < LEAKAGE_THRESHOLD).sum()),
        "critical_edge_count":    int((df["absorption_ratio"] < SEVERE_THRESHOLD).sum()),
        "leakage_loss_pct":       round((total_gap / total_released) * 100, 2) if total_released else 0,
    }