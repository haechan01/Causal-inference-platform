# JWT Authentication

Simple JWT authentication system for the causal inference platform.

## Quick Start

1. **Install dependencies:**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **Run the server:**
   ```bash
   python app.py
   ```

3. **Test the API:**
   ```bash
   python test_jwt.py
   ```

## API Endpoints

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user  
- `GET /api/auth/me` - Get current user info (requires JWT token)

## Example Usage

```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "email": "test@example.com", "password": "password123"}'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "password123"}'

# Get user info (use token from login response)
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```
