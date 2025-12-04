"""
Migration script to add state tracking fields to projects table.
Run this script once to add the new columns.
"""
import os
import sys

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from models import db

def run_migration():
    """Add state tracking columns to projects table."""
    app = Flask(__name__)
    
    # Load environment variables
    from dotenv import load_dotenv
    load_dotenv()
    
    # Get PostgreSQL database credentials from environment
    DB_USER = os.environ.get('DB_USER')
    DB_PASSWORD = os.environ.get('DB_PASSWORD')
    DB_HOST = os.environ.get('DB_HOST', 'localhost')
    DB_PORT = os.environ.get('DB_PORT', '5432')
    DB_NAME = os.environ.get('DB_NAME')
    
    # Configure PostgreSQL database
    app.config['SQLALCHEMY_DATABASE_URI'] = (
        f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    db.init_app(app)
    
    with app.app_context():
        # Check if columns already exist
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        columns = [col['name'] for col in inspector.get_columns('projects')]
        
        migrations_needed = []
        
        if 'current_step' not in columns:
            migrations_needed.append(
                "ALTER TABLE projects ADD COLUMN current_step VARCHAR(50) DEFAULT 'projects'"
            )
        
        if 'selected_method' not in columns:
            migrations_needed.append(
                "ALTER TABLE projects ADD COLUMN selected_method VARCHAR(50)"
            )
        
        if 'analysis_config' not in columns:
            migrations_needed.append(
                "ALTER TABLE projects ADD COLUMN analysis_config JSONB"
            )
        
        if 'last_results' not in columns:
            migrations_needed.append(
                "ALTER TABLE projects ADD COLUMN last_results JSONB"
            )
        
        if 'updated_at' not in columns:
            migrations_needed.append(
                "ALTER TABLE projects ADD COLUMN updated_at TIMESTAMP"
            )
        
        if not migrations_needed:
            print("✓ All columns already exist. No migration needed.")
            return
        
        print(f"Running {len(migrations_needed)} migrations...")
        
        for sql in migrations_needed:
            try:
                db.session.execute(text(sql))
                print(f"  ✓ Executed: {sql[:50]}...")
            except Exception as e:
                print(f"  ✗ Error: {e}")
        
        db.session.commit()
        print("\n✓ Migration completed successfully!")


if __name__ == '__main__':
    run_migration()

