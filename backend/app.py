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
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

# --- JWT Configuration ---
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'dev-jwt-secret-change-in-production')

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

# Use SQLite for development if PostgreSQL config is not complete
if not all([DB_USER, DB_PASSWORD, DB_NAME]):
    print("⚠️  PostgreSQL config incomplete, using SQLite for development")
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db'
else:
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
    with app.app_context():
        db.create_all()  # Create tables
    app.run(debug=True, port=5001)
