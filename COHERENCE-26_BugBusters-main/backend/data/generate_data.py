"""
generate_data.py
Generates two production-quality simulated datasets:
  - fund_releases.csv  : Administrative fund flow (Centre → State → District → Dept)
  - expenditures.csv   : Department-level monthly spending records

Patterns deliberately baked in:
  - 3 leakage edges (amount_received < 85% of amount_released)
  - March Rush spike in months 11–12 for 3 departments
  - 2 flat-line departments (near-zero absorption months 4–8)
  - 1 clean healthy district (control group)
  - Seasonal ramp-up pattern for normal departments
"""

import pandas as pd
import numpy as np
import os
import uuid
from datetime import date

np.random.seed(42)

# ── Constants ────────────────────────────────────────────────────────────────

STATES = ["Maharashtra", "Rajasthan", "Uttar Pradesh", "Karnataka", "Madhya Pradesh"]

DISTRICTS = {
    "Maharashtra": ["Pune", "Nagpur", "Nashik", "Aurangabad"],
    "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota"],
    "Uttar Pradesh": ["Lucknow", "Varanasi", "Agra", "Kanpur"],
    "Karnataka": ["Bengaluru", "Mysuru", "Hubli", "Mangaluru"],
    "Madhya Pradesh": ["Bhopal", "Indore", "Gwalior", "Jabalpur"],
}

DEPARTMENTS = [
    "Health", "Education", "Agriculture",
    "Infrastructure", "Water Supply", "Social Welfare",
    "Rural Development", "Urban Development"
]

SCHEMES = [
    "PM-KISAN", "PMGSY", "NHM", "SSA", "MGNREGS",
    "PMAY", "Jal Jeevan Mission", "POSHAN Abhiyaan"
]

LEVELS = ["Centre", "State", "District", "Department"]

YEARS = [2022, 2023, 2024]

# ── Leakage configuration (deliberately injected) ────────────────────────────

LEAKAGE_EDGES = [
    {"state": "Uttar Pradesh", "district": "Varanasi",   "department": "Health",          "leakage_pct": 0.31},
    {"state": "Rajasthan",     "district": "Kota",       "department": "Social Welfare",  "leakage_pct": 0.22},
    {"state": "Madhya Pradesh","district": "Gwalior",    "department": "Rural Development","leakage_pct": 0.18},
]

FLATLINE_DEPTS = [
    {"state": "Karnataka",     "district": "Hubli",      "department": "Water Supply"},
    {"state": "Maharashtra",   "district": "Aurangabad", "department": "Urban Development"},
]

MARCH_RUSH_DEPTS = [
    {"state": "Rajasthan",     "district": "Jaipur",     "department": "Agriculture"},
    {"state": "Uttar Pradesh", "district": "Lucknow",    "department": "Education"},
    {"state": "Madhya Pradesh","district": "Bhopal",     "department": "Infrastructure"},
]

HEALTHY_DISTRICT = {"state": "Maharashtra", "district": "Pune"}


# ── Absorption curve helpers ─────────────────────────────────────────────────

def normal_absorption(month: int) -> float:
    """Smooth S-curve absorption — typical healthy government spending."""
    base = 0.04 + (month / 12) * 0.70
    noise = np.random.uniform(-0.03, 0.03)
    return min(max(base + noise, 0.02), 0.95)


def march_rush_absorption(month: int) -> float:
    """Low utilization until month 10, then panic spend in 11–12."""
    if month <= 10:
        base = 0.02 + (month / 10) * 0.25
        return base + np.random.uniform(-0.01, 0.02)
    else:
        return 0.35 + (month - 10) * 0.28 + np.random.uniform(-0.02, 0.04)


def flatline_absorption(month: int) -> float:
    """Near-zero absorption — procurement/administrative freeze."""
    base = 0.01 + month * 0.008
    return min(base + np.random.uniform(0, 0.01), 0.15)


def healthy_absorption(month: int) -> float:
    """Ideal absorption — clean control group."""
    base = 0.06 + (month / 12) * 0.82
    noise = np.random.uniform(-0.01, 0.01)
    return min(max(base + noise, 0.05), 0.98)


# ── Fund Releases Generator ───────────────────────────────────────────────────

def generate_fund_releases() -> pd.DataFrame:
    records = []

    for year in YEARS:
        for state in STATES:
            for district in DISTRICTS[state]:
                for dept in DEPARTMENTS:
                    for month in range(1, 13):
                        scheme = np.random.choice(SCHEMES)
                        base_allocation = np.random.randint(50, 500) * 100_000  # ₹ in units

                        # Centre → State
                        state_received = base_allocation * np.random.uniform(0.95, 0.99)
                        records.append({
                            "release_id":       str(uuid.uuid4())[:12],
                            "year":             year,
                            "month":            month,
                            "state":            state,
                            "district":         district,
                            "department":       dept,
                            "scheme":           scheme,
                            "from_level":       "Centre",
                            "to_level":         "State",
                            "from_entity":      "Central Government",
                            "to_entity":        f"{state} Government",
                            "amount_released":  round(base_allocation, 2),
                            "amount_received":  round(state_received, 2),
                        })

                        # State → District
                        dist_received = state_received * np.random.uniform(0.93, 0.98)

                        # Inject leakage at State → District level
                        for leak in LEAKAGE_EDGES:
                            if leak["state"] == state and leak["district"] == district and leak["department"] == dept:
                                dist_received = state_received * (1 - leak["leakage_pct"]) * np.random.uniform(0.97, 1.0)
                                break

                        records.append({
                            "release_id":       str(uuid.uuid4())[:12],
                            "year":             year,
                            "month":            month,
                            "state":            state,
                            "district":         district,
                            "department":       dept,
                            "scheme":           scheme,
                            "from_level":       "State",
                            "to_level":         "District",
                            "from_entity":      f"{state} Government",
                            "to_entity":        f"{district} District",
                            "amount_released":  round(state_received, 2),
                            "amount_received":  round(dist_received, 2),
                        })

                        # District → Department
                        dept_received = dist_received * np.random.uniform(0.96, 1.0)
                        records.append({
                            "release_id":       str(uuid.uuid4())[:12],
                            "year":             year,
                            "month":            month,
                            "state":            state,
                            "district":         district,
                            "department":       dept,
                            "scheme":           scheme,
                            "from_level":       "District",
                            "to_level":         "Department",
                            "from_entity":      f"{district} District",
                            "to_entity":        f"{dept} Dept - {district}",
                            "amount_released":  round(dist_received, 2),
                            "amount_received":  round(dept_received, 2),
                        })

    df = pd.DataFrame(records)
    df["absorption_ratio"] = (df["amount_received"] / df["amount_released"]).round(4)
    df["gap_amount"]        = (df["amount_released"] - df["amount_received"]).round(2)
    return df


# ── Expenditures Generator ────────────────────────────────────────────────────

def generate_expenditures() -> pd.DataFrame:
    records = []
    exp_id = 1

    for year in YEARS:
        for state in STATES:
            for district in DISTRICTS[state]:
                for dept in DEPARTMENTS:
                    scheme = np.random.choice(SCHEMES)
                    annual_budget = np.random.randint(200, 2000) * 100_000

                    for month in range(1, 13):
                        key = {"state": state, "district": district, "department": dept}

                        # Determine which pattern this dept follows
                        is_flatline    = any(f["state"] == state and f["district"] == district and f["department"] == dept for f in FLATLINE_DEPTS)
                        is_march_rush  = any(m["state"] == state and m["district"] == district and m["department"] == dept for m in MARCH_RUSH_DEPTS)
                        is_healthy     = (state == HEALTHY_DISTRICT["state"] and district == HEALTHY_DISTRICT["district"])

                        if is_flatline:
                            cumulative_rate = flatline_absorption(month)
                        elif is_march_rush:
                            cumulative_rate = march_rush_absorption(month)
                        elif is_healthy:
                            cumulative_rate = healthy_absorption(month)
                        else:
                            cumulative_rate = normal_absorption(month)

                        # Monthly spend = delta from previous month
                        prev_rate = 0 if month == 1 else (
                            flatline_absorption(month - 1)   if is_flatline else
                            march_rush_absorption(month - 1) if is_march_rush else
                            healthy_absorption(month - 1)    if is_healthy else
                            normal_absorption(month - 1)
                        )

                        monthly_rate   = max(cumulative_rate - prev_rate, 0)
                        amount_spent   = round(annual_budget * monthly_rate, 2)
                        utilization    = round(cumulative_rate * 100, 2)
                        project_count  = np.random.randint(2, 25)

                        records.append({
                            "exp_id":            exp_id,
                            "year":              year,
                            "month":             month,
                            "state":             state,
                            "district":          district,
                            "department":        dept,
                            "scheme":            scheme,
                            "budget_allocated":  annual_budget,
                            "amount_spent":      amount_spent,
                            "cumulative_rate":   cumulative_rate,
                            "utilization_rate":  utilization,
                            "project_count":     project_count,
                            "pattern_type": (
                                "flatline"   if is_flatline else
                                "march_rush" if is_march_rush else
                                "healthy"    if is_healthy else
                                "normal"
                            )
                        })
                        exp_id += 1

    return pd.DataFrame(records)


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    out_dir = os.path.dirname(os.path.abspath(__file__))

    print("Generating fund_releases.csv ...")
    releases = generate_fund_releases()
    releases.to_csv(os.path.join(out_dir, "fund_releases.csv"), index=False)
    print(f"  → {len(releases):,} rows written")

    print("Generating expenditures.csv ...")
    expenditures = generate_expenditures()
    expenditures.to_csv(os.path.join(out_dir, "expenditures.csv"), index=False)
    print(f"  → {len(expenditures):,} rows written")

    # Quick validation
    leakage_check = releases[releases["absorption_ratio"] < 0.85]
    print(f"\nValidation:")
    print(f"  Leakage edges detected  : {len(leakage_check)}")
    print(f"  Total fund_releases rows: {len(releases):,}")
    print(f"  Total expenditure rows  : {len(expenditures):,}")
    print(f"  Flatline rows           : {len(expenditures[expenditures['pattern_type']=='flatline'])}")
    print(f"  March Rush rows         : {len(expenditures[expenditures['pattern_type']=='march_rush'])}")
    print(f"  Healthy rows            : {len(expenditures[expenditures['pattern_type']=='healthy'])}")
    print("\nDone.")