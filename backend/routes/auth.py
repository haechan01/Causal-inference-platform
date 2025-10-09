"""
Authentication routes for user registration, login, and JWT token management.

JWT Identity Strategy:
- We use string user IDs as JWT identity to avoid type conversion issues
- When creating tokens: identity=str(user.id)
- When retrieving user: int(get_jwt_identity())
"""
import logging
from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, create_refresh_token, 
    get_jwt_identity, jwt_required
)
from werkzeug.security import generate_password_hash
from app import db

# Create blueprint
auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

# Set up logging
logger = logging.getLogger(__name__)


def validate_email(email):
    """Basic email validation."""
    if not email or '@' not in email:
        return False
    return True


def validate_password(password):
    """Basic password validation."""
    if not password or len(password) < 6:
        return False
    return True


@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new user."""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        username = data.get('username', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '')
        
        # Validate input
        if not username:
            return jsonify({"error": "Username is required"}), 400
        if not validate_email(email):
            return jsonify({"error": "Valid email is required"}), 400
        if not validate_password(password):
            return jsonify({"error": "Password must be at least 6 characters"}), 400
        
        # Import User model here to avoid circular imports
        from models import User
        
        # Check if user already exists
        if User.query.filter_by(username=username).first():
            return jsonify({"error": "Username already exists"}), 400
        if User.query.filter_by(email=email).first():
            return jsonify({"error": "Email already registered"}), 400
        
        # Create new user
        password_hash = generate_password_hash(password)
        new_user = User(
            username=username,
            email=email,
            password_hash=password_hash
        )
        
        db.session.add(new_user)
        db.session.commit()
        
        # Create JWT tokens
        access_token = create_access_token(identity=str(new_user.id))
        refresh_token = create_refresh_token(identity=str(new_user.id))
        
        logger.info(f"User registered successfully: {username} ({email})")
        
        return jsonify({
            "message": "User registered successfully",
            "user": new_user.to_dict(),
            "access_token": access_token,
            "refresh_token": refresh_token
        }), 201
        
    except Exception as e:
        logger.error(f"Registration error: {str(e)}", exc_info=True)
        try:
            db.session.rollback()
        except Exception as rollback_error:
            logger.error(f"Rollback error: {str(rollback_error)}", exc_info=True)
        return jsonify({"error": "Registration failed"}), 500


@auth_bp.route('/login', methods=['POST'])
def login():
    """Login user and return JWT tokens."""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        username = data.get('username', '').strip()
        password = data.get('password', '')
        
        if not username or not password:
            return jsonify({"error": "Username and password are required"}), 400
        
        # Import User model here to avoid circular imports
        from models import User
        
        # Find user by username or email
        user = User.query.filter(
            (User.username == username) | (User.email == username)
        ).first()
        
        if not user or not user.verify_password(password):
            logger.warning(f"Failed login attempt for username: {username}")
            return jsonify({"error": "Invalid credentials"}), 401
        
        # Create JWT tokens
        access_token = create_access_token(identity=str(user.id))
        refresh_token = create_refresh_token(identity=str(user.id))
        
        logger.info(f"User logged in successfully: {user.username}")
        
        return jsonify({
            "message": "Login successful",
            "user": user.to_dict(),
            "access_token": access_token,
            "refresh_token": refresh_token
        }), 200
        
    except Exception as e:
        logger.error(f"Login error: {str(e)}", exc_info=True)
        return jsonify({"error": "Login failed"}), 500


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """Refresh access token using refresh token."""
    try:
        # Import User model here to avoid circular imports
        from models import User
        
        # Get user ID from JWT identity
        try:
            current_user_id = int(get_jwt_identity())
        except (ValueError, TypeError):
            logger.error("Invalid JWT identity format in refresh token")
            return jsonify({"error": "Invalid token identity"}), 401
        
        # Verify user exists
        user = User.query.get(current_user_id)
        if not user:
            logger.error(f"User not found for ID: {current_user_id}")
            return jsonify({"error": "User not found"}), 401
        
        # Create new access token
        new_access_token = create_access_token(identity=str(user.id))
        
        logger.info(f"Token refreshed for user: {user.username}")
        
        return jsonify({
            "access_token": new_access_token
        }), 200
        
    except Exception as e:
        logger.error(f"Token refresh error: {str(e)}", exc_info=True)
        return jsonify({"error": "Token refresh failed"}), 500


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current user information."""
    try:
        # Import User model here to avoid circular imports
        from models import User
        
        # Get user ID from JWT identity
        try:
            current_user_id = int(get_jwt_identity())
        except (ValueError, TypeError):
            logger.error("Invalid JWT identity format in access token")
            return jsonify({"error": "Invalid token identity"}), 401
        
        # Get user
        user = User.query.get(current_user_id)
        if not user:
            logger.error(f"User not found for ID: {current_user_id}")
            return jsonify({"error": "User not found"}), 401
        
        return jsonify({
            "user": user.to_dict()
        }), 200
        
    except Exception as e:
        logger.error(f"Get current user error: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to get user information"}), 500
