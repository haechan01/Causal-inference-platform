# Causal Analysis Platform

A full-stack causal analysis platform with JWT authentication.

## Quick Start

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Generate secrets
python generate_secret_key.py

# Configure .env
cp env.example .env  # Edit with your secrets

# Initialize database
python init_db.py

# Start server
python app.py
```

### Frontend Setup

```bash
cd frontend
npm install
npm start
```

## Documentation

- **[Backend Documentation](backend/README.md)** - Backend setup, API overview, and development guide
- **[API Reference](backend/API_DOCUMENTATION.md)** - Complete API endpoint documentation
- **[Frontend Token Guide](frontend/TOKEN_STORAGE_GUIDE.md)** - JWT token storage and authentication

## Tech Stack

**Backend:**
- Flask (Python)
- PostgreSQL
- JWT Authentication
- SQLAlchemy ORM

**Frontend:**
- React (TypeScript)
- Axios for API calls

## Project Structure

```
causal-platform/
├── backend/
│   ├── app.py              # Main Flask app
│   ├── models.py           # Database models
│   ├── routes/             # API endpoints
│   └── utils/              # Helpers & middleware
└── frontend/
    └── src/                # React app
```

## Key Features

- ✅ JWT-based authentication
- ✅ User registration & login
- ✅ Password hashing
- ✅ Protected API routes
- ✅ Token refresh mechanism
- ✅ Causal analysis (DiD)

## Security

- All secrets managed via environment variables
- Passwords hashed with Werkzeug
- JWT tokens with expiration
- CORS configured

## License

MIT

