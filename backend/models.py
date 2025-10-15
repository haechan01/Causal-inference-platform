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
    datasets = db.relationship('Dataset', backref='project', lazy=True)
    analyses = db.relationship('Analysis', backref='project', lazy=True)


class Dataset(db.Model):
    __tablename__ = 'datasets'
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(
        db.Integer, db.ForeignKey('projects.id'), nullable=False
    )
    file_name = db.Column(db.String(255), nullable=False)
    s3_key = db.Column(db.String(255), unique=True, nullable=False)
    schema_info = db.Column(db.JSON, nullable=True)
    
    def to_dict(self):
        """Convert dataset to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'project_id': self.project_id,
            'file_name': self.file_name,
            's3_key': self.s3_key,
            'schema_info': self.schema_info
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
