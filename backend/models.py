from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash
from datetime import datetime

# Initialize db here to avoid circular imports
db = SQLAlchemy()


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow
    )
    projects = db.relationship('Project', backref='owner', lazy=True)

    def verify_password(self, password):
        """Verify a password against the hash"""
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        """Convert user to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'created_at': (
                self.created_at.isoformat() if self.created_at else None
            )
        }

    def __repr__(self):
        return f'<User {self.username}>'


class Project(db.Model):
    __tablename__ = 'projects'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey('users.id'), nullable=False
    )
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=True)
    
    # Progress tracking fields
    current_step = db.Column(db.String(50), nullable=True, default='projects')  # projects, method, variables, results
    selected_method = db.Column(db.String(50), nullable=True)  # did, rdd, iv
    analysis_config = db.Column(db.JSON, nullable=True)  # Stores variable selections, time periods, etc.
    last_results = db.Column(db.JSON, nullable=True)  # Stores last analysis results
    updated_at = db.Column(db.DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    datasets = db.relationship('Dataset', backref='project', lazy=True)
    analyses = db.relationship('Analysis', backref='project', lazy=True)
    
    def to_dict(self):
        """Convert project to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'user_id': self.user_id,
            'current_step': self.current_step,
            'selected_method': self.selected_method,
            'analysis_config': self.analysis_config,
            'last_results': self.last_results,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'datasets_count': len(self.datasets),
            'analyses_count': len(self.analyses)
        }


class Dataset(db.Model):
    __tablename__ = 'datasets'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey('users.id'), nullable=False
    )
    project_id = db.Column(
        db.Integer, db.ForeignKey('projects.id'), nullable=True  # Now nullable
    )
    name = db.Column(db.String(255), nullable=False)  # User-friendly name
    file_name = db.Column(db.String(255), nullable=False)
    s3_key = db.Column(db.String(255), unique=True, nullable=False)
    schema_info = db.Column(db.JSON, nullable=True)
    created_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow
    )
    
    # Relationship to user
    user = db.relationship('User', backref='datasets', lazy=True)
    
    def to_dict(self):
        """Convert dataset to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'project_id': self.project_id,
            'name': self.name,
            'file_name': self.file_name,
            's3_key': self.s3_key,
            'schema_info': self.schema_info,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Analysis(db.Model):
    __tablename__ = 'analyses'
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(
        db.Integer, db.ForeignKey('projects.id'), nullable=False
    )
    dataset_id = db.Column(
        db.Integer, db.ForeignKey('datasets.id'), nullable=False
    )
    method = db.Column(db.String(50), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='pending')
    config = db.Column(db.JSON, nullable=True)
    results = db.Column(db.JSON, nullable=True)
    ai_summary = db.Column(db.Text, nullable=True)
