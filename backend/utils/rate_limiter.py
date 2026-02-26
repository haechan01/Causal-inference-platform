"""
Rate limiting configuration using Flask-Limiter.

Storage:
  - Uses in-memory storage by default (fine for single-process).
  - Set REDIS_URL env var to switch to Redis for multi-process / production
    deployments (e.g. REDIS_URL=redis://localhost:6379).

Key functions:
  - Unauthenticated routes  → keyed by remote IP address.
  - Authenticated routes    → keyed by JWT user identity (user ID).
"""

import logging
import os

from flask import request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

logger = logging.getLogger(__name__)


def _get_jwt_identity_or_ip() -> str:
    """
    Key function for authenticated endpoints.

    Returns the JWT user identity (user ID string) when a valid JWT is
    present in the Authorization header, otherwise falls back to the
    remote IP address.  This prevents one user from consuming another
    user's rate-limit quota.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            # Decode without verification just to extract the subject
            # (real verification is done by @jwt_required on the route).
            import jwt as _jwt  # PyJWT

            payload = _jwt.decode(token, options={"verify_signature": False})
            sub = payload.get("sub")
            if sub:
                return f"user:{sub}"
        except Exception:
            pass
    return get_remote_address()


# Choose storage backend
_redis_url = os.environ.get("REDIS_URL")
if _redis_url:
    from flask_limiter.storage import RedisStorage  # noqa: F401 (unused at import time)
    _storage_uri = _redis_url
    logger.info("Rate limiter: using Redis storage (%s)", _redis_url)  # noqa: E501
else:
    _storage_uri = "memory://"
    logger.info("Rate limiter: using in-memory storage (single-process only)")

# Global limiter instance — call limiter.init_app(app) in app.py
limiter = Limiter(
    key_func=_get_jwt_identity_or_ip,
    storage_uri=_storage_uri,
    default_limits=["200 per minute", "1000 per hour"],
    default_limits_exempt_when=lambda: False,
    headers_enabled=True,          # Add X-RateLimit-* headers to responses
    strategy="fixed-window",
)
