"""
Authentication routes for user registration, login, and JWT token management.

JWT Identity Strategy:
---------------------
- JWT tokens store user ID as a STRING (Flask-JWT-Extended best practice)
- When creating tokens: use str(user.id)
- When reading tokens: get_jwt_identity() returns a string
- For database queries: convert the string to int using int(get_jwt_identity())

This approach ensures type consistency with JWT standards while maintaining
compatibility with our integer-based database primary keys.
"""

from flask import Blueprint, request, jsonify, current_app
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity
)
import re
import logging

# Configure logger for this module
logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

# Rate limiting is applied via Flask-Limiter configuration in app.py
# Default: 5 requests per minute for all auth endpoints
# Specific limits can be configured per route if needed


def validate_email(email):
    """Validate email format"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def validate_password(password):
    """Validate password strength"""
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    if not re.search(r'[A-Z]', password):
        msg = "Password must contain at least one uppercase letter"
        return False, msg
    if not re.search(r'[a-z]', password):
        msg = "Password must contain at least one lowercase letter"
        return False, msg
    if not re.search(r'[0-9]', password):
        return False, "Password must contain at least one number"
    return True, "Password is valid"


@auth_bp.route('/register', methods=['POST'])
def register():
    """
    Register a new user
    Expected JSON: {
        "username": "string",
        "email": "string",
        "password": "string"
    }
    Rate limited: 5 requests per minute per IP
    """
    try:
        from app import db
        from models import User

        data = request.get_json()

        # Validate required fields
        if not data:
            return jsonify({"error": "No data provided"}), 400

        username = data.get('username', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '')

        # Validate inputs
        if not username or not email or not password:
            msg = "Username, email, and password are required"
            return jsonify({"error": msg}), 400

        if len(username) < 3:
            msg = "Username must be at least 3 characters long"
            return jsonify({"error": msg}), 400

        if not validate_email(email):
            return jsonify({"error": "Invalid email format"}), 400

        # Validate password strength
        is_valid, message = validate_password(password)
        if not is_valid:
            return jsonify({"error": message}), 400

        # Check if user already exists
        if User.query.filter_by(username=username).first():
            return jsonify({"error": "Username already exists"}), 409

        if User.query.filter_by(email=email).first():
            return jsonify({"error": "Email already registered"}), 409

        # Hash password
        password_hash = generate_password_hash(password)

        # Create new user
        new_user = User(
            username=username,
            email=email,
            password_hash=password_hash
        )

        db.session.add(new_user)
        db.session.commit()

        # Generate tokens
        access_token = create_access_token(
            identity=str(new_user.id),
            additional_claims={"username": new_user.username}
        )
        refresh_token = create_refresh_token(identity=str(new_user.id))

        return jsonify({
            "message": "User registered successfully",
            "user": {
                "id": new_user.id,
                "username": new_user.username,
                "email": new_user.email
            },
            "access_token": access_token,
            "refresh_token": refresh_token
        }), 201

    except Exception as e:
        # Log the full exception for debugging
        logger.error("Registration failed: %s", str(e), exc_info=True)

        # Safely rollback if session exists
        try:
            db.session.rollback()
        except Exception as rollback_error:
            logger.error("Rollback failed: %s", str(rollback_error))

        return jsonify({"error": "Registration failed"}), 500


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    Login user
    Expected JSON: {
        "email": "string",
        "password": "string"
    }
    """
    try:
        from app import db
        from models import User

        data = request.get_json()

        if not data:
            return jsonify({"error": "No data provided"}), 400

        email = data.get('email', '').strip()
        password = data.get('password', '')

        if not email or not password:
            return jsonify({"error": "Email and password are required"}), 400

        # Find user by email
        user = User.query.filter_by(email=email).first()

        if not user:
            return jsonify({"error": "Invalid email or password"}), 401

        # Verify password
        if not check_password_hash(user.password_hash, password):
            return jsonify({"error": "Invalid email or password"}), 401

        # Generate tokens
        access_token = create_access_token(
            identity=str(user.id),
            additional_claims={"username": user.username}
        )
        refresh_token = create_refresh_token(identity=str(user.id))

        return jsonify({
            "message": "Login successful",
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email
            },
            "access_token": access_token,
            "refresh_token": refresh_token
        }), 200

    except Exception as e:
        # Log the full exception for debugging
        logger.error("Login failed: %s", str(e), exc_info=True)
        return jsonify({"error": "Login failed"}), 500


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """
    Refresh access token using refresh token
    Requires refresh token in Authorization header: Bearer <refresh_token>
    """
    try:
        from app import db
        from models import User

        # Validate JWT identity is a valid integer
        try:
            jwt_identity = get_jwt_identity()
            current_user_id = int(jwt_identity)
        except (ValueError, TypeError) as e:
            # Log the actual error for debugging
            logger.warning(
                "Invalid JWT identity format: %s (type: %s) - Error: %s",
                jwt_identity, type(jwt_identity).__name__, str(e)
            )
            return jsonify({"error": "Invalid token identity"}), 401

        user = User.query.get(current_user_id)

        if not user:
            logger.warning("User ID %s from token not found", current_user_id)
            return jsonify({"error": "User not found"}), 404

        # Generate new access token
        access_token = create_access_token(
            identity=str(current_user_id),
            additional_claims={"username": user.username}
        )

        return jsonify({
            "access_token": access_token
        }), 200

    except Exception as e:
        # Log the full exception for debugging
        logger.error("Token refresh failed: %s", str(e), exc_info=True)
        return jsonify({"error": "Token refresh failed"}), 500


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """
    Get current user info
    Requires access token in Authorization header: Bearer <access_token>
    """
    try:
        from app import db
        from models import User

        # Validate JWT identity is a valid integer
        try:
            jwt_identity = get_jwt_identity()
            current_user_id = int(jwt_identity)
        except (ValueError, TypeError) as e:
            # Log the actual error for debugging
            logger.warning(
                "Invalid JWT identity format: %s (type: %s) - Error: %s",
                jwt_identity, type(jwt_identity).__name__, str(e)
            )
            return jsonify({"error": "Invalid token identity"}), 401

        user = User.query.get(current_user_id)

        if not user:
            logger.warning("User ID %s from token not found", current_user_id)
            return jsonify({"error": "User not found"}), 404

        return jsonify({
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email
            }
        }), 200

    except Exception as e:
        # Log the full exception for debugging
        logger.error("Failed to get user info: %s", str(e), exc_info=True)
        return jsonify({"error": "Failed to get user info"}), 500


@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    """
    Logout user (client-side token removal)
    In a production app, you might want to implement token blacklisting
    """
    msg = "Logout successful. Please remove the token from client."
    return jsonify({"message": msg}), 200
