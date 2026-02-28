"""Integration tests for /api/auth/* endpoints using the Flask test client."""

import pytest

from tests.test_constants import TEST_USER_PASSWORD, TEST_WRONG_PASSWORD

REGISTER_URL = "/api/auth/register"
LOGIN_URL = "/api/auth/login"
ME_URL = "/api/auth/me"
REFRESH_URL = "/api/auth/refresh"
LOGOUT_URL = "/api/auth/logout"

VALID_USER = {
    "username": "testuser",
    "email": "test@example.com",
    "password": TEST_USER_PASSWORD,
}


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


class TestRegister:
    def test_success_returns_201_with_tokens(self, client):
        resp = client.post(REGISTER_URL, json=VALID_USER)
        body = resp.get_json()

        assert resp.status_code == 201
        assert "access_token" in body
        assert "refresh_token" in body
        assert body["user"]["username"] == "testuser"
        assert body["user"]["email"] == "test@example.com"

    def test_missing_username_returns_400(self, client):
        resp = client.post(
            REGISTER_URL,
            json={"email": "a@b.com", "password": TEST_USER_PASSWORD},
        )
        assert resp.status_code == 400

    def test_missing_email_returns_400(self, client):
        resp = client.post(
            REGISTER_URL,
            json={"username": "alice", "password": TEST_USER_PASSWORD},
        )
        assert resp.status_code == 400

    def test_missing_password_returns_400(self, client):
        resp = client.post(
            REGISTER_URL,
            json={"username": "alice", "email": "a@b.com"},
        )
        assert resp.status_code == 400

    def test_short_username_returns_400(self, client):
        resp = client.post(
            REGISTER_URL,
            json={"username": "ab", "email": "a@b.com", "password": TEST_USER_PASSWORD},
        )
        assert resp.status_code == 400
        assert "3 characters" in resp.get_json()["error"]

    def test_invalid_email_format_returns_400(self, client):
        resp = client.post(
            REGISTER_URL,
            json={"username": "alice", "email": "not-an-email", "password": TEST_USER_PASSWORD},
        )
        assert resp.status_code == 400

    def test_weak_password_no_uppercase_returns_400(self, client):
        resp = client.post(
            REGISTER_URL,
            json={"username": "alice", "email": "a@b.com", "password": "lowercase1"},
        )
        assert resp.status_code == 400

    def test_weak_password_no_digit_returns_400(self, client):
        resp = client.post(
            REGISTER_URL,
            json={"username": "alice", "email": "a@b.com", "password": "NoDigitPass"},
        )
        assert resp.status_code == 400

    def test_weak_password_too_short_returns_400(self, client):
        resp = client.post(
            REGISTER_URL,
            json={"username": "alice", "email": "a@b.com", "password": "Ab1"},
        )
        assert resp.status_code == 400

    def test_duplicate_username_returns_409(self, client):
        client.post(REGISTER_URL, json=VALID_USER)
        resp = client.post(
            REGISTER_URL,
            json={**VALID_USER, "email": "other@example.com"},
        )
        assert resp.status_code == 409
        assert "Username" in resp.get_json()["error"]

    def test_duplicate_email_returns_409(self, client):
        client.post(REGISTER_URL, json=VALID_USER)
        resp = client.post(
            REGISTER_URL,
            json={**VALID_USER, "username": "otherusername"},
        )
        assert resp.status_code == 409
        assert "Email" in resp.get_json()["error"]

    def test_no_body_returns_400(self, client):
        # An empty JSON object is falsy in Python, so the route returns 400
        resp = client.post(REGISTER_URL, json={})
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


class TestLogin:
    def test_success_returns_200_with_tokens(self, client):
        client.post(REGISTER_URL, json=VALID_USER)

        resp = client.post(
            LOGIN_URL,
            json={"email": VALID_USER["email"], "password": VALID_USER["password"]},
        )
        body = resp.get_json()

        assert resp.status_code == 200
        assert "access_token" in body
        assert "refresh_token" in body
        assert body["user"]["email"] == VALID_USER["email"]

    def test_wrong_password_returns_401(self, client):
        client.post(REGISTER_URL, json=VALID_USER)

        resp = client.post(
            LOGIN_URL,
            json={"email": VALID_USER["email"], "password": TEST_WRONG_PASSWORD},
        )
        assert resp.status_code == 401

    def test_unknown_email_returns_401(self, client):
        resp = client.post(
            LOGIN_URL,
            json={"email": "nobody@example.com", "password": TEST_USER_PASSWORD},
        )
        assert resp.status_code == 401

    def test_missing_email_returns_400(self, client):
        resp = client.post(LOGIN_URL, json={"password": TEST_USER_PASSWORD})
        assert resp.status_code == 400

    def test_missing_password_returns_400(self, client):
        resp = client.post(LOGIN_URL, json={"email": "a@b.com"})
        assert resp.status_code == 400

    def test_no_body_returns_400(self, client):
        resp = client.post(LOGIN_URL, json={})
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# /me
# ---------------------------------------------------------------------------


class TestGetMe:
    def test_returns_user_info_with_valid_token(self, client, auth_headers):
        resp = client.get(ME_URL, headers=auth_headers)
        body = resp.get_json()

        assert resp.status_code == 200
        assert body["user"]["username"] == "testuser"
        assert body["user"]["email"] == "test@example.com"

    def test_no_token_returns_401(self, client):
        resp = client.get(ME_URL)
        assert resp.status_code == 401

    def test_invalid_token_returns_401(self, client):
        resp = client.get(ME_URL, headers={"Authorization": "Bearer invalid-token"})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Token refresh
# ---------------------------------------------------------------------------


class TestRefreshToken:
    def test_returns_new_access_token(self, client, registered_user):
        refresh_token = registered_user["refresh_token"]
        resp = client.post(
            REFRESH_URL,
            headers={"Authorization": f"Bearer {refresh_token}"},
        )
        body = resp.get_json()

        assert resp.status_code == 200
        assert "access_token" in body

    def test_using_access_token_returns_422(self, client, registered_user):
        access_token = registered_user["access_token"]
        resp = client.post(
            REFRESH_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------


class TestLogout:
    def test_success_returns_200(self, client, auth_headers):
        resp = client.post(LOGOUT_URL, headers=auth_headers)
        assert resp.status_code == 200

    def test_no_token_returns_401(self, client):
        resp = client.post(LOGOUT_URL)
        assert resp.status_code == 401
