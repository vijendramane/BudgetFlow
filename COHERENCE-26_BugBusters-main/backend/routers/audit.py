"""
routers/audit.py — CAG Audit Risk endpoints
"""
from fastapi import APIRouter, Query
from typing import Optional
from engines.audit_engine import compute_audit_risk, get_audit_summary
from schemas.audit import AuditRiskResponse, AuditSummaryResponse

router = APIRouter(prefix="/api/audit", tags=["Audit"])


@router.get("/risk", response_model=AuditRiskResponse)
def audit_risk(
    year:        int           = Query(2024),
    as_of_month: int           = Query(8),
    state:       Optional[str] = Query(None),
    limit:       int           = Query(200),
):
    risks = compute_audit_risk(year=year, as_of_month=as_of_month, state=state)
    return {"risks": risks[:limit], "total": len(risks)}


@router.get("/summary", response_model=AuditSummaryResponse)
def audit_summary(
    year:        int = Query(2024),
    as_of_month: int = Query(8),
):
    return {"summary": get_audit_summary(year=year, as_of_month=as_of_month)}