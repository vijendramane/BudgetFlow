"""
main.py — Final. Phase 2 + Copilot.

Startup sequence:
  1. Warm CSV caches (lru_cache)
  2. Run engines → build current snapshot
  3. Compute delta vs previous snapshot
  4. Pre-generate Action Queue → actions.json
  5. Pre-generate Narrative Digest → served instantly on first load
  6. API ready
"""

import os
import sys
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

sys.path.insert(0, os.path.dirname(__file__))

from routers.overview  import router as overview_router
from routers.flow      import router as flow_router
from routers.anomalies import router as anomalies_router
from routers.forecast  import router as forecast_router
from routers.audit     import router as audit_router
from routers.actions   import router as actions_router
from routers.copilot   import router as copilot_router

logging.basicConfig(
    level  = logging.INFO,
    format = "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

DEFAULT_YEAR  = 2024
DEFAULT_MONTH = 8

_cached_digest: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _cached_digest
    logger.info("=== Budget Flow Intelligence v2 — startup ===")

    try:
        # 1. Warm caches
        from engines.graph_engine       import _load_releases
        from engines.zscore_engine      import _load_expenditures
        _load_releases()
        _load_expenditures()
        logger.info("CSV caches warmed")

        # 2. Run engines
        from engines.zscore_engine      import get_anomalies
        from engines.pattern_classifier import get_pattern_lapse_risks
        from engines.graph_engine       import get_flow_summary
        from cache.snapshot_manager     import load_snapshot, save_snapshot, compute_delta

        anomalies   = get_anomalies(year=DEFAULT_YEAR, limit=100)
        lapse_risks = get_pattern_lapse_risks(year=DEFAULT_YEAR, as_of_month=DEFAULT_MONTH, limit=100)
        flow_sum    = get_flow_summary(year=DEFAULT_YEAR)

        # 3. Delta
        prev_snapshot = load_snapshot()
        delta         = compute_delta(anomalies, lapse_risks, prev_snapshot)
        save_snapshot({"anomalies": anomalies, "lapse_risks": lapse_risks, "flow": flow_sum})
        logger.info(f"Snapshot: {delta['summary']['new_anomaly_count']} new anomalies")

        # 4. Action queue
        from engines.action_queue import generate_action_queue
        actions = generate_action_queue(year=DEFAULT_YEAR, as_of_month=DEFAULT_MONTH)
        logger.info(f"Action queue: {len(actions)} actions")

        # 5. Pre-generate narrative digest
        from engines.Copilot import generate_narrative_digest
        _cached_digest = generate_narrative_digest(
            delta        = delta,
            lapse_risks  = lapse_risks,
            anomalies    = anomalies,
            flow_summary = flow_sum,
            year         = DEFAULT_YEAR,
            as_of_month  = DEFAULT_MONTH,
        )
        logger.info(f"Narrative digest ready (source: {_cached_digest.get('source', 'unknown')})")

    except Exception as e:
        logger.warning(f"Startup failed (run generate_data.py first): {e}")

    logger.info("=== API ready ===")
    yield
    logger.info("Shutdown")


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title       = "Budget Flow Intelligence API",
    description = "National Budget Flow Intelligence & Leakage Detection — v2 with AI Copilot",
    version     = "2.0.0",
    lifespan    = lifespan,
)

# ── CORS ───────────────────────────────────────────────────────────────────────
# Allow localhost for dev + all Vercel deployments for production.
# add_middleware must be called BEFORE include_router.

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",

    # Vercel preview
    "https://coherence-26-bugbuster-og6r0p3u5-saurabhmane2305s-projects.vercel.app",

    # Vercel production (THIS WAS MISSING)
    "https://coherence-26-bugbuster.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ALLOWED_ORIGINS,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────

app.include_router(overview_router)
app.include_router(flow_router)
app.include_router(anomalies_router)
app.include_router(forecast_router)
app.include_router(audit_router)
app.include_router(actions_router)
app.include_router(copilot_router)

# ── System endpoints ───────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
def health():
    return {
        "status":        "ok",
        "version":       "2.0.0",
        "digest_ready":  bool(_cached_digest),
        "digest_source": _cached_digest.get("source", "not_generated"),
    }


@app.get("/api/copilot/digest/cached", tags=["AI Copilot"])
def get_cached_digest():
    """Returns the pre-generated digest from startup. Zero latency."""
    if not _cached_digest:
        return {"error": "Digest not yet generated. Server may still be warming up."}
    return _cached_digest


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled: {exc}", exc_info=True)
    return JSONResponse(
        status_code = 500,
        content     = {"error": "Internal server error", "detail": str(exc)},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
