"""
engines/copilot_engine.py  (rewritten — Phase 2)

AI Copilot powered by Groq llama-3.3-70b-versatile.

DESIGN PHILOSOPHY
─────────────────
The copilot is NOT a chatbot that wraps a keyword matcher.
It is a finance intelligence layer that:

  1. Pulls REAL numbers from every relevant engine
  2. Assembles a rich, typed context payload
  3. Sends that payload to Groq with a domain-expert system prompt
  4. Groq writes the narrative — it NEVER computes
  5. Every answer is grounded in actual engine outputs

The rule fallback is a last resort. The goal is always Groq.

CONTEXTUAL INTELLIGENCE
────────────────────────
Rather than matching one keyword to one tool, the engine:
  - Runs ALL relevant tools upfront based on intent
  - Cross-references anomalies with lapse risks
  - Identifies the same district appearing in multiple engines
  - Builds a unified picture: "Varanasi Health is CRITICAL in z-score,
    HIGH in lapse risk, and has a leakage edge — here's the full story"

This is what separates a copilot from a search box.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from groq import Groq

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

DEFAULT_YEAR  = 2024
DEFAULT_MONTH = 8

# ─────────────────────────────────────────────────────────────────────────────
# SYSTEM PROMPT — The most important thing in this file
# A weak system prompt = generic answers
# A strong system prompt = answers a CAG auditor would give
# ─────────────────────────────────────────────────────────────────────────────

COPILOT_SYSTEM_PROMPT = """You are the AI Copilot embedded in India's Budget Flow Intelligence Platform — 
a real-time fund tracking system used by state Finance Secretaries and district collectors.

YOUR IDENTITY
You are not a general assistant. You are a senior government finance analyst with 15+ years 
of experience in public expenditure management, PFMS (Public Financial Management System), 
GFR 2017, and CAG audit methodology.

YOUR KNOWLEDGE BASE
You understand:
- Budget cycle: Centre releases → State absorption → District utilization → Department delivery
- Leakage mechanics: funds can be diverted at Centre→State, State→District, or District→Dept edges
- Z-score anomaly detection: peers are defined as same dept/scheme nationally in same month
- Lapse risk: government funds that remain unspent at fiscal year-end (March 31) lapse
- Pattern types: Flatline = structural absorption failure; March Rush = year-end panic spend
- GFR Rule 15: allows re-appropriation within a Ministry if lapse risk >30%
- PFMS flags: absorption ratio <0.85 triggers automatic audit notice
- Common causes: procurement delays, contractor default, officer transfer, approval bottlenecks

YOUR BEHAVIORAL RULES
1. ALWAYS use the actual numbers from the ENGINE DATA provided. Never invent numbers.
2. ALWAYS be specific: name the department, district, state, and amount.
3. ALWAYS connect findings across engines: if a district appears in anomalies AND lapse risks, say so.
4. ALWAYS give a concrete, time-bound recommendation a finance officer can act on today.
5. NEVER use bullet points — write in clear, flowing prose.
6. NEVER hedge with "it appears" or "it seems" — if the data says it, state it confidently.
7. When asked about a specific entity (Varanasi, Health dept), pull everything known about it.
8. Answer in 4-6 sentences. Brevity signals expertise. Verbosity signals confusion.
9. Use Indian financial terminology naturally: crore, lakh, scheme-wise, lapse, reappropriation.
10. If the data shows something alarming, say it is alarming. Don't soften it.

CROSS-ENGINE SYNTHESIS (CRITICAL)
When you have data from multiple engines, synthesize them:
- "The Health department in Varanasi is flagged in three separate systems: z-score engine 
  shows utilization 5.2σ below national peers, the lapse projector shows 74% lapse risk 
  by March, and the fund flow graph shows a 0.62 absorption ratio on the District→Dept edge.
  This convergence across three detection methods makes this a HIGH-CONFIDENCE finding."

This cross-engine convergence is the platform's core value. Always highlight it when present."""


# ─────────────────────────────────────────────────────────────────────────────
# INTENT CLASSIFICATION — semantic, not just keyword
# ─────────────────────────────────────────────────────────────────────────────

INTENT_PATTERNS = {
    "specific_entity": [
        r"\b(varanasi|pune|nagpur|lucknow|jaipur|bhopal|nashik|aurangabad|kota|gwalior|hubli|mysuru|bengaluru|kolhapur|solapur)\b",
        r"\b(health|education|agriculture|infrastructure|water supply|social welfare|rural development|urban development)\b",
        r"\b(maharashtra|uttar pradesh|rajasthan|madhya pradesh|karnataka)\b",
    ],
    "anomaly": [
        r"\banom", r"\babnormal", r"\bspike", r"\bunusual", r"\bflagged", r"\balert",
        r"\bz.?score", r"\boutlier", r"\bdetect", r"\bcritical", r"\bwarning",
    ],
    "leakage": [
        r"\bleak", r"\bdivert", r"\bmissing", r"\bgap", r"\blost", r"\babsorpt",
        r"\bdisappear", r"\btransit", r"\bsyphon", r"\bfund flow", r"\bedge",
    ],
    "lapse": [
        r"\blapse", r"\bunspent", r"\bunderutil", r"\bmarch rush", r"\bflatline",
        r"\bfiscal year", r"\byear.?end", r"\brisk", r"\bproject", r"\bforecast",
    ],
    "action": [
        r"\baction", r"\bapprove", r"\btransfer", r"\brecommend", r"\bwhat should",
        r"\bdo (today|now|next)", r"\bpriority", r"\burgent", r"\bqueue",
    ],
    "overview": [
        r"\boverall", r"\bsummary", r"\bhow (is|are|many)", r"\bhealth", r"\bstatus",
        r"\btotal", r"\bnational", r"\bbig picture", r"\btoday",
    ],
}


def _classify_intent(question: str) -> tuple[str, dict]:
    """
    Returns (primary_intent, entity_filters).
    Detects named entities (districts, departments, states) for targeted queries.
    """
    q = question.lower()

    # Extract named entities first
    entities = {}

    districts = {
        "varanasi": "Uttar Pradesh", "pune": "Maharashtra", "nagpur": "Maharashtra",
        "lucknow": "Uttar Pradesh", "jaipur": "Rajasthan", "bhopal": "Madhya Pradesh",
        "nashik": "Maharashtra", "aurangabad": "Maharashtra", "kota": "Rajasthan",
        "gwalior": "Madhya Pradesh", "hubli": "Karnataka", "mysuru": "Karnataka",
        "bengaluru": "Karnataka", "kolhapur": "Maharashtra", "solapur": "Maharashtra",
    }
    for district, state in districts.items():
        if district in q:
            entities["district"] = district.title()
            entities["state"]    = state
            break

    departments = ["health", "education", "agriculture", "infrastructure",
                   "water supply", "social welfare", "rural development", "urban development"]
    for dept in departments:
        if dept in q:
            entities["department"] = dept.title()
            break

    states = {
        "maharashtra": "Maharashtra", "uttar pradesh": "Uttar Pradesh",
        "rajasthan": "Rajasthan", "madhya pradesh": "Madhya Pradesh",
        "karnataka": "Karnataka",
    }
    for s_key, s_val in states.items():
        if s_key in q:
            entities["state"] = s_val
            break

    # Score intents
    scores = {intent: 0 for intent in INTENT_PATTERNS}
    for intent, patterns in INTENT_PATTERNS.items():
        for p in patterns:
            if re.search(p, q):
                scores[intent] += 1

    # Named entity queries always need a full cross-engine lookup
    if entities.get("district") or entities.get("department"):
        scores["specific_entity"] += 3

    best = max(scores, key=scores.get)
    primary = best if scores[best] > 0 else "overview"

    return primary, entities


