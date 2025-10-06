from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
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
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY')
if not app.config['SECRET_KEY']:
    raise ValueError("SECRET_KEY environment variable is not set")

# --- JWT Configuration ---
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY')
if not app.config['JWT_SECRET_KEY']:
    raise ValueError("JWT_SECRET_KEY environment variable is not set")

# Token expiration settings
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(
    seconds=int(os.environ.get('JWT_ACCESS_TOKEN_EXPIRES', 3600))
)
app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(
    seconds=int(os.environ.get('JWT_REFRESH_TOKEN_EXPIRES', 2592000))
)

# Initialize JWT
jwt = JWTManager(app)

# --- Database Configuration ---
DB_USER = os.environ.get('DB_USER')
DB_PASSWORD = os.environ.get('DB_PASSWORD')
DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME')

# Validate required database configuration
if not all([DB_USER, DB_PASSWORD, DB_NAME]):
    raise ValueError(
        "Database configuration incomplete. "
        "Set DB_USER, DB_PASSWORD, and DB_NAME environment variables"
    )

app.config['SQLALCHEMY_DATABASE_URI'] = (
    f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:"
    f"{DB_PORT}/{DB_NAME}"
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize the database
db = SQLAlchemy(app)

# Import blueprints after db initialization
# Models are imported within routes to avoid circular imports
from routes.analysis import analysis_bp  # noqa: E402
from routes.auth import auth_bp  # noqa: E402

# API Routes (Blueprints)
app.register_blueprint(auth_bp)
app.register_blueprint(analysis_bp)


@app.route('/')
def index():
    return "Hello, Causalytics AI is running!"


@app.route('/health')
def health():
    return {
        "status": "healthy",
        "message": "Causalytics API is running"
    }


if __name__ == "__main__":
    app.run(debug=True, port=5001)
