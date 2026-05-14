"""
cache/snapshot_manager.py

Two-layer caching strategy:

LAYER 1 — In-memory (lru_cache on engines)
  → Survives within a single server session
  → Sub-millisecond repeat calls
  → Cleared only on server restart

LAYER 2 — File-based snapshot (snapshot.json)
  → Survives server restarts
  → Enables delta detection: "what changed since last run?"
  → Written once per data load, read on every startup

Delta intelligence:
  → Compares current engine output against last snapshot
  → Produces a changelog: new anomalies, resolved risks, worsened depts
  → This is what powers the Daily Digest and Action Queue freshness
"""

from __future__ import annotations

import json
import os
import hashlib
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

CACHE_DIR      = os.path.dirname(__file__)
SNAPSHOT_FILE  = os.path.join(CACHE_DIR, "snapshot.json")
ACTIONS_FILE   = os.path.join(CACHE_DIR, "actions.json")


# ── Snapshot read / write ─────────────────────────────────────────────────────

def load_snapshot() -> dict[str, Any]:
    """Load last saved snapshot. Returns empty dict if none exists."""
    try:
        with open(SNAPSHOT_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_snapshot(data: dict[str, Any]) -> None:
    """Persist current system state as snapshot with timestamp."""
    data["_saved_at"] = datetime.now(timezone.utc).isoformat()
    data["_version"]  = _hash_snapshot(data)
    with open(SNAPSHOT_FILE, "w") as f:
        json.dump(data, f, indent=2, default=str)
    logger.info(f"Snapshot saved: {data['_version'][:8]}")


def _hash_snapshot(data: dict) -> str:
    raw = json.dumps(data, sort_keys=True, default=str)
    return hashlib.md5(raw.encode()).hexdigest()


# ── Delta engine ──────────────────────────────────────────────────────────────

def compute_delta(
    current_anomalies:  list[dict],
    current_lapse:      list[dict],
    previous_snapshot:  dict,
) -> dict[str, Any]:
    """
    Compares current engine outputs against previous snapshot.
    Returns a structured changelog used by Daily Digest and Action Queue.
    """
    prev_anomalies = {
        _anomaly_key(a): a
        for a in previous_snapshot.get("anomalies", [])
    }
    prev_lapse = {
        _lapse_key(l): l
        for l in previous_snapshot.get("lapse_risks", [])
    }

    curr_anomaly_keys = {_anomaly_key(a) for a in current_anomalies}
    curr_lapse_keys   = {_lapse_key(l)   for l in current_lapse}

    # New anomalies that weren't in last snapshot
    new_anomalies = [
        a for a in current_anomalies
        if _anomaly_key(a) not in prev_anomalies
    ]

    # Resolved anomalies (were flagged, now clean)
    resolved_anomalies = [
        a for key, a in prev_anomalies.items()
        if key not in curr_anomaly_keys
    ]

    # Worsened: same dept flagged but z-score increased
    worsened = []
    for a in current_anomalies:
        key = _anomaly_key(a)
        if key in prev_anomalies:
            prev_z = abs(prev_anomalies[key].get("z_score", 0))
            curr_z = abs(a.get("z_score", 0))
            if curr_z > prev_z + 0.3:          # meaningful worsening
                worsened.append({
                    **a,
                    "prev_z_score":   round(prev_z, 4),
                    "z_score_change": round(curr_z - prev_z, 4),
                })

    # New high-risk lapse
    new_high_lapse = [
        l for l in current_lapse
        if _lapse_key(l) not in prev_lapse
        and l.get("risk_tier") == "HIGH"
    ]

    # Departments that improved out of HIGH risk
    resolved_lapse = [
        l for key, l in prev_lapse.items()
        if key not in curr_lapse_keys
        and l.get("risk_tier") == "HIGH"
    ]

    has_changes = any([new_anomalies, resolved_anomalies, worsened, new_high_lapse])

    return {
        "has_changes":        has_changes,
        "new_anomalies":      new_anomalies,
        "resolved_anomalies": resolved_anomalies,
        "worsened":           worsened,
        "new_high_lapse":     new_high_lapse,
        "resolved_lapse":     resolved_lapse,
        "summary": {
            "new_anomaly_count":     len(new_anomalies),
            "resolved_count":        len(resolved_anomalies),
            "worsened_count":        len(worsened),
            "new_high_lapse_count":  len(new_high_lapse),
        },
    }


def _anomaly_key(a: dict) -> str:
    return f"{a.get('state')}|{a.get('district')}|{a.get('department')}|{a.get('month')}"

def _lapse_key(l: dict) -> str:
    return f"{l.get('state')}|{l.get('district')}|{l.get('department')}"


# ── Action store (persistent action queue) ────────────────────────────────────

def load_actions() -> list[dict]:
    """Load persisted action queue from disk."""
    try:
        with open(ACTIONS_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def save_actions(actions: list[dict]) -> None:
    """Persist action queue to disk."""
    with open(ACTIONS_FILE, "w") as f:
        json.dump(actions, f, indent=2, default=str)


def upsert_action(action: dict) -> dict:
    """Add or update an action in the persistent store."""
    actions = load_actions()
    existing_ids = {a["action_id"] for a in actions}

    if action["action_id"] in existing_ids:
        actions = [
            action if a["action_id"] == action["action_id"] else a
            for a in actions
        ]
    else:
        actions.append(action)

    save_actions(actions)
    return action


def get_action_by_id(action_id: str) -> dict | None:
    actions = load_actions()
    return next((a for a in actions if a["action_id"] == action_id), None)


def update_action_status(action_id: str, status: str, officer_note: str = "") -> dict | None:
    """Update status of a specific action: APPROVED | MODIFIED | DISMISSED."""
    actions = load_actions()
    updated = None

    for a in actions:
        if a["action_id"] == action_id:
            a["status"]        = status
            a["officer_note"]  = officer_note
            a["actioned_at"]   = datetime.now(timezone.utc).isoformat()
            updated = a
            break

    if updated:
        save_actions(actions)
    return updated