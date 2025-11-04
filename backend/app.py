from flask import Flask
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

app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(seconds=int(JWT_ACCESS_TOKEN_EXPIRES))
app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(seconds=int(JWT_REFRESH_TOKEN_EXPIRES))

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
    with app.app_context():
        db.create_all()  # Create tables
    app.run(debug=True, port=5001)
