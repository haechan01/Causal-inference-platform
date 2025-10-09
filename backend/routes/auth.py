"""
Simple authentication routes for JWT.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from models import db, User

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new user."""
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('email') or not data.get('password'):
        return jsonify({"error": "Username, email, and password are required"}), 400
    
    # Check if user exists
    if User.query.filter_by(username=data['username']).first():
        return jsonify({"error": "Username already exists"}), 400
    if User.query.filter_by(email=data['email']).first():
        return jsonify({"error": "Email already registered"}), 400
    
    # Create user
    user = User(
        username=data['username'],
        email=data['email']
    )
    user.set_password(data['password'])
    
    db.session.add(user)
    db.session.commit()
    
    # Create token
    access_token = create_access_token(identity=str(user.id))
    
    return jsonify({
        "message": "User registered successfully",
        "user": user.to_dict(),
        "access_token": access_token
    }), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    """Login user."""
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({"error": "Username and password are required"}), 400
    
    # Find user
    user = User.query.filter(
        (User.username == data['username']) | (User.email == data['username'])
    ).first()
    
    if not user or not user.check_password(data['password']):
        return jsonify({"error": "Invalid credentials"}), 401
    
    # Create token
    access_token = create_access_token(identity=str(user.id))
    
    return jsonify({
        "message": "Login successful",
        "user": user.to_dict(),
        "access_token": access_token
    }), 200


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current user info."""
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    return jsonify({"user": user.to_dict()}), 200