#!/usr/bin/env python3
"""
Generate secure secret keys for Flask and JWT.
"""
import secrets

def generate_secret_key():
    """Generate a cryptographically secure secret key."""
    return secrets.token_urlsafe(64)

if __name__ == "__main__":
    print("Generated secret keys:")
    print(f"SECRET_KEY={generate_secret_key()}")
    print(f"JWT_SECRET_KEY={generate_secret_key()}")
    print("\nCopy these to your .env file!")
