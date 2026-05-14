"""
routers/actions.py
Action queue endpoints — the core winning feature.

GET  /api/actions              → full action queue
GET  /api/actions/{id}         → single action detail
POST /api/actions/{id}/approve → approve with optional note
POST /api/actions/{id}/dismiss → dismiss with reason
GET  /api/actions/{id}/memo    → generate policy memo text
GET  /api/actions/digest       → daily digest
"""

from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import Optional

from engines.action_queue      import generate_action_queue, generate_policy_memo, get_queue_summary
from engines.intervention_engine import generate_daily_digest
from cache.snapshot_manager    import update_action_status, get_action_by_id, load_actions

router = APIRouter(prefix="/api/actions", tags=["Action Queue"])


# ── Request bodies ────────────────────────────────────────────────────────────

class ActionDecision(BaseModel):
    officer_note: Optional[str] = ""


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
def get_action_queue(
    year:        int           = Query(2024),
    as_of_month: int           = Query(8),
    status:      Optional[str] = Query(None),   # DRAFT | APPROVED | DISMISSED
    priority:    Optional[str] = Query(None),   # IMMEDIATE | CRITICAL | HIGH | MEDIUM
):
    """
    Returns full action queue. Generates fresh draft actions from engines,
    merges with persisted status decisions.
    """
    actions = generate_action_queue(year=year, as_of_month=as_of_month)

    if status:
        actions = [a for a in actions if a["status"] == status.upper()]
    if priority:
        actions = [a for a in actions if a["priority"] == priority.upper()]

    return {
        "actions": actions,
        "summary": get_queue_summary(actions),
    }


@router.get("/digest")
def daily_digest(
    year:        int = Query(2024),
    as_of_month: int = Query(8),
):
    """
    Returns pre-computed daily briefing.
    In production this would be cached from startup. Here generated on demand.
    """
    from engines.pattern_classifier import get_pattern_lapse_risks
    from cache.snapshot_manager     import load_snapshot, compute_delta
    from engines.zscore_engine      import get_anomalies

    lapse_risks = get_pattern_lapse_risks(year=year, as_of_month=as_of_month, limit=20)
    anomalies   = get_anomalies(year=year, limit=30)
    snapshot    = load_snapshot()
    delta       = compute_delta(anomalies, lapse_risks, snapshot)

    return generate_daily_digest(
        delta       = delta,
        lapse_risks = lapse_risks,
        year        = year,
        as_of_month = as_of_month,
    )


@router.get("/{action_id}")
def get_action(action_id: str):
    """Returns full detail for a single action."""
    action = get_action_by_id(action_id)
    if not action:
        raise HTTPException(status_code=404, detail=f"Action {action_id} not found")
    return action


@router.post("/{action_id}/approve")
def approve_action(action_id: str, body: ActionDecision):
    """Finance officer approves the recommended transfer."""
    updated = update_action_status(
        action_id   = action_id,
        status      = "APPROVED",
        officer_note = body.officer_note or "Approved",
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Action {action_id} not found")
    return {"status": "approved", "action": updated}


@router.post("/{action_id}/dismiss")
def dismiss_action(action_id: str, body: ActionDecision):
    """Finance officer dismisses the recommendation."""
    updated = update_action_status(
        action_id    = action_id,
        status       = "DISMISSED",
        officer_note = body.officer_note or "Dismissed",
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Action {action_id} not found")
    return {"status": "dismissed", "action": updated}


@router.get("/{action_id}/memo")
def get_policy_memo(action_id: str):
    """Generates a formatted policy memo for the action."""
    memo = generate_policy_memo(action_id)
    if "error" in memo:
        raise HTTPException(status_code=404, detail=memo["error"])
    return memo