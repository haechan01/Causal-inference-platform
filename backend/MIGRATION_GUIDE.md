# Database Migration Guide

This guide explains how to use Flask-Migrate for database schema management.

## Why Migrations?

- ✅ **Version Control**: Track all database changes in git
- ✅ **Team Collaboration**: Everyone has the same schema
- ✅ **Rollback**: Easily undo problematic changes
- ✅ **Production Safety**: Test migrations before deploying
- ✅ **History**: See what changed and when

## Quick Start

### First Time Setup

```bash
# Initialize migrations directory
flask db init

# Create initial migration from your models
flask db migrate -m "Initial migration"

# Apply the migration
flask db upgrade
```

### For Existing Databases

If you already have tables in your database:

```bash
# 1. Initialize migrations
flask db init

# 2. Create migration (will detect existing tables)
flask db migrate -m "Initial migration from existing schema"

# 3. Mark as already applied (since tables exist)
flask db stamp head

# 4. Verify
flask db current
```

## Daily Workflow

### Making Schema Changes

1. **Modify models** in `models.py`
2. **Create migration**: `flask db migrate -m "Description"`
3. **Review** the generated migration file
4. **Apply**: `flask db upgrade`
5. **Commit** to git

## Common Commands

```bash
# View current status
flask db current

# Show migration history
flask db history

# Apply all pending migrations
flask db upgrade

# Rollback one migration
flask db downgrade

# Create new migration
flask db migrate -m "Description of changes"
```

## Production Deployment

Always run migrations as part of deployment:

```bash
# Docker
docker-compose exec backend flask db upgrade

# Or in deployment script
flask db upgrade
```

## Troubleshooting

### Error: "must be owner of table"

**Solution**: Grant ownership or mark current state as baseline:
```bash
flask db stamp head
```

### "Target database is not up to date"
```bash
flask db upgrade
```

### "Can't locate revision identified by 'xyz'"
```bash
flask db current
flask db stamp head  # If needed
```

## Best Practices

- ✅ Review auto-generated migrations before applying
- ✅ Test migrations on a copy of production data
- ✅ Keep migrations small and focused
- ✅ Use descriptive migration messages
- ✅ Commit migrations to version control
- ✅ Run migrations as part of deployment process

## Resources

- [Flask-Migrate Documentation](https://flask-migrate.readthedocs.io/)
- [Alembic Documentation](https://alembic.sqlalchemy.org/)
