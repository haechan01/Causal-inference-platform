"""
Authentication middleware and utilities for protecting routes

JWT Identity Strategy:
---------------------
- JWT tokens store user ID as a STRING (Flask-JWT-Extended best practice)
- When creating tokens: use str(user.id)
- When reading tokens: get_jwt_identity() returns a string
- For database queries: convert the string to int using int(get_jwt_identity())

This approach ensures type consistency with JWT standards while maintaining
compatibility with our integer-based database primary keys.
"""

from functools import wraps
import logging

from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity

logger = logging.getLogger(__name__)


def get_current_user():
    """
    Get the current authenticated user from JWT token
    Returns User object or None

    Note: JWT identity is stored as a string, so we convert to int for DB query
    """
    try:
        from models import User

        jwt_identity = get_jwt_identity()
        if not jwt_identity:
            return None

        # Convert JWT identity (string) to integer for database lookup
        try:
            user_id = int(jwt_identity)
        except (ValueError, TypeError) as e:
            logger.warning(
                "Invalid JWT identity format: %s (type: %s) - Error: %s",
                jwt_identity, type(jwt_identity).__name__, str(e)
            )
            return None

        return User.query.get(user_id)

    except Exception as e:
        # Log unexpected errors but don't expose them
        logger.error(
            "Unexpected error in get_current_user: %s",
            str(e), exc_info=True
        )
        return None


def admin_required():
    """
    Decorator to require admin privileges
    Use this decorator after @jwt_required()

    Example:
        @app.route('/admin/users')
        @jwt_required()
        @admin_required()
        def get_all_users():
            # Your code here
            pass
    """
    def wrapper(fn):
        @wraps(fn)
        def decorator(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({"error": "User not found"}), 404

            # Check if user has admin role
            # (you'll need to add this field to User model)
            if not hasattr(user, 'is_admin') or not user.is_admin:
                return jsonify({"error": "Admin privileges required"}), 403

            return fn(*args, **kwargs)
        return decorator
    return wrapper


def project_access_required(project_id_param='project_id'):
    """
    Decorator to verify user has access to a specific project
    Use this decorator after @jwt_required()

    Args:
        project_id_param: The name of the parameter containing the project ID

    Example:
        @app.route('/projects/<int:project_id>')
        @jwt_required()
        @project_access_required('project_id')
        def get_project(project_id):
            # Your code here
            pass
    """
    def wrapper(fn):
        @wraps(fn)
        def decorator(*args, **kwargs):
            from models import Project

            user = get_current_user()
            if not user:
                return jsonify({"error": "User not found"}), 404

            # Get project_id from kwargs
            project_id = kwargs.get(project_id_param)
            if not project_id:
                return jsonify({"error": "Project ID not provided"}), 400

            # Check if project exists and user has access
            project = Project.query.get(project_id)
            if not project:
                return jsonify({"error": "Project not found"}), 404

            if project.user_id != user.id:
                msg = "Access denied. You don't own this project"
                return jsonify({"error": msg}), 403

            return fn(*args, **kwargs)
        return decorator
    return wrapper


def get_user_projects(user_id):
    """
    Get all projects for a specific user

    Args:
        user_id: The user's ID

    Returns:
        List of Project objects
    """
    from models import Project
    return Project.query.filter_by(user_id=user_id).all()


def validate_token():
    """
    Validate JWT token without raising exceptions
    Returns tuple: (is_valid: bool, user: User or None, error: str or None)
    """
    try:
        verify_jwt_in_request()
        user = get_current_user()
        if user:
            return True, user, None
        return False, None, "User not found"
    except Exception as e:
        # Log JWT validation failures for debugging
        logger.warning("Token validation failed: %s", str(e))
        return False, None, str(e)
