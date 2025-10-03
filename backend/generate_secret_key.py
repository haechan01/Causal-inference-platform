"""
Generate a secure JWT secret key
Run this script and copy the output to your .env file
"""

import secrets
import string

def generate_secret_key(length=64):
    """Generate a cryptographically secure random string"""
    alphabet = string.ascii_letters + string.digits + string.punctuation
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def generate_hex_key(length=32):
    """Generate a hexadecimal secret key"""
    return secrets.token_hex(length)

def generate_urlsafe_key(length=64):
    """Generate a URL-safe secret key"""
    return secrets.token_urlsafe(length)


if __name__ == "__main__":
    print("=" * 70)
    print("SECURE JWT SECRET KEY GENERATOR")
    print("=" * 70)
    print("\nChoose ONE of these keys for your JWT_SECRET_KEY:\n")
    
    print("Option 1 (Recommended - URL Safe):")
    print(f"JWT_SECRET_KEY='{generate_urlsafe_key(64)}'")
    
    print("\nOption 2 (Hexadecimal):")
    print(f"JWT_SECRET_KEY='{generate_hex_key(32)}'")
    
    print("\nOption 3 (Mixed Characters):")
    print(f"JWT_SECRET_KEY='{generate_secret_key(64)}'")
    
    print("\n" + "=" * 70)
    print("INSTRUCTIONS:")
    print("1. Copy one of the keys above")
    print("2. Add it to your .env file")
    print("3. NEVER commit this key to version control")
    print("4. Use different keys for dev, staging, and production")
    print("=" * 70)