# ─────────────────────────────────────────────────────────────────────────────
# CONTEXT ASSEMBLER — pulls data from ALL relevant engines
# Returns a rich, typed context dict for Groq
# ─────────────────────────────────────────────────────────────────────────────

def _assemble_context(
    intent:  str,
    entities: dict,
    year:    int,
    month:   int,
) -> dict[str, Any]:
    """
    Runs ALL relevant engine calls based on intent + entities.
    Returns structured context ready for Groq.

    Key insight: for specific entity queries, we cross all 4 engines
    to build a 360° picture of that entity across detection systems.
    """
    ctx = {"intent": intent, "entities": entities, "year": year, "month": month}

    # ── Import engines ────────────────────────────────────────────────────────
    try:
        from engines.zscore_engine import get_anomalies, get_anomaly_summary
        has_zscore = True
    except Exception:
        has_zscore = False

    try:
        from engines.graph_engine import get_leakage_edges, get_flow_summary
        has_graph = True
    except Exception:
        has_graph = False

    try:
        from engines.pattern_classifier import get_pattern_lapse_risks, get_pattern_summary
        has_pattern = True
    except Exception:
        has_pattern = False

    try:
        from engines.action_queue import generate_action_queue, get_queue_summary
        has_actions = True
    except Exception:
        has_actions = False

    try:
        from engines.lapse_projector import get_lapse_risks
        has_lapse = True
    except Exception:
        has_lapse = False

    state  = entities.get("state")
    dept   = entities.get("department")
    district = entities.get("district")

    # ── SPECIFIC ENTITY: pull everything about it across all engines ──────────
    if intent == "specific_entity" or (district or dept):
        ctx["query_type"] = "entity_deep_dive"

        if has_zscore:
            try:
                anomalies = get_anomalies(year=year, state=state, limit=50)
                # Filter to entity
                entity_anomalies = [
                    a for a in anomalies
                    if (not district or a.get("district", "").lower() == district.lower())
                    and (not dept or a.get("department", "").lower() == dept.lower())
                ]
                ctx["entity_anomalies"]  = entity_anomalies[:5]
                ctx["anomaly_summary"]   = get_anomaly_summary(year=year)
            except Exception as e:
                logger.warning(f"zscore engine failed: {e}")

        if has_graph:
            try:
                leakage = get_leakage_edges(year=year, state=state)
                entity_leakage = [
                    l for l in leakage
                    if (not district or district.lower() in str(l.get("to_entity","")).lower()
                                     or district.lower() in str(l.get("from_entity","")).lower())
                ]
                ctx["entity_leakage"] = entity_leakage[:5]
                ctx["flow_summary"]   = get_flow_summary(year=year)
            except Exception as e:
                logger.warning(f"graph engine failed: {e}")

        if has_pattern or has_lapse:
            try:
                if has_pattern:
                    lapse = get_pattern_lapse_risks(year=year, as_of_month=month, limit=50)
                else:
                    lapse = get_lapse_risks(year=year, as_of_month=month)
                entity_lapse = [
                    l for l in lapse
                    if (not district or l.get("district", "").lower() == district.lower())
                    and (not dept or l.get("department", "").lower() == dept.lower())
                ]
                ctx["entity_lapse_risks"] = entity_lapse[:5]
            except Exception as e:
                logger.warning(f"lapse engine failed: {e}")

        if has_actions:
            try:
                actions = generate_action_queue(year=year, as_of_month=month)
                entity_actions = [
                    a for a in actions
                    if (not district or a.get("detection", {}).get("district", "").lower() == district.lower())
                    and (not dept or a.get("detection", {}).get("department", "").lower() == dept.lower())
                ]
                ctx["entity_actions"] = entity_actions[:3]
            except Exception as e:
                logger.warning(f"action engine failed: {e}")

        return ctx

    # ── ANOMALY INTENT ────────────────────────────────────────────────────────
    if intent == "anomaly":
        ctx["query_type"] = "anomaly_analysis"
        if has_zscore:
            try:
                ctx["top_anomalies"]   = get_anomalies(year=year, state=state, severity="CRITICAL", limit=5)
                ctx["anomaly_summary"] = get_anomaly_summary(year=year)
            except Exception as e:
                logger.warning(f"zscore engine failed: {e}")
        return ctx

    # ── LEAKAGE INTENT ────────────────────────────────────────────────────────
    if intent == "leakage":
        ctx["query_type"] = "leakage_analysis"
        if has_graph:
            try:
                ctx["leakage_edges"] = get_leakage_edges(year=year, state=state, min_score=1)[:8]
                ctx["flow_summary"]  = get_flow_summary(year=year)
            except Exception as e:
                logger.warning(f"graph engine failed: {e}")
        return ctx

    # ── LAPSE INTENT ─────────────────────────────────────────────────────────
    if intent == "lapse":
        ctx["query_type"] = "lapse_analysis"
        if has_pattern:
            try:
                ctx["high_risk_depts"] = get_pattern_lapse_risks(year=year, as_of_month=month, limit=8)
                ctx["pattern_summary"] = get_pattern_summary(year=year, as_of_month=month)
            except Exception as e:
                logger.warning(f"pattern engine failed: {e}")
        elif has_lapse:
            try:
                lapse = get_lapse_risks(year=year, as_of_month=month)
                ctx["high_risk_depts"] = [l for l in lapse if l.get("risk_tier") == "HIGH"][:8]
            except Exception as e:
                logger.warning(f"lapse engine failed: {e}")
        return ctx

    # ── ACTION INTENT ─────────────────────────────────────────────────────────
    if intent == "action":
        ctx["query_type"] = "action_analysis"
        if has_actions:
            try:
                actions = generate_action_queue(year=year, as_of_month=month)
                ctx["pending_actions"] = [
                    a for a in actions if a.get("status") == "DRAFT"
                ][:5]
                ctx["queue_summary"] = get_queue_summary(year=year, as_of_month=month)
            except Exception as e:
                logger.warning(f"action engine failed: {e}")
        return ctx

    # ── OVERVIEW — pull a cross-section from all engines ─────────────────────
    ctx["query_type"] = "overview"
    if has_zscore:
        try:
            ctx["anomaly_summary"] = get_anomaly_summary(year=year)
        except Exception:
            pass
    if has_graph:
        try:
            ctx["flow_summary"] = get_flow_summary(year=year)
        except Exception:
            pass
    if has_pattern:
        try:
            ctx["pattern_summary"] = get_pattern_summary(year=year, as_of_month=month)
        except Exception:
            pass
    if has_actions:
        try:
            ctx["queue_summary"] = get_queue_summary(year=year, as_of_month=month)
        except Exception:
            pass

    return ctx


# ─────────────────────────────────────────────────────────────────────────────
# GROQ CALL
# ─────────────────────────────────────────────────────────────────────────────

def _call_groq_qa(
    question:     str,
    context:      dict,
    chat_history: list[dict],
    max_tokens:   int = 600,
) -> str:
    client = _get_client()

    # Build conversation messages
    messages = [{"role": "system", "content": COPILOT_SYSTEM_PROMPT}]

    # Add recent chat history (last 3 turns = 6 messages)
    if chat_history:
        for msg in chat_history[-6:]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

    # Truncate context to stay within token budget
    context_str = json.dumps(context, default=str, indent=2)
    if len(context_str) > 4000:
        # Trim large lists
        trimmed = {}
        for k, v in context.items():
            if isinstance(v, list) and len(v) > 3:
                trimmed[k] = v[:3]
            else:
                trimmed[k] = v
        context_str = json.dumps(trimmed, default=str, indent=2)[:4000]

    user_msg = f"""QUESTION: {question}

ENGINE DATA (these numbers come directly from analytics engines — they are accurate):
{context_str}

Based on this data, answer the question as a senior finance analyst would.
If entities appear in multiple engines (anomaly + lapse + leakage), highlight that convergence — it means HIGH confidence.
Be specific. Name departments, districts, and crore amounts. Give one actionable recommendation."""

    messages.append({"role": "user", "content": user_msg})

    response = client.chat.completions.create(
        model      = GROQ_MODEL,
        max_tokens = max_tokens,
        temperature= 0.25,   # Low temp = consistent, factual answers
        messages   = messages,
    )
    return response.choices[0].message.content.strip()


