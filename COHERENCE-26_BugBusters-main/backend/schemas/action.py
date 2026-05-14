"""
schemas/action.py
Pydantic models for the action queue endpoints.
"""

from __future__ import annotations
from pydantic import BaseModel
from typing import Optional, Any


class DetectionData(BaseModel):
    state:                str
    district:             str
    department:           str
    utilization_pct:      float
    lapse_risk_pct:       float
    pattern:              str
    confidence_interval:  list[float]
    z_score:              Optional[float] = None
    peer_mean:            Optional[float] = None


class RecommendationData(BaseModel):
    action_type:      str
    from_district:    str
    from_department:  str
    to_district:      str
    to_department:    str
    transfer_amount:  float
    transfer_lakh:    float
    transfer_pct:     float
    gfr_note:         str


class ProjectedImpact(BaseModel):
    from_util_before:   float
    from_util_after:    float
    from_lapse_before:  float
    from_lapse_after:   float
    to_util_before:     float
    to_util_after:      float
    net_gain:           float


class InterventionWindow(BaseModel):
    window_closes_month: int
    days_remaining:      int
    urgency:             str
    action_required:     bool
    rationale:           str


class ScoringTraceItem(BaseModel):
    factor:  str
    points:  str
    detail:  str


class ConfidenceScore(BaseModel):
    confidence_score: int
    confidence_label: str
    scoring_trace:    list[ScoringTraceItem]
    transfer_pct:     float


class ActionCard(BaseModel):
    action_id:           str
    status:              str         # DRAFT | APPROVED | DISMISSED
    priority:            str         # IMMEDIATE | CRITICAL | HIGH | MEDIUM | LOW
    created_at:          str
    actioned_at:         Optional[str] = None
    officer_note:        str

    detection:           DetectionData
    recommendation:      RecommendationData
    projected_impact:    ProjectedImpact
    intervention_window: InterventionWindow
    confidence:          ConfidenceScore


class QueueSummary(BaseModel):
    draft_count:             int
    approved_count:          int
    dismissed_count:         int
    immediate_count:         int
    total_transferable_cr:   float


class ActionQueueResponse(BaseModel):
    actions: list[ActionCard]
    summary: QueueSummary


class DigestItem(BaseModel):
    type:     str
    emoji:    str
    headline: str
    detail:   str
    action:   str
    priority: int


class DailyDigest(BaseModel):
    generated_at:             str
    year:                     int
    as_of_month:              int
    has_urgent:               bool
    items:                    list[DigestItem]
    summary_line:             str
    changes_since_last_run:   bool


class PolicyMemo(BaseModel):
    action_id:  str
    memo_text:  str
    generated:  str


class ActionDecision(BaseModel):
    officer_note: Optional[str] = ""