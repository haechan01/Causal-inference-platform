"""
Migration script to create project_datasets junction table for many-to-many relationship.
This allows multiple projects to share the same dataset.
Run this script to update your database schema.
"""

import sys
sys.path.insert(0, '.')

from app import app, db
from sqlalchemy import text

def run_migration():
    """Create project_datasets junction table and migrate existing relationships."""
    
    with app.app_context():
        # Check if junction table already exists
        result = db.session.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'project_datasets';
        """))
        
        if result.fetchone() is None:
            print("Creating project_datasets junction table...")
            
            try:
                # Create the junction table
                db.session.execute(text("""
                    CREATE TABLE project_datasets (
                        project_id INTEGER NOT NULL,
                        dataset_id INTEGER NOT NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (project_id, dataset_id),
                        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                        FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
                    );
                """))
                db.session.commit()
                print("  - Created project_datasets junction table")
                
                # Migrate existing relationships from project_id to junction table
                result = db.session.execute(text("""
                    SELECT COUNT(*) FROM datasets WHERE project_id IS NOT NULL;
                """))
                count = result.fetchone()[0]
                
                if count > 0:
                    print(f"  - Found {count} existing dataset-project relationships. Migrating to junction table...")
                    
                    # Insert existing relationships into junction table
                    db.session.execute(text("""
                        INSERT INTO project_datasets (project_id, dataset_id, created_at)
                        SELECT project_id, id, created_at
                        FROM datasets
                        WHERE project_id IS NOT NULL
                        ON CONFLICT (project_id, dataset_id) DO NOTHING;
                    """))
                    db.session.commit()
                    print(f"  - Migrated {count} relationships to junction table")
                
                print("\n✅ Migration completed successfully!")
                print("   Note: The project_id column in datasets table is kept for backward compatibility.")
                print("   New dataset-project links will use the junction table.")
                
            except Exception as e:
                db.session.rollback()
                print(f"\n❌ Migration failed: {e}")
                print("\nAlternative: You may need to run this SQL manually in your database admin:")
                print("""
CREATE TABLE project_datasets (
    project_id INTEGER NOT NULL,
    dataset_id INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, dataset_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
);

INSERT INTO project_datasets (project_id, dataset_id, created_at)
SELECT project_id, id, created_at
FROM datasets
WHERE project_id IS NOT NULL;
                """)
                raise
        else:
            print("✅ project_datasets junction table already exists. No migration needed.")

if __name__ == "__main__":
    print("=" * 50)
    print("Database Migration: Create project_datasets junction table")
    print("=" * 50)
    run_migration()
