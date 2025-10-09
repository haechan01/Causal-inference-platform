# Causal Inference Platform

A Flask-based API for causal inference analysis with JWT authentication.

## Quick Start

1. **Set up environment variables:**
   ```bash
   cp backend/env.example backend/.env
   # Edit backend/.env with your database credentials and secret keys
   ```

2. **Generate secret keys:**
   ```bash
   cd backend
   python generate_secret_key.py
   ```

3. **Install dependencies:**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

4. **Initialize database:**
   ```bash
   python init_db.py
   ```

5. **Run the server:**
   ```bash
   python app.py
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user info

### Analysis
- `POST /api/analysis/did` - Run Difference-in-Differences analysis

## Testing

Run the test script to verify the API:
```bash
python test_auth.py
```

## Documentation

- [Backend API Documentation](backend/API_DOCUMENTATION.md)
- [Frontend Token Storage Guide](frontend/TOKEN_STORAGE_GUIDE.md)
