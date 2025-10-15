"""
Project and file upload routes.
Handles project creation and CSV file uploads to S3.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
import os
import uuid
import boto3
from models import db

# Create blueprint
projects_bp = Blueprint('projects', __name__, url_prefix='/api/projects')

# Get S3 configuration from environment
AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY')
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
S3_BUCKET_NAME = os.environ.get('AWS_S3_BUCKET_NAME')

# Configure S3 client
s3_client = boto3.client(
    's3',
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_REGION
)


@projects_bp.route('', methods=['POST'])
@jwt_required()
def create_project():
    """
    Create a new project for the authenticated user.
    
    Expected JSON:
    {
        "name": "Project Name",
        "description": "Optional description"
    }
    """
    try:
        # Get current user
        current_user_id = int(get_jwt_identity())
        
        # Import models locally to avoid circular imports
        from models import Project
        
        # Get project data from request
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        
        if not name:
            return jsonify({"error": "Project name is required"}), 400
        
        # Create new project
        new_project = Project(
            user_id=current_user_id,
            name=name,
            description=description
        )
        
        db.session.add(new_project)
        db.session.commit()
        
        return jsonify({
            "message": "Project created successfully",
            "project": {
                "id": new_project.id,
                "name": new_project.name,
                "description": new_project.description,
                "user_id": new_project.user_id
            }
        }), 201
        
    except ValueError as e:
        return jsonify({"error": "Invalid token identity"}), 401
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Project creation failed: {str(e)}"}), 500


@projects_bp.route('/<int:project_id>', methods=['GET'])
@jwt_required()
def get_project(project_id):
    """
    Get project details by ID.
    """
    try:
        # Get current user
        current_user_id = int(get_jwt_identity())
        
        # Import models locally to avoid circular imports
        from models import Project
        
        # Get project
        project = Project.query.get(project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404
        
        # Check if user has access to this project
        if project.user_id != current_user_id:
            return jsonify({"error": "Access denied"}), 403
        
        return jsonify({
            "project": {
                "id": project.id,
                "name": project.name,
                "description": project.description,
                "user_id": project.user_id,
                "datasets_count": len(project.datasets),
                "analyses_count": len(project.analyses)
            }
        }), 200
        
    except ValueError as e:
        return jsonify({"error": "Invalid token identity"}), 401
    except Exception as e:
        return jsonify({"error": f"Failed to get project: {str(e)}"}), 500


@projects_bp.route('', methods=['GET'])
@jwt_required()
def list_projects():
    """
    List all projects for the authenticated user.
    """
    try:
        # Get current user
        current_user_id = int(get_jwt_identity())
        
        # Import models locally to avoid circular imports
        from models import Project
        
        # Get user's projects
        projects = Project.query.filter_by(user_id=current_user_id).all()
        
        projects_data = []
        for project in projects:
            projects_data.append({
                "id": project.id,
                "name": project.name,
                "description": project.description,
                "datasets_count": len(project.datasets),
                "analyses_count": len(project.analyses)
            })
        
        return jsonify({
            "projects": projects_data,
            "count": len(projects_data)
        }), 200
        
    except ValueError as e:
        return jsonify({"error": "Invalid token identity"}), 401
    except Exception as e:
        return jsonify({"error": f"Failed to list projects: {str(e)}"}), 500


@projects_bp.route('/<int:project_id>/upload', methods=['POST'])
@jwt_required()
def upload_file(project_id):
    """
    Upload a CSV file to S3 for a specific project.
    Requires authentication and valid project access.
    
    Expected form data:
    - file: CSV file to upload
    """
    try:
        # Get current user
        current_user_id = int(get_jwt_identity())
        
        # Import models locally to avoid circular imports
        from models import Dataset, Project
        
        # Check if project exists and user has access
        project = Project.query.get(project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404
        
        # Check if user has access to this project
        if project.user_id != current_user_id:
            return jsonify({"error": "Access denied"}), 403
        
        # Validate file upload
        if 'file' not in request.files:
            return jsonify({"error": "No file part in the request"}), 400

        file = request.files['file']
        
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Validate file type (only allow CSV files)
        if not file.filename.lower().endswith('.csv'):
            return jsonify({"error": "Only CSV files are allowed"}), 400
        
        # Validate file size (limit to 10MB)
        file.seek(0, 2)  # Seek to end
        file_size = file.tell()
        file.seek(0)  # Reset to beginning
        
        if file_size > 10 * 1024 * 1024:  # 10MB limit
            return jsonify({"error": "File size too large. Maximum size is 10MB"}), 400
        
        # Create unique filename to avoid overwrites
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        s3_key = f"uploads/project_{project_id}/{unique_filename}"
        
        # Upload file to S3
        s3_client.upload_fileobj(
            file,
            S3_BUCKET_NAME,
            s3_key,
            ExtraArgs={
                'ContentType': 'text/csv',
                'Metadata': {
                    'original-filename': file.filename,
                    'project-id': str(project_id),
                    'uploaded-by': str(current_user_id)
                }
            }
        )
        
        # Save metadata to database
        new_dataset = Dataset(
            project_id=project_id,
            file_name=file.filename,
            s3_key=s3_key
        )
        
        db.session.add(new_dataset)
        db.session.commit()
        
        return jsonify({
            "message": "File uploaded successfully",
            "dataset_id": new_dataset.id,
            "file_name": file.filename,
            "file_size": file_size,
            "s3_key": s3_key
        }), 201
        
    except ValueError as e:
        return jsonify({"error": "Invalid token identity"}), 401
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500


@projects_bp.route('/<int:project_id>/datasets', methods=['GET'])
@jwt_required()
def list_datasets(project_id):
    """
    List all datasets for a specific project.
    """
    try:
        # Get current user
        current_user_id = int(get_jwt_identity())
        
        # Import models locally to avoid circular imports
        from models import Project, Dataset
        
        # Check if project exists and user has access
        project = Project.query.get(project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404
        
        # Check if user has access to this project
        if project.user_id != current_user_id:
            return jsonify({"error": "Access denied"}), 403
        
        # Get datasets for this project
        datasets = Dataset.query.filter_by(project_id=project_id).all()
        
        datasets_data = []
        for dataset in datasets:
            datasets_data.append(dataset.to_dict())
        
        return jsonify({
            "datasets": datasets_data,
            "count": len(datasets_data)
        }), 200
        
    except ValueError as e:
        return jsonify({"error": "Invalid token identity"}), 401
    except Exception as e:
        return jsonify({"error": f"Failed to list datasets: {str(e)}"}), 500
