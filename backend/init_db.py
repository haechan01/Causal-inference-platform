"""
Database initialization script

NOTE: This script is kept for backward compatibility.
For new setups, use Flask-Migrate instead:
    flask db upgrade

This script will create tables directly, but migrations are preferred
for version control and production deployments.
"""

from app import app, db

with app.app_context():
    # Import models to register them with SQLAlchemy
    # Must be done inside app context to avoid circular imports
    import models  # noqa: F401
    
    print("⚠️  WARNING: Using db.create_all() - migrations are preferred!")
    print("   For production, use: flask db upgrade\n")
    
    # Create all tables
    db.create_all()
    print("✓ Database tables created successfully!")
    print("\nTables created:")
    print("- users")
    print("- projects")
    print("- datasets")
    print("- analyses")
    print("\n💡 Next time, use 'flask db upgrade' instead for migrations.")


