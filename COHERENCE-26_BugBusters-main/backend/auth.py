"""
auth.py — Clerk JWT verification for FastAPI backend
Drop this in backend/ and use verify_clerk_token as a dependency on any route.

How it works:
  Clerk issues a JWT for every signed-in user.
  Frontend sends it as: Authorization: Bearer <token>
  Backend verifies it against Clerk's public JWKS endpoint.
  No database, no sessions — stateless.
"""

import os
import httpx
from functools import lru_cache
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt                          # pip install PyJWT
from jwt import PyJWKClient

# ── Config ────────────────────────────────────────────────────────────────────

CLERK_PUBLISHABLE_KEY = os.getenv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "")
# Extract the instance ID from publishable key: pk_test_XXXX → XXXX
# Clerk JWKS URL: https://<frontend_api>.clerk.accounts.dev/.well-known/jwks.json
CLERK_JWKS_URL = os.getenv(
    "CLERK_JWKS_URL",
    "https://api.clerk.com/v1/jwks",   # fallback — set your actual URL in .env
)

bearer_scheme = HTTPBearer(auto_error=False)

# ── JWKS client (cached so we don't fetch on every request) ──────────────────

@lru_cache(maxsize=1)
def _get_jwks_client() -> PyJWKClient:
    return PyJWKClient(CLERK_JWKS_URL)

# ── Token verification ────────────────────────────────────────────────────────

def verify_clerk_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    """
    FastAPI dependency. Use as:
        @router.get("/protected")
        def protected_route(user = Depends(verify_clerk_token)):
            return {"user_id": user["sub"]}
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )

    token = credentials.credentials
    try:
        jwks_client = _get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_exp": True},
        )
        return payload                  # contains sub (user_id), email, etc.

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

# ── Optional: get user_id shortcut ───────────────────────────────────────────

def get_current_user_id(user: dict = Depends(verify_clerk_token)) -> str:
    return user.get("sub", "")