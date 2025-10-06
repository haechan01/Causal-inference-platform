"""
Database initialization script
Run this to create all database tables
"""

from app import app, db

with app.app_context():
    # Import models to register them with SQLAlchemy
    # Must be done inside app context to avoid circular imports
    import models  # noqa: F401
    
    # Create all tables
    db.create_all()
    print("✓ Database tables created successfully!")
    print("\nTables created:")
    print("- users")
    print("- projects")
    print("- datasets")
    print("- analyses")


