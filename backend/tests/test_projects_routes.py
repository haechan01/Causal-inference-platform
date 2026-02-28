"""Integration tests for /api/projects/* endpoints."""

import io
import json
from unittest.mock import MagicMock, patch

import pytest

PROJECTS_URL = "/api/projects"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def create_project(client, auth_headers, name="Test Project", description="desc"):
    return client.post(
        PROJECTS_URL,
        json={"name": name, "description": description},
        headers=auth_headers,
    )


# ---------------------------------------------------------------------------
# Create project
# ---------------------------------------------------------------------------


class TestCreateProject:
    def test_success_returns_201(self, client, auth_headers):
        resp = create_project(client, auth_headers)
        body = resp.get_json()

        assert resp.status_code == 201
        assert body["project"]["name"] == "Test Project"
        assert body["project"]["description"] == "desc"

    def test_missing_name_returns_400(self, client, auth_headers):
        resp = client.post(PROJECTS_URL, json={"description": "no name"}, headers=auth_headers)
        assert resp.status_code == 400

    def test_no_auth_returns_401(self, client):
        resp = client.post(PROJECTS_URL, json={"name": "Unauthorized"})
        assert resp.status_code == 401

    def test_no_body_returns_400(self, client, auth_headers):
        resp = client.post(PROJECTS_URL, json={}, headers=auth_headers)
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# List projects
# ---------------------------------------------------------------------------


class TestListProjects:
    def test_empty_list_for_new_user(self, client, auth_headers):
        resp = client.get(PROJECTS_URL, headers=auth_headers)
        body = resp.get_json()

        assert resp.status_code == 200
        assert body["projects"] == []
        assert body["count"] == 0

    def test_returns_created_projects(self, client, auth_headers):
        create_project(client, auth_headers, "Project A")
        create_project(client, auth_headers, "Project B")

        resp = client.get(PROJECTS_URL, headers=auth_headers)
        body = resp.get_json()

        assert resp.status_code == 200
        assert body["count"] == 2
        names = {p["name"] for p in body["projects"]}
        assert names == {"Project A", "Project B"}

    def test_no_auth_returns_401(self, client):
        resp = client.get(PROJECTS_URL)
        assert resp.status_code == 401

    def test_users_cannot_see_each_others_projects(self, client, auth_headers, app):
        """Projects must be isolated per user."""
        create_project(client, auth_headers, "User1 Project")

        # Register a second user
        client.post(
            "/api/auth/register",
            json={
                "username": "user2",
                "email": "user2@example.com",
                "password": "TestPass123",
            },
        )
        login2 = client.post(
            "/api/auth/login",
            json={"email": "user2@example.com", "password": "TestPass123"},
        )
        headers2 = {"Authorization": f"Bearer {login2.get_json()['access_token']}"}

        resp2 = client.get(PROJECTS_URL, headers=headers2)
        assert resp2.status_code == 200
        assert resp2.get_json()["count"] == 0


# ---------------------------------------------------------------------------
# Get single project
# ---------------------------------------------------------------------------


class TestGetProject:
    def test_success_returns_project_detail(self, client, auth_headers):
        pid = create_project(client, auth_headers).get_json()["project"]["id"]

        resp = client.get(f"{PROJECTS_URL}/{pid}", headers=auth_headers)
        body = resp.get_json()

        assert resp.status_code == 200
        assert body["project"]["id"] == pid
        assert "datasets" in body["project"]

    def test_not_found_returns_404(self, client, auth_headers):
        resp = client.get(f"{PROJECTS_URL}/99999", headers=auth_headers)
        assert resp.status_code == 404

    def test_other_users_project_returns_403(self, client, auth_headers):
        pid = create_project(client, auth_headers).get_json()["project"]["id"]

        # Second user
        client.post(
            "/api/auth/register",
            json={"username": "user2", "email": "u2@e.com", "password": "TestPass123"},
        )
        login2 = client.post(
            "/api/auth/login",
            json={"email": "u2@e.com", "password": "TestPass123"},
        )
        headers2 = {"Authorization": f"Bearer {login2.get_json()['access_token']}"}

        resp = client.get(f"{PROJECTS_URL}/{pid}", headers=headers2)
        assert resp.status_code == 403

    def test_no_auth_returns_401(self, client):
        resp = client.get(f"{PROJECTS_URL}/1")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Update project
