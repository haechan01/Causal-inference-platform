"""
Pytest configuration and shared fixtures for the Causal Studio backend test suite.

Environment variables are set at module level (before any app imports) so that
app.py's startup validation does not raise ValueError.
"""

import os

# Must be set before importing app.py – it validates these at import time.
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-ci-only")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-for-ci-only")
os.environ.setdefault("JWT_ACCESS_TOKEN_EXPIRES", "3600")
os.environ.setdefault("JWT_REFRESH_TOKEN_EXPIRES", "86400")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")

# Fake AWS credentials so boto3 client construction doesn't error
os.environ.setdefault("AWS_ACCESS_KEY_ID", "test-aws-key-id")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test-aws-secret-key")
os.environ.setdefault("AWS_REGION", "us-east-1")
os.environ.setdefault("AWS_S3_BUCKET_NAME", "test-bucket")

import pytest
from tests.test_constants import TEST_USER_PASSWORD
from app import app as flask_app
from models import db as _db

# Flask-Limiter 3.x sets `enabled` as an instance attribute during init_app()
# and checks that attribute at request time – not the Flask config.  We must
# disable it here, after the module import, so tests never hit rate limits.
from utils.rate_limiter import limiter as _limiter
_limiter.enabled = False


@pytest.fixture()
def app():
    """Create a fresh application with an isolated SQLite in-memory database."""
    flask_app.config.update(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            # Disable rate limiting so tests don't hit request-per-minute limits
            "RATELIMIT_ENABLED": False,
        }
    )

    with flask_app.app_context():
        _db.create_all()
        yield flask_app
        _db.session.remove()
        _db.drop_all()


@pytest.fixture()
def client(app):
    """Flask test client."""
    with app.test_client() as c:
        yield c


# ---------------------------------------------------------------------------
# Convenience fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def registered_user(client):
    """Register a test user and return the parsed JSON response body."""
    resp = client.post(
        "/api/auth/register",
        json={
            "username": "testuser",
            "email": "test@example.com",
            "password": TEST_USER_PASSWORD,
        },
    )
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()


@pytest.fixture()
def auth_headers(registered_user):
    """Authorization header dict containing a valid access token."""
    token = registered_user["access_token"]
    return {"Authorization": f"Bearer {token}"}