def _get_client() -> Groq:
    return Groq(api_key=GROQ_API_KEY)


# ─────────────────────────────────────────────────────────────────────────────
# RULE FALLBACK — intelligent, not generic
# Uses actual context data, not canned sentences
# ─────────────────────────────────────────────────────────────────────────────

def _rule_answer_from_context(question: str, intent: str, context: dict) -> str:
    """
    Rule-based answer that actually uses the assembled context.
    Much better than the keyword-matched templates.
    """
    parts = []
    q_type = context.get("query_type", "overview")

    # Entity deep-dive
    if q_type == "entity_deep_dive":
        entities = context.get("entities", {})
        name = entities.get("district") or entities.get("department") or "this entity"

        anomalies = context.get("entity_anomalies", [])
        lapse     = context.get("entity_lapse_risks", [])
        leakage   = context.get("entity_leakage", [])
        actions   = context.get("entity_actions", [])

        signals = []
        if anomalies:
            top = anomalies[0]
            signals.append(
                f"z-score anomaly engine flags {top.get('department','?')} in {top.get('district','?')} "
                f"at {top.get('utilization_rate',0):.1f}% utilization "
                f"({abs(top.get('z_score',0)):.1f}σ from national peer mean of {top.get('peer_mean',0):.1f}%) "
                f"— classified {top.get('severity','?')}"
            )
        if lapse:
            top = lapse[0]
            signals.append(
                f"lapse projector shows {top.get('lapse_risk_pct',0):.1f}% projected lapse risk "
                f"by March ({top.get('pattern','?')} pattern"
                f"{', ₹' + str(round(top.get('projected_unspent',0)/1e5,1)) + 'L unspent' if top.get('projected_unspent') else ''})"
            )
        if leakage:
            top = leakage[0]
            signals.append(
                f"fund flow graph shows absorption ratio {top.get('absorption_ratio',0):.2f} "
                f"on the {top.get('from_level','?')}→{top.get('to_level','?')} edge "
                f"(threshold: 0.85)"
            )

        if signals:
            count = len(signals)
            conf  = "HIGH-CONFIDENCE" if count >= 2 else "flagged"
            parts.append(
                f"{name} is a {conf} finding — detected across {count} independent engine{'s' if count > 1 else ''}: "
                + "; ".join(signals) + "."
            )
            if actions:
                a = actions[0]
                rec = a.get("recommendation", {})
                parts.append(
                    f"The Action Queue has a pre-computed transfer order: move ₹{rec.get('transfer_lakh',0):.1f}L "
                    f"from {rec.get('from_department','?')} to {rec.get('to_department','?')} "
                    f"— confidence score {a.get('confidence',{}).get('confidence_score',0)}/100."
                )
            else:
                parts.append(f"Review the Action Queue for pre-justified transfer orders related to {name}.")
        else:
            parts.append(f"No significant anomalies found for {name} in the current data. The system appears normal for this entity.")

    elif intent == "anomaly":
        summary = context.get("anomaly_summary", {})
        top = (context.get("top_anomalies") or [])
        parts.append(
            f"The anomaly detection engine has identified {summary.get('total_anomalies',0)} anomalies "
            f"— {summary.get('critical_count',0)} CRITICAL and {summary.get('warning_count',0)} WARNING "
            f"— affecting ₹{summary.get('exposed_budget_cr',0)}Cr across "
            f"{summary.get('states_affected',0)} states."
        )
        if top:
            t = top[0]
            parts.append(
                f"The most severe: {t.get('department','?')} in {t.get('district','?')}, {t.get('state','?')} "
                f"at {t.get('utilization_rate',0):.1f}% utilization "
                f"({abs(t.get('z_score',0)):.1f}σ below peer mean of {t.get('peer_mean',0):.1f}%)."
            )

    elif intent == "leakage":
        fs = context.get("flow_summary", {})
        edges = context.get("leakage_edges", [])
        parts.append(
            f"Fund flow analysis shows ₹{fs.get('total_gap_cr',0)}Cr in transit gaps "
            f"across {fs.get('leakage_edge_count',0)} flagged edges "
            f"(absorption ratio < 0.85). Overall absorption is {fs.get('overall_absorption_pct',0):.1f}%."
        )
        if edges:
            e = edges[0]
            parts.append(
                f"Worst leakage: {e.get('from_entity','?')} → {e.get('to_entity','?')} "
                f"in {e.get('state','?')}, absorption ratio {e.get('absorption_ratio',0):.2f} "
                f"(gap: ₹{round(e.get('gap_amount',0)/1e5,1)}L)."
            )

    elif intent == "lapse":
        ps = context.get("pattern_summary", {})
        top = (context.get("high_risk_depts") or [])
        parts.append(
            f"Lapse risk analysis: {ps.get('high_risk_count',0)} departments at HIGH risk "
            f"with ₹{ps.get('projected_lapse_cr',0)}Cr projected unspent by March. "
            f"{ps.get('flatline_count',0)} show flatline and {ps.get('march_rush_count',0)} show March Rush patterns."
        )
        if top:
            t = top[0]
            parts.append(
                f"Highest risk: {t.get('department','?')} in {t.get('district','?')}, {t.get('state','?')} "
                f"— {t.get('lapse_risk_pct',0):.1f}% lapse risk, {t.get('pattern','?')} pattern."
            )

    elif intent == "action":
        qs = context.get("queue_summary", {})
        actions = context.get("pending_actions", [])
        parts.append(
            f"The Action Queue has {qs.get('draft_count',0)} pending decisions, "
            f"{qs.get('immediate_count',0)} marked IMMEDIATE. "
            f"Total transferable: ₹{qs.get('total_transferable_cr',0)}Cr."
        )
        if actions:
            a = actions[0]
            rec = a.get("recommendation", {})
            parts.append(
                f"Top priority: transfer ₹{rec.get('transfer_lakh',0):.1f}L from "
                f"{rec.get('from_district','?')}/{rec.get('from_department','?')} "
                f"to {rec.get('to_district','?')}/{rec.get('to_department','?')} "
                f"— {a.get('confidence',{}).get('confidence_score',0)}/100 confidence."
            )

    else:  # overview
        summary   = context.get("anomaly_summary", {})
        flow      = context.get("flow_summary", {})
        pattern   = context.get("pattern_summary", {})
        queue     = context.get("queue_summary", {})
        parts.append(
            f"System overview for FY{context.get('year',2024)} Month {context.get('month',8)}: "
            f"{summary.get('critical_count',0)} CRITICAL anomalies, "
            f"₹{flow.get('total_gap_cr',0)}Cr in leakage gaps, "
            f"{pattern.get('high_risk_count',0)} departments at high lapse risk, "
            f"{queue.get('draft_count',0)} actions awaiting your decision."
        )

    return " ".join(parts) if parts else "I don't have sufficient data to answer that question. Please check the dashboard engines are running correctly."


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC API: answer_question
# ─────────────────────────────────────────────────────────────────────────────

def answer_question(
    question:     str,
    year:         int = DEFAULT_YEAR,
    as_of_month:  int = DEFAULT_MONTH,
    chat_history: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Main copilot Q&A entry point.

    1. Classify intent + extract named entities
    2. Pull data from ALL relevant engines (cross-engine context)
    3. Call Groq with rich context + strong system prompt
    4. Return answer + metadata
    """
    intent, entities = _classify_intent(question)

    context = _assemble_context(
        intent=intent,
        entities=entities,
        year=year,
        month=as_of_month,
    )

    rule_answer = _rule_answer_from_context(question, intent, context)

    if not GROQ_API_KEY:
        return {
            "answer":       rule_answer,
            "intent":       intent,
            "entities":     entities,
            "tools_used":   list(context.keys()),
            "source":       "rule",
        }

    try:
        answer = _call_groq_qa(
            question     = question,
            context      = context,
            chat_history = chat_history or [],
        )
        return {
            "answer":     answer,
            "intent":     intent,
            "entities":   entities,
            "tools_used": list(context.keys()),
            "source":     "groq",
        }
    except Exception as e:
        logger.warning(f"Groq copilot failed, using contextual rule fallback: {e}")
        return {
            "answer":     rule_answer,
            "intent":     intent,
            "entities":   entities,
            "tools_used": list(context.keys()),
            "source":     "rule",
        }


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC API: generate_narrative_digest
# ─────────────────────────────────────────────────────────────────────────────

def generate_narrative_digest(
    delta:        dict,
    lapse_risks:  list[dict],
    anomalies:    list[dict],
    flow_summary: dict,
    year:         int = DEFAULT_YEAR,
    as_of_month:  int = DEFAULT_MONTH,
) -> dict[str, Any]:
    """
    Pre-generates the morning briefing card for the dashboard.
    Called at startup. Served cached.
    """

    # Build a richer context for the digest
    critical_anomalies = [a for a in anomalies if a.get("severity") == "CRITICAL"]
    high_lapse         = [l for l in lapse_risks if l.get("risk_tier") == "HIGH"]

    # Cross-reference: districts appearing in BOTH anomalies AND lapse risks
    anomaly_districts = {a.get("district","").lower() for a in critical_anomalies}
    lapse_districts   = {l.get("district","").lower() for l in high_lapse}
    convergence       = anomaly_districts & lapse_districts  # in both systems

    context = {
        "fiscal_year":         year,
        "as_of_month":         as_of_month,
        "critical_anomalies":  len(critical_anomalies),
        "high_lapse_depts":    len(high_lapse),
        "projected_lapse_cr":  round(sum(l.get("projected_unspent", 0) for l in high_lapse) / 1e7, 1),
        "total_gap_cr":        flow_summary.get("total_gap_cr", 0),
        "leakage_edges":       flow_summary.get("leakage_edge_count", 0),
        "new_this_cycle":      delta.get("summary", {}).get("new_anomaly_count", 0),
        "worsening":           delta.get("summary", {}).get("worsened_count", 0),
        "cross_engine_alerts": list(convergence),  # districts flagged by multiple engines
        "top_anomaly": (
            {
                "dept":     critical_anomalies[0].get("department"),
                "district": critical_anomalies[0].get("district"),
                "state":    critical_anomalies[0].get("state"),
                "util_pct": round(critical_anomalies[0].get("utilization_rate", 0), 1),
                "z_score":  round(critical_anomalies[0].get("z_score", 0), 2),
                "peer_pct": round(critical_anomalies[0].get("peer_mean", 0), 1),
            }
            if critical_anomalies else None
        ),
        "top_lapse": (
            {
                "dept":      high_lapse[0].get("department"),
                "district":  high_lapse[0].get("district"),
                "risk_pct":  high_lapse[0].get("lapse_risk_pct", 0),
                "pattern":   high_lapse[0].get("pattern", "?"),
                "unspent_l": round(high_lapse[0].get("projected_unspent", 0) / 1e5, 1),
            }
            if high_lapse else None
        ),
    }

    tone = (
        "URGENT"   if len(critical_anomalies) > 5 or len(convergence) > 0 else
        "WATCHFUL" if len(high_lapse) > 3 or context["new_this_cycle"] > 2 else
        "STABLE"
    )

    fallback = _rule_digest_from_context(context, tone)

    if not GROQ_API_KEY:
        return {**fallback, "source": "rule"}

    try:
        prompt = f"""Write a morning fiscal briefing for Month {as_of_month} of FY{year}.

Data from analytics engines:
{json.dumps(context, indent=2)}

IMPORTANT: If cross_engine_alerts has districts in it, lead with that — it means multiple detection
systems have flagged the same location, which is a HIGH-CONFIDENCE finding.

Return ONLY a JSON object with these exact keys:
{{
  "headline": "one urgent sentence naming the worst finding with actual numbers",
  "body": "2-3 sentences covering the key risks. Be specific about departments and amounts.",
  "action_today": "one concrete action for the Finance Secretary today, naming the specific item",
  "tone": "{tone}"
}}
No markdown. No extra text. Pure JSON only."""

        client  = _get_client()
        response = client.chat.completions.create(
            model      = GROQ_MODEL,
            max_tokens = 350,
            temperature= 0.2,
            messages   = [
                {"role": "system", "content": COPILOT_SYSTEM_PROMPT},
                {"role": "user",   "content": prompt},
            ],
        )
        raw    = re.sub(r"```json|```", "", response.choices[0].message.content.strip())
        parsed = json.loads(raw)
        return {
            "headline":     parsed.get("headline", fallback["headline"]),
            "body":         parsed.get("body",     fallback["body"]),
            "action_today": parsed.get("action_today", fallback["action_today"]),
            "tone":         parsed.get("tone",     tone),
            "source":       "groq",
        }
    except Exception as e:
        logger.warning(f"Groq digest failed: {e}")
        return {**fallback, "source": "rule"}


def _rule_digest_from_context(ctx: dict, tone: str) -> dict:
    convergence = ctx.get("cross_engine_alerts", [])
    top_a = ctx.get("top_anomaly")
    top_l = ctx.get("top_lapse")

    headline = (
        f"MULTI-ENGINE ALERT: {', '.join(c.title() for c in convergence[:2])} "
        f"flagged by both anomaly and lapse detectors — immediate review required."
        if convergence else
        f"{ctx['critical_anomalies']} CRITICAL anomalies detected with ₹{ctx['projected_lapse_cr']}Cr "
        f"projected unspent across {ctx['high_lapse_depts']} high-risk departments."
    )

    body_parts = []
    if top_a:
        body_parts.append(
            f"{top_a['dept']} in {top_a['district']} shows {top_a['util_pct']}% utilization "
            f"({abs(top_a['z_score']):.1f}σ below national peer mean of {top_a['peer_pct']}%)."
        )
    if top_l:
        body_parts.append(
            f"{top_l['dept']} in {top_l['district']} has {top_l['risk_pct']:.1f}% lapse risk "
            f"(₹{top_l['unspent_l']}L projected unspent, {top_l['pattern']} pattern)."
        )
    body_parts.append(
        f"Fund flow analysis shows ₹{ctx['total_gap_cr']}Cr in transit gaps across "
        f"{ctx['leakage_edges']} flagged administrative edges."
    )

    return {
        "headline":     headline,
        "body":         " ".join(body_parts),
        "action_today": f"Open the Action Queue — {ctx['high_lapse_depts']} pre-justified transfer orders "
                        f"await your approval before the intervention window closes.",
        "tone":         tone,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Session wrapper (stateless — history passed from frontend via Zustand)
# ─────────────────────────────────────────────────────────────────────────────

class CopilotSession:
    def __init__(self):
        self.history: list[dict] = []

    def chat(self, message: str, year: int = DEFAULT_YEAR, as_of_month: int = DEFAULT_MONTH) -> dict:
        result = answer_question(
            question     = message,
            year         = year,
            as_of_month  = as_of_month,
            chat_history = self.history,
        )
        self.history.append({"role": "user",      "content": message})
        self.history.append({"role": "assistant",  "content": result["answer"]})
        if len(self.history) > 20:
            self.history = self.history[-20:]
        return result