"""
Database models for the causal inference platform.
"""
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash

# Create db instance that will be initialized by app.py
db = SQLAlchemy()


class User(db.Model):
    """User model for authentication and user management."""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    projects = db.relationship('Project', backref='owner', lazy=True)
    
    def verify_password(self, password):
        """Verify a password against the stored hash."""
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        """Convert user to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'is_admin': self.is_admin,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<User {self.username}>'


class Project(db.Model):
    """Project model for organizing datasets and analyses."""
    __tablename__ = 'projects'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    datasets = db.relationship('Dataset', backref='project', lazy=True)
    analyses = db.relationship('Analysis', backref='project', lazy=True)
    
    def to_dict(self):
        """Convert project to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'user_id': self.user_id,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<Project {self.name}>'


class Dataset(db.Model):
    """Dataset model for storing uploaded data files."""
    __tablename__ = 'datasets'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    file_path = db.Column(db.String(500), nullable=False)
    file_size = db.Column(db.Integer)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    analyses = db.relationship('Analysis', backref='dataset', lazy=True)
    
    def to_dict(self):
        """Convert dataset to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'name': self.name,
            'filename': self.filename,
            'file_path': self.file_path,
            'file_size': self.file_size,
            'project_id': self.project_id,
            'uploaded_at': self.uploaded_at.isoformat() if self.uploaded_at else None
        }
    
    def __repr__(self):
        return f'<Dataset {self.name}>'


class Analysis(db.Model):
    """Analysis model for storing analysis results."""
    __tablename__ = 'analyses'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    analysis_type = db.Column(db.String(50), nullable=False)  # e.g., 'did', 'rdd', 'iv'
    status = db.Column(db.String(20), default='pending')  # pending, running, completed, failed
    parameters = db.Column(db.JSON)  # Store analysis parameters as JSON
    results = db.Column(db.JSON)  # Store analysis results as JSON
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    dataset_id = db.Column(db.Integer, db.ForeignKey('datasets.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    
    def to_dict(self):
        """Convert analysis to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'name': self.name,
            'analysis_type': self.analysis_type,
            'status': self.status,
            'parameters': self.parameters,
            'results': self.results,
            'project_id': self.project_id,
            'dataset_id': self.dataset_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }
    
    def __repr__(self):
        return f'<Analysis {self.name}>'
