"""
schemas/anomaly.py — Anomaly detection response models
"""
from pydantic import BaseModel
from typing import Optional

class AnomalyRecord(BaseModel):
    exp_id:           int
    year:             int
    month:            int
    state:            str
    district:         str
    department:       str
    scheme:           str
    budget_allocated: float
    amount_spent:     float
    utilization_rate: float
    peer_mean:        float
    peer_std:         float
    peer_count:       int
    z_score:          float
    severity:         str
    anomaly_type:     str

class AnomalySummary(BaseModel):
    total_anomalies:        int
    critical_count:         int
    warning_count:          int
    underutilization_count: int
    spending_spike_count:   int
    exposed_budget_cr:      float
    states_affected:        int
    departments_affected:   int

class ExplanationData(BaseModel):
    explanation:    str
    causes:         list[str]
    recommendation: str
    confidence:     str

class AnomalyWithExplanation(AnomalyRecord):
    explanation_data: Optional[ExplanationData] = None


"""
schemas/reallocation.py — Reallocation simulation response models
"""
from pydantic import BaseModel
from typing import Optional

class PoolEntry(BaseModel):
    state:             str
    district:          str
    department:        str
    budget_allocated:  float
    total_spent:       float
    utilization_pct:   float
    lapse_risk_pct:    float
    projected_unspent: float
    risk_tier:         str

class TransferRecommendation(BaseModel):
    from_state:                  str
    from_district:               str
    from_department:             str
    from_lapse_risk:             float
    from_utilization:            float
    to_district:                 str
    to_department:               str
    to_utilization:              float
    transfer_amount:             float
    transfer_amount_lakh:        float
    projected_improvement_from:  float
    projected_improvement_to:    float

class ReallocationResponse(BaseModel):
    surplus_pool:     list[PoolEntry]
    demand_pool:      list[PoolEntry]
    recommendations:  list[TransferRecommendation]
    summary:          dict

class SimulationSide(BaseModel):
    department:       str
    district:         str
    before_util_pct:  float
    after_util_pct:   float
    before_lapse_pct: float
    after_lapse_pct:  float

class SimulationResult(BaseModel):
    transfer_amount:      float
    transfer_amount_lakh: float
    transfer_pct:         float
    from_:               SimulationSide
    to:                  SimulationSide
    net_utilization_gain: float