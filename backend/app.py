"""
Flask application initialization and configuration.
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from datetime import timedelta
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

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

app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(
    seconds=int(JWT_ACCESS_TOKEN_EXPIRES)
)
app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(
    seconds=int(JWT_REFRESH_TOKEN_EXPIRES)
)

# Initialize JWT
jwt = JWTManager(app)

# --- Database Configuration ---
DB_USER = os.environ.get('DB_USER')
DB_PASSWORD = os.environ.get('DB_PASSWORD')
DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME')

# Validate required database environment variables
if not DB_USER:
    raise ValueError("DB_USER environment variable is not set")
if not DB_PASSWORD:
    raise ValueError("DB_PASSWORD environment variable is not set")
if not DB_NAME:
    raise ValueError("DB_NAME environment variable is not set")

# Configure PostgreSQL database
app.config['SQLALCHEMY_DATABASE_URI'] = (
    f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:"
    f"{DB_PORT}/{DB_NAME}"
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Logging Configuration
app.config['LOG_LEVEL'] = os.environ.get('LOG_LEVEL', 'INFO')
app.config['LOG_FILE'] = os.environ.get('LOG_FILE', 'logs/causalytics.log')

# Import db from models and initialize it
from models import db  # noqa: E402
db.init_app(app)

# Initialize Flask-Migrate for database migrations
from flask_migrate import Migrate
migrate = Migrate(app, db)

# Initialize logging
from utils.logging_config import setup_logging
setup_logging(app)

# Initialize Flask-Limiter for rate limiting
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=os.environ.get(
        'RATE_LIMIT_DEFAULT',
        '200 per day, 50 per hour'
    ).split(', '),
    storage_uri=os.environ.get('REDIS_URL', 'memory://'),
    headers_enabled=True
)

# Make limiter available to blueprints
app.limiter = limiter

# Make limiter available to routes package
from routes import set_limiter
set_limiter(limiter)

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

# Apply rate limiting to auth blueprint
# This applies a default limit to all routes in the auth blueprint
# Specific routes can override this limit if needed
limiter.shared_limit("5 per minute", scope="auth", per_method=True)


# Request logging middleware
@app.before_request
def log_request_info():
    """Log request information for all requests."""
    app.logger.debug(
        f'Request: {request.method} {request.path} - '
        f'IP: {request.remote_addr} - '
        f'User-Agent: {request.headers.get("User-Agent", "Unknown")}'
    )


@app.after_request
def log_response_info(response):
    """Log response information."""
    app.logger.info(
        f'Response: {request.method} {request.path} - '
        f'Status: {response.status_code} - '
        f'IP: {request.remote_addr}'
    )
    return response


# Error handling middleware
@app.errorhandler(404)
def not_found(error):
    app.logger.warning(f'404 Not Found: {request.path} from {request.remote_addr}')
    return jsonify({'error': 'Resource not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    app.logger.error(f'500 Internal Server Error: {request.path} - {str(error)}', exc_info=True)
    db.session.rollback()
    return jsonify({'error': 'Internal server error'}), 500


@app.errorhandler(429)
def ratelimit_handler(e):
    app.logger.warning(f'Rate limit exceeded: {request.path} from {request.remote_addr}')
    return jsonify({
        'error': 'Rate limit exceeded',
        'message': str(e.description)
    }), 429


@app.errorhandler(Exception)
def handle_exception(e):
    app.logger.error(f'Unhandled exception: {request.path} - {str(e)}', exc_info=True)
    return jsonify({'error': 'An unexpected error occurred'}), 500


@app.route('/')
def index():
    app.logger.info('Index endpoint accessed')
    return "Hello, Causalytics AI is running!"


@app.route('/health')
@limiter.exempt  # Health checks should not be rate limited
def health():
    return {
        "status": "healthy",
        "message": "Causalytics API is running"
    }

if __name__ == "__main__":
    # Note: For production, use 'flask db upgrade' to apply migrations
    # db.create_all() is kept for backward compatibility in development
    # In production, always use: flask db upgrade
    app.run(debug=True, port=5001)