# ---------------------------------------------------------------------------


class TestUpdateProject:
    def test_update_name_and_description(self, client, auth_headers):
        pid = create_project(client, auth_headers).get_json()["project"]["id"]

        resp = client.put(
            f"{PROJECTS_URL}/{pid}",
            json={"name": "Renamed", "description": "Updated desc"},
            headers=auth_headers,
        )
        body = resp.get_json()

        assert resp.status_code == 200
        assert body["project"]["name"] == "Renamed"
        assert body["project"]["description"] == "Updated desc"

    def test_update_selected_method(self, client, auth_headers):
        pid = create_project(client, auth_headers).get_json()["project"]["id"]

        resp = client.put(
            f"{PROJECTS_URL}/{pid}",
            json={"selected_method": "did"},
            headers=auth_headers,
        )
        body = resp.get_json()

        assert resp.status_code == 200
        assert body["project"]["selected_method"] == "did"

    def test_empty_name_returns_400(self, client, auth_headers):
        pid = create_project(client, auth_headers).get_json()["project"]["id"]

        resp = client.put(
            f"{PROJECTS_URL}/{pid}",
            json={"name": "   "},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    def test_not_found_returns_404(self, client, auth_headers):
        resp = client.put(
            f"{PROJECTS_URL}/99999",
            json={"name": "Ghost"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_no_auth_returns_401(self, client):
        resp = client.put(f"{PROJECTS_URL}/1", json={"name": "x"})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Delete project
# ---------------------------------------------------------------------------


class TestDeleteProject:
    def test_delete_success_returns_200(self, client, auth_headers):
        pid = create_project(client, auth_headers).get_json()["project"]["id"]

        resp = client.delete(f"{PROJECTS_URL}/{pid}", headers=auth_headers)
        assert resp.status_code == 200

        # Confirm it's gone
        get_resp = client.get(f"{PROJECTS_URL}/{pid}", headers=auth_headers)
        assert get_resp.status_code == 404

    def test_not_found_returns_404(self, client, auth_headers):
        resp = client.delete(f"{PROJECTS_URL}/99999", headers=auth_headers)
        assert resp.status_code == 404

    def test_other_users_project_returns_403(self, client, auth_headers):
        pid = create_project(client, auth_headers).get_json()["project"]["id"]

        client.post(
            "/api/auth/register",
            json={"username": "user3", "email": "u3@e.com", "password": "TestPass123"},
        )
        login3 = client.post(
            "/api/auth/login",
            json={"email": "u3@e.com", "password": "TestPass123"},
        )
        headers3 = {"Authorization": f"Bearer {login3.get_json()['access_token']}"}

        resp = client.delete(f"{PROJECTS_URL}/{pid}", headers=headers3)
        assert resp.status_code == 403

    def test_no_auth_returns_401(self, client):
        resp = client.delete(f"{PROJECTS_URL}/1")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Save project state
# ---------------------------------------------------------------------------


class TestSaveProjectState:
    def test_save_state_returns_200(self, client, auth_headers):
        pid = create_project(client, auth_headers).get_json()["project"]["id"]

        resp = client.put(
            f"{PROJECTS_URL}/{pid}/state",
            json={
                "current_step": "method",
                "selected_method": "rdd",
                "analysis_config": {"outcome": "y", "running_var": "x"},
            },
            headers=auth_headers,
        )
        body = resp.get_json()

        assert resp.status_code == 200
        assert body["project"]["current_step"] == "method"
        assert body["project"]["selected_method"] == "rdd"
        assert body["project"]["analysis_config"]["outcome"] == "y"


# ---------------------------------------------------------------------------
# Health / root endpoints
# ---------------------------------------------------------------------------


class TestHealthEndpoints:
    def test_root_returns_200(self, client):
        resp = client.get("/")
        assert resp.status_code == 200

    def test_health_returns_healthy(self, client):
        resp = client.get("/health")
        body = resp.get_json()
        assert resp.status_code == 200
        assert body["status"] == "healthy"
