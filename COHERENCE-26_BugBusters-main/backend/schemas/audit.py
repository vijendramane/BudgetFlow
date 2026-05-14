"""
schemas/audit.py
Pydantic models for the 5-signal Audit Risk engine.

Signals:
  1. Velocity Trajectory
  2. Scheme Benchmark Deviation
  3. March Rush Probability
  4. Cross-year Persistence
  5. Fund Parking / Release Lag
"""
from __future__ import annotations
from pydantic import BaseModel
from typing import Optional


# ── Score breakdown ───────────────────────────────────────────────────────────

class ScoreBreakdown(BaseModel):
    velocity:         float   # Signal 1 contribution (weight 25%)
    scheme_deviation: float   # Signal 2 contribution (weight 20%)
    march_rush:       float   # Signal 3 contribution (weight 20%)
    persistence:      float   # Signal 4 contribution (weight 20%)
    parking:          float   # Signal 5 contribution (weight 15%)


# ── Per-department audit risk record ─────────────────────────────────────────

class AuditRiskRecord(BaseModel):
    # Identity
    state:       str
    district:    str
    department:  str
    scheme:      str
    budget_lakh: float

    # Composite output
    audit_risk_score:     float   # 0–100
    risk_score:           float   # alias for frontend compat
    risk_tier:            str     # CRITICAL | HIGH | MEDIUM | LOW
    intervention_urgency: str     # POINT_OF_NO_RETURN | IMMEDIATE | THIS_MONTH | NEXT_QUARTER | MONITOR
    months_to_ponr:       int     # months until catch-up becomes impossible
    catchup_feasible:     bool

    # Signal 1 — Velocity Trajectory
    current_util_pct:      float
    projected_util_pct:    float
    velocity_trend:        str    # FLATLINED | DECELERATING | STABLE | ACCELERATING
    recent_velocity_pct:   float  # avg monthly utilization increment (last 3 months)
    required_velocity_pct: float  # needed per month to hit 85% by year-end
    ponr_month:            int    # fiscal month after which catch-up impossible

    # Signal 2 — Scheme Benchmark Deviation
    scheme_expected_util_pct: float   # expected utilization for this scheme at current month
    scheme_deviation_pct:     float   # actual − expected (negative = below benchmark)

    # Signal 3 — March Rush Probability
    historical_rush_pct:    float   # % of FY23 spend that occurred in Oct–Dec
    march_rush_probability: float   # modelled probability for FY24 (0–100)
    rush_risk:              str     # HIGH | MEDIUM | LOW

    # Signal 4 — Cross-year Persistence
    util_2023_pct:     float
    util_2024_pct:     float
    persistence_delta: float   # 2024 − 2023 (negative = deteriorating)
    is_deteriorating:  bool

    # Signal 5 — Fund Parking / Release Lag
    avg_release_month: float   # weighted avg month funds were released
    avg_spend_month:   float   # weighted avg month funds were spent
    lag_months:        float   # avg_spend_month − avg_release_month

    # Objections
    primary_objection:    str
    predicted_objection:  str          # alias for frontend compat
    secondary_objections: list[str]
    objection_text:       str

    # Explainability
    score_breakdown: ScoreBreakdown


# ── Summary ───────────────────────────────────────────────────────────────────

class UrgencyBreakdown(BaseModel):
    POINT_OF_NO_RETURN: int
    IMMEDIATE:          int
    THIS_MONTH:         int
    NEXT_QUARTER:       int
    MONITOR:            int


class VelocityBreakdown(BaseModel):
    FLATLINED:    int
    DECELERATING: int
    STABLE:       int
    ACCELERATING: int


class AuditSummary(BaseModel):
    total_departments:     int
    critical_count:        int
    high_risk_count:       int
    medium_risk_count:     int
    low_risk_count:        int
    avg_audit_score:       float
    ponr_count:            int     # depts past point of no return
    total_at_risk_lakh:    float
    pct_march_rush_high:   float   # % of depts with HIGH march rush risk
    pct_deteriorating:     float   # % of depts worse than last year
    avg_lag_months:        float
    worst_state:           str
    worst_department:      str
    most_common_objection: str
    objection_breakdown:   dict[str, int]
    urgency_breakdown:     dict[str, int]
    velocity_breakdown:    dict[str, int]


# ── Response wrappers ─────────────────────────────────────────────────────────

class AuditRiskResponse(BaseModel):
    risks: list[AuditRiskRecord]
    total: int


class AuditSummaryResponse(BaseModel):
    summary: AuditSummary