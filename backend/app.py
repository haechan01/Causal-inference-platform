import os
from datetime import timedelta
from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)

# Configure CORS
cors_origins = os.getenv('CORS_ORIGINS', 'http://localhost:3000').split(',')
CORS(app, origins=cors_origins)

# Configure database
app.config['SQLALCHEMY_DATABASE_URI'] = (
    f"postgresql://{os.getenv('DB_USER', 'postgres')}:"
    f"{os.getenv('DB_PASSWORD', 'password')}@"
    f"{os.getenv('DB_HOST', 'localhost')}:"
    f"{os.getenv('DB_PORT', '5432')}/"
    f"{os.getenv('DB_NAME', 'causal_platform')}"
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize database
db = SQLAlchemy(app)

# Configure JWT
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY')

# Validate required environment variables
if not app.config['SECRET_KEY']:
    raise ValueError("SECRET_KEY environment variable is required")
if not app.config['JWT_SECRET_KEY']:
    raise ValueError("JWT_SECRET_KEY environment variable is required")

# Configure JWT token expiration
try:
    access_expires_seconds = int(os.getenv('JWT_ACCESS_TOKEN_EXPIRES', '3600'))
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(seconds=access_expires_seconds)
except (ValueError, TypeError):
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=1)  # Default to 1 hour

try:
    refresh_expires_seconds = int(os.getenv('JWT_REFRESH_TOKEN_EXPIRES', '2592000'))
    app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(seconds=refresh_expires_seconds)
except (ValueError, TypeError):
    app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(days=30)  # Default to 30 days

# Initialize JWT
jwt = JWTManager(app)

# Import and register blueprints
from routes.analysis import analysis_bp
from routes.auth import auth_bp

app.register_blueprint(analysis_bp)
app.register_blueprint(auth_bp)

if __name__ == "__main__":
    app.run(debug=True, port=5001)
