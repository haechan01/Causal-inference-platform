#!/usr/bin/env python3
"""
Initialize the database with all tables.
Run this to create all database tables
"""
from app import app, db
import models  # noqa: F401

with app.app_context():
    db.create_all()
    print("Database tables created successfully!")
