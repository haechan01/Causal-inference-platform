"""Unit tests for SQLAlchemy models."""

from datetime import date

import pytest
from werkzeug.security import generate_password_hash

from models import AIUsageLog, Dataset, Project, User, db


# ---------------------------------------------------------------------------
# User model
# ---------------------------------------------------------------------------


class TestUserModel:
    def test_verify_password_correct(self, app):
        with app.app_context():
            user = User(
                username="alice",
                email="alice@example.com",
                password_hash=generate_password_hash("SecurePass1"),
            )
            assert user.verify_password("SecurePass1") is True

    def test_verify_password_wrong(self, app):
        with app.app_context():
            user = User(
                username="alice",
                email="alice@example.com",
                password_hash=generate_password_hash("SecurePass1"),
            )
            assert user.verify_password("wrongpassword") is False

    def test_to_dict_structure(self, app):
        with app.app_context():
            user = User(
                username="bob",
                email="bob@example.com",
                password_hash=generate_password_hash("SecurePass1"),
            )
            db.session.add(user)
            db.session.commit()

            d = user.to_dict()
            assert d["username"] == "bob"
            assert d["email"] == "bob@example.com"
            assert "id" in d
            assert "created_at" in d
            assert "password_hash" not in d

    def test_repr(self, app):
        with app.app_context():
            user = User(username="carol", email="c@e.com", password_hash="x")
            assert "carol" in repr(user)


# ---------------------------------------------------------------------------
# Project model
# ---------------------------------------------------------------------------


class TestProjectModel:
    def test_to_dict_structure(self, app):
        with app.app_context():
            user = User(
                username="dave",
                email="dave@example.com",
                password_hash=generate_password_hash("Pass1234"),
            )
            db.session.add(user)
            db.session.commit()

            project = Project(
                user_id=user.id,
                name="My Project",
                description="A test project",
            )
            db.session.add(project)
            db.session.commit()

            d = project.to_dict()
            assert d["name"] == "My Project"
            assert d["description"] == "A test project"
            assert d["user_id"] == user.id
            assert "datasets_count" in d
            assert "analyses_count" in d


# ---------------------------------------------------------------------------
# Dataset model
# ---------------------------------------------------------------------------


class TestDatasetModel:
    def test_to_dict_structure(self, app):
        with app.app_context():
            user = User(
                username="eve",
                email="eve@example.com",
                password_hash=generate_password_hash("Pass1234"),
            )
            db.session.add(user)
            db.session.commit()

            ds = Dataset(
                user_id=user.id,
                name="My Dataset",
                file_name="data.csv",
                s3_key="uploads/user_1/data.csv",
            )
            db.session.add(ds)
            db.session.commit()

            d = ds.to_dict()
            assert d["name"] == "My Dataset"
            assert d["file_name"] == "data.csv"
            assert d["s3_key"] == "uploads/user_1/data.csv"
            assert d["user_id"] == user.id
            assert "created_at" in d


# ---------------------------------------------------------------------------
# AIUsageLog model
# ---------------------------------------------------------------------------


class TestAIUsageLogModel:
    def test_get_daily_count_zero_when_no_record(self, app):
        with app.app_context():
            count = AIUsageLog.get_daily_count(user_id=999, endpoint="interpret")
            assert count == 0

    def test_increment_creates_record_and_returns_one(self, app):
        with app.app_context():
            user = User(
                username="frank",
                email="frank@example.com",
                password_hash=generate_password_hash("Pass1234"),
            )
            db.session.add(user)
            db.session.commit()

            count = AIUsageLog.increment(db.session, user_id=user.id, endpoint="interpret")
            assert count == 1

    def test_increment_increments_existing_record(self, app):
        with app.app_context():
            user = User(
                username="grace",
                email="grace@example.com",
                password_hash=generate_password_hash("Pass1234"),
            )
            db.session.add(user)
            db.session.commit()

            AIUsageLog.increment(db.session, user_id=user.id, endpoint="chat")
            count = AIUsageLog.increment(db.session, user_id=user.id, endpoint="chat")
            assert count == 2

    def test_get_daily_count_matches_after_increment(self, app):
        with app.app_context():
            user = User(
                username="henry",
                email="henry@example.com",
                password_hash=generate_password_hash("Pass1234"),
            )
            db.session.add(user)
            db.session.commit()

            today = date.today()
            AIUsageLog.increment(db.session, user_id=user.id, endpoint="recommend")
            AIUsageLog.increment(db.session, user_id=user.id, endpoint="recommend")

            count = AIUsageLog.get_daily_count(
                user_id=user.id, endpoint="recommend", for_date=today
            )
            assert count == 2
