"""
schemas/flow.py — Sankey + fund flow response models
"""
from pydantic import BaseModel
from typing import Optional

class SankeyNode(BaseModel):
    name:  str
    level: str

class SankeyLink(BaseModel):
    source:           int
    target:           int
    value:            float
    leakage_score:    float
    absorption_ratio: float
    severity:         str
    fill:             str

class SankeyResponse(BaseModel):
    nodes: list[SankeyNode]
    links: list[SankeyLink]

class FlowSummary(BaseModel):
    total_released_cr:      float
    total_received_cr:      float
    total_gap_cr:           float
    overall_absorption_pct: float
    leakage_edge_count:     int
    critical_edge_count:    int
    leakage_loss_pct:       float

class LeakageEdge(BaseModel):
    from_entity:      str
    to_entity:        str
    from_level:       Optional[str]
    to_level:         Optional[str]
    state:            Optional[str]
    district:         Optional[str]
    department:       Optional[str]
    amount_released:  float
    amount_received:  float
    gap_amount:       float
    absorption_ratio: float
    leakage_score:    float
    is_leakage:       bool
    severity:         str