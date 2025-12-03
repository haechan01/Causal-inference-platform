"""
Flask application initialization and configuration.
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Import configuration
from config import get_config

# Get configuration based on FLASK_ENV
config_class = get_config()

app = Flask(__name__)
app.config.from_object(config_class)

# Initialize configuration (runs validation and sets computed values)
config_class.init_app(app)

# Validate required configuration
if not app.config.get('SECRET_KEY'):
    raise ValueError("SECRET_KEY environment variable is not set")
if not app.config.get('JWT_SECRET_KEY'):
    raise ValueError("JWT_SECRET_KEY environment variable is not set")

# --- CORS Configuration ---
CORS(app, origins=app.config.get('CORS_ORIGINS', ['http://localhost:3000']))

# Initialize JWT
jwt = JWTManager(app)

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
    default_limits=app.config.get(
        'RATE_LIMIT_DEFAULT',
        '200 per day, 50 per hour'
    ).split(', '),
    storage_uri=app.config.get('REDIS_URL', 'memory://'),
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
    # Debug mode is controlled by FLASK_ENV and config
    app.run(debug=app.config.get('DEBUG', False), port=5001)
