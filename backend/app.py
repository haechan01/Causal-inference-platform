from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from routes.analysis import analysis_bp
from routes.auth import auth_bp
from models import db

app = Flask(__name__)
CORS(app)

# Simple JWT configuration
app.config['JWT_SECRET_KEY'] = 'your-secret-key-change-in-production'  # Change this!
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = False  # No expiration for simplicity

# Database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db'  # Simple SQLite for now
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize extensions
jwt = JWTManager(app)
db.init_app(app)

# Register blueprints
app.register_blueprint(analysis_bp)
app.register_blueprint(auth_bp)

if __name__ == "__main__":
    with app.app_context():
        db.create_all()  # Create tables
    app.run(debug=True)
