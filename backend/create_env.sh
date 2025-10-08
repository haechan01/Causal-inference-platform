#!/bin/bash
# Quick script to create .env file with generated secrets

echo "Creating .env file with secure secret keys..."

# Generate two different secret keys
SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(64))")
JWT_SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(64))")

# Create .env file
cat > .env << EOF
# Flask Configuration
FLASK_ENV=development
FLASK_DEBUG=True
SECRET_KEY='${SECRET_KEY}'

# JWT Configuration
JWT_SECRET_KEY='${JWT_SECRET_KEY}'

# Database Configuration
DB_USER=causalytics_user
DB_PASSWORD=your_database_password_here
DB_HOST=localhost
DB_PORT=5432
DB_NAME=causalytics_db

# Token Expiration (in seconds)
JWT_ACCESS_TOKEN_EXPIRES=3600
JWT_REFRESH_TOKEN_EXPIRES=2592000

# CORS Configuration
CORS_ORIGINS=http://localhost:3000
EOF

echo "✓ .env file created successfully!"
echo ""
echo "⚠️  IMPORTANT: Edit .env and update DB_PASSWORD with your actual database password"
echo ""
echo "Generated secrets:"
echo "SECRET_KEY='${SECRET_KEY}'"
echo "JWT_SECRET_KEY='${JWT_SECRET_KEY}'"
echo ""
echo "Your .env file is ready at: $(pwd)/.env"

