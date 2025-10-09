"""
Authentication middleware and decorators for protecting routes.

JWT Identity Strategy:
- We use string user IDs as JWT identity to avoid type conversion issues
- When creating tokens: identity=str(user.id)
- When retrieving user: int(get_jwt_identity())
"""
import logging
from functools import wraps
from flask import jsonify
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

# Set up logging
logger = logging.getLogger(__name__)


def get_current_user():
    """
    Get the current user from JWT token.
    Returns the user object or None if not found/invalid.
    """
    try:
        # Verify JWT is present and valid
        verify_jwt_in_request()
        
        # Get JWT identity
        jwt_identity = get_jwt_identity()
        if not jwt_identity:
            logger.error("JWT identity is None")
            return None
        
        # Convert string ID to integer
        try:
            user_id = int(jwt_identity)
        except (ValueError, TypeError) as e:
            logger.error(f"Invalid JWT identity format: {jwt_identity}, error: {str(e)}")
            return None
        
        # Import User model here to avoid circular imports
        from models import User
        
        # Get user from database
        user = User.query.get(user_id)
        if not user:
            logger.error(f"User not found for ID: {user_id}")
            return None
        
        return user
        
    except Exception as e:
        logger.error(f"Error getting current user: {str(e)}", exc_info=True)
        return None


def admin_required(f):
    """Decorator to require admin privileges."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        
        # For now, we don't have admin roles, so this is a placeholder
        # You can implement admin logic here when needed
        if not hasattr(user, 'is_admin') or not user.is_admin:
            return jsonify({"error": "Admin privileges required"}), 403
        
        return f(*args, **kwargs)
    return decorated_function


def project_access_required(f):
    """Decorator to require access to a specific project."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        
        # Get project_id from route parameters
        project_id = kwargs.get('project_id')
        if not project_id:
            return jsonify({"error": "Project ID required"}), 400
        
        # Import Project model here to avoid circular imports
        from models import Project
        
        # Check if user owns the project
        project = Project.query.get(project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404
        
        if project.user_id != user.id:
            return jsonify({"error": "Access denied to this project"}), 403
        
        return f(*args, **kwargs)
    return decorated_function


def validate_token():
    """
    Validate JWT token and return user information.
    This is a utility function for manual token validation.
    """
    try:
        user = get_current_user()
        if not user:
            return None, "Invalid or expired token"
        
        return user, None
        
    except Exception as e:
        logger.error(f"Token validation error: {str(e)}", exc_info=True)
        return None, "Token validation failed"
