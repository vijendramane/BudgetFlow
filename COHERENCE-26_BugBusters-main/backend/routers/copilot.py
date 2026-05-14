"""
routers/copilot.py

AI Copilot endpoints.

GET  /api/copilot/digest          → pre-generated narrative digest
POST /api/copilot/ask             → contextual Q&A with tool-calling
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/copilot", tags=["AI Copilot"])


class AskRequest(BaseModel):
    question:     str
    year:         int            = 2024
    as_of_month:  int            = 8
    chat_history: Optional[list] = None   # list of {role, content} dicts


@router.get("/digest")
def get_digest(
    year:        int = Query(2024),
    as_of_month: int = Query(8),
):
    """
    Returns pre-generated narrative briefing.
    Groq writes the narrative, engines compute the numbers.
    Falls back to rule-based if Groq unavailable.
    """
    from engines.Copilot     import generate_narrative_digest
    from engines.zscore_engine      import get_anomalies
    from engines.pattern_classifier import get_pattern_lapse_risks
    from engines.graph_engine       import get_flow_summary
    from cache.snapshot_manager     import load_snapshot, compute_delta

    anomalies    = get_anomalies(year=year, limit=30)
    lapse_risks  = get_pattern_lapse_risks(year=year, as_of_month=as_of_month, limit=20)
    flow_sum     = get_flow_summary(year=year)
    snapshot     = load_snapshot()
    delta        = compute_delta(anomalies, lapse_risks, snapshot)

    return generate_narrative_digest(
        delta        = delta,
        lapse_risks  = lapse_risks,
        anomalies    = anomalies,
        flow_summary = flow_sum,
        year         = year,
        as_of_month  = as_of_month,
    )


@router.post("/ask")
def ask(body: AskRequest):
    """
    Contextual Q&A. Classifies intent, calls engine tools,
    feeds results to Groq for plain-English explanation.
    """
    from engines.Copilot import answer_question

    if not body.question or len(body.question.strip()) < 3:
        return {"answer": "Please ask a specific question about the budget data.", "source": "validation"}

    return answer_question(
        question     = body.question.strip(),
        year         = body.year,
        as_of_month  = body.as_of_month,
        chat_history = body.chat_history or [],
    )