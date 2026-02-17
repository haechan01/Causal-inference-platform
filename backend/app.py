from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from datetime import timedelta
import os
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
logger = logging.getLogger(__name__)

# --- CORS Configuration ---
allowed_origins = os.environ.get('CORS_ORIGINS', 'http://localhost:3000')
CORS(app, origins=allowed_origins.split(','))

# --- Flask Configuration ---
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is not set")
app.config['SECRET_KEY'] = SECRET_KEY

# --- JWT Configuration ---
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY')
if not JWT_SECRET_KEY:
    raise ValueError("JWT_SECRET_KEY environment variable is not set")
app.config['JWT_SECRET_KEY'] = JWT_SECRET_KEY

# Token expiration settings
JWT_ACCESS_TOKEN_EXPIRES = os.environ.get('JWT_ACCESS_TOKEN_EXPIRES')
JWT_REFRESH_TOKEN_EXPIRES = os.environ.get('JWT_REFRESH_TOKEN_EXPIRES')

if not JWT_ACCESS_TOKEN_EXPIRES:
    raise ValueError("JWT_ACCESS_TOKEN_EXPIRES environment variable is not set")
if not JWT_REFRESH_TOKEN_EXPIRES:
    raise ValueError("JWT_REFRESH_TOKEN_EXPIRES environment variable is not set")

app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(seconds=int(JWT_ACCESS_TOKEN_EXPIRES))
app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(seconds=int(JWT_REFRESH_TOKEN_EXPIRES))

# Initialize JWT
jwt = JWTManager(app)

# --- Database Configuration ---
# Supabase: Project Settings → Database → Connection string (URI)
# Use the "Transaction" pooler (port 6543)
DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set (Supabase connection string)")

db_uri = DATABASE_URL
if db_uri.startswith('postgres://'):
    db_uri = db_uri.replace('postgres://', 'postgresql://', 1)
app.config['SQLALCHEMY_DATABASE_URI'] = db_uri
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,   # Test connections before use
    'pool_recycle': 300,     # Recycle connections every 5 min
}

# Import db from models and initialize it
from models import db  # noqa: E402
db.init_app(app)

# Import blueprints after db initialization
# Models are imported within routes to avoid circular imports
from routes.analysis import analysis_bp  # noqa: E402
from routes.auth import auth_bp  # noqa: E402
from routes.projects import projects_bp  # noqa: E402
from routes.datasets import datasets_bp  # noqa: E402
from routes.ai import ai_bp  # noqa: E402

# API Routes (Blueprints)
app.register_blueprint(auth_bp)
app.register_blueprint(analysis_bp)
app.register_blueprint(projects_bp)
app.register_blueprint(datasets_bp)
app.register_blueprint(ai_bp)


@app.errorhandler(500)
def handle_500(error):
    """Avoid leaking internal error details in production."""
    logger.exception("Unhandled server error")
    is_debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    if is_debug:
        return jsonify({"error": str(error)}), 500
    return jsonify({"error": "An internal error occurred"}), 500


@app.route('/')
def index():
    return "Hello, Causal Studio AI is running!"


@app.route('/health')
def health():
    return {
        "status": "healthy",
        "message": "Causal Studio API is running"
    }

if __name__ == "__main__":
    with app.app_context():
        db.create_all()  # Create tables
    port = int(os.getenv('PORT', 5001))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    host = '127.0.0.1' if debug else '0.0.0.0'
    app.run(host=host, port=port, debug=debug)
