"""
Migration script to add user_id column to datasets table using Flask-SQLAlchemy.
Run this script to update your database schema.
"""

import sys
sys.path.insert(0, '.')

from app import app, db
from sqlalchemy import text

def run_migration():
    """Add user_id column to datasets table if it doesn't exist."""
    
    with app.app_context():
        # Check if user_id column exists
        result = db.session.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'datasets' AND column_name = 'user_id';
        """))
        
        if result.fetchone() is None:
            print("Adding user_id column to datasets table...")
            
            try:
                # Add user_id column (initially nullable to handle existing data)
                db.session.execute(text("""
                    ALTER TABLE datasets 
                    ADD COLUMN user_id INTEGER;
                """))
                db.session.commit()
                print("  - Added user_id column")
                
                # Check if there are any datasets
                result = db.session.execute(text("SELECT COUNT(*) FROM datasets;"))
                count = result.fetchone()[0]
                
                if count > 0:
                    print(f"  - Found {count} existing datasets. Updating with user_id from projects...")
                    
                    # Update existing datasets: get user_id from their associated project
                    db.session.execute(text("""
                        UPDATE datasets d
                        SET user_id = p.user_id
                        FROM projects p
                        WHERE d.project_id = p.id AND d.user_id IS NULL;
                    """))
                    db.session.commit()
                    
                    # For any datasets without a project, assign to first user
                    db.session.execute(text("""
                        UPDATE datasets
                        SET user_id = (SELECT id FROM users LIMIT 1)
                        WHERE user_id IS NULL;
                    """))
                    db.session.commit()
                
                # Now make the column NOT NULL
                db.session.execute(text("""
                    ALTER TABLE datasets 
                    ALTER COLUMN user_id SET NOT NULL;
                """))
                db.session.commit()
                print("  - Set user_id as NOT NULL")
                
                # Add foreign key constraint
                db.session.execute(text("""
                    ALTER TABLE datasets 
                    ADD CONSTRAINT fk_datasets_user_id 
                    FOREIGN KEY (user_id) REFERENCES users(id);
                """))
                db.session.commit()
                print("  - Added foreign key constraint")
                
                print("\n✅ Migration completed successfully!")
                
            except Exception as e:
                db.session.rollback()
                print(f"\n❌ Migration failed: {e}")
                print("\nAlternative: You may need to run this SQL manually in your database admin:")
                print("""
ALTER TABLE datasets ADD COLUMN user_id INTEGER;
UPDATE datasets d SET user_id = p.user_id FROM projects p WHERE d.project_id = p.id;
UPDATE datasets SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE datasets ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE datasets ADD CONSTRAINT fk_datasets_user_id FOREIGN KEY (user_id) REFERENCES users(id);
                """)
                raise
        else:
            print("✅ user_id column already exists in datasets table. No migration needed.")

if __name__ == "__main__":
    print("=" * 50)
    print("Database Migration: Add user_id to datasets")
    print("=" * 50)
    run_migration()
