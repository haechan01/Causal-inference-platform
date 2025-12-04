-- Manual migration to add project state tracking fields
-- Run this as a database admin user if the migration script fails due to permissions

-- Add current_step column (tracks which step user is on: projects, method, variables, results)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS current_step VARCHAR(50) DEFAULT 'projects';

-- Add selected_method column (tracks selected analysis method: did, rdd, iv)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS selected_method VARCHAR(50);

-- Add analysis_config column (stores variable selections and analysis settings)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS analysis_config JSONB;

-- Add last_results column (stores the last analysis results)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_results JSONB;

-- Add updated_at column (tracks when project was last modified)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

-- Optional: Create an index on updated_at for faster sorting
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC NULLS LAST);

