# Causalytics Backend API

A Flask-based REST API with JWT authentication for causal analysis platform.

## Features

- ✅ **User Authentication** with JWT tokens
- ✅ **Password Hashing** using Werkzeug
- ✅ **PostgreSQL Database** with SQLAlchemy ORM
- ✅ **Protected Routes** with JWT middleware
- ✅ **Token Refresh** mechanism
- ✅ **CORS** enabled for frontend integration

## Tech Stack

- **Flask** - Web framework
- **Flask-JWT-Extended** - JWT authentication
- **Flask-SQLAlchemy** - Database ORM
- **PostgreSQL** - Database
- **Werkzeug** - Password hashing
- **pandas**, **statsmodels** - Data analysis

## Project Structure

```
backend/
├── app.py                  # Main Flask application
├── models.py              # Database models
├── init_db.py            # Database initialization script
├── test_auth.py          # Authentication test script
├── requirements.txt       # Python dependencies
├── routes/
│   ├── auth.py           # Authentication endpoints
│   └── analysis.py       # Analysis endpoints
└── utils/
    ├── auth_middleware.py # Auth middleware & decorators
    └── did_analysis.py    # DiD analysis functions
```

## Setup Instructions

### 1. Prerequisites

- Python 3.8+
- PostgreSQL database running
- Virtual environment (recommended)

### 2. Install Dependencies

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure Database

Update the database configuration in `app.py`:

```python
DB_USER = 'your_username'
DB_PASSWORD = 'your_password'
DB_HOST = 'localhost'
DB_PORT = '5432'
DB_NAME = 'your_database'
```

### 4. Set JWT Secret Key

**Important:** Set a secure JWT secret key in production!

```bash
export JWT_SECRET_KEY='your-super-secret-key-here'
```

Or update in `app.py` (not recommended for production):

```python
app.config['JWT_SECRET_KEY'] = 'your-super-secret-key-here'
```

### 5. Initialize Database

```bash
python init_db.py
```

This creates all necessary tables:
- `users` - User accounts
- `projects` - User projects
- `datasets` - Uploaded datasets
- `analyses` - Analysis results

### 6. Run the Application

```bash
python app.py
```

The API will be available at `http://localhost:5001`

## API Endpoints

### Authentication (`/api/auth`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/register` | Register new user | No |
| POST | `/login` | Login user | No |
| POST | `/refresh` | Refresh access token | Refresh Token |
| GET | `/me` | Get current user info | Access Token |
| POST | `/logout` | Logout user | Access Token |

### Analysis (`/api/analysis`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/did` | Run DiD analysis | Access Token |

For detailed API documentation, see [API_DOCUMENTATION.md](API_DOCUMENTATION.md)

## Testing

### Manual Testing

1. Start the Flask app:
```bash
python app.py
```

2. Run the test script (in a new terminal):
```bash
python test_auth.py
```

### Using cURL

**Register:**
```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "email": "john@example.com",
    "password": "SecurePass123"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123"
  }'
```

**Get Current User:**
```bash
curl -X GET http://localhost:5001/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Authentication Flow

```
1. User registers/logs in
   ↓
2. Server returns access_token (1 hour) + refresh_token (30 days)
   ↓
3. Client stores tokens securely
   ↓
4. Client includes access_token in Authorization header for API requests
   ↓
5. When access_token expires, use refresh_token to get new access_token
   ↓
6. When refresh_token expires, user must log in again
```

## Security Best Practices

### For Development
- ✅ Passwords are hashed with Werkzeug
- ✅ JWT tokens expire (1 hour for access, 30 days for refresh)
- ✅ Protected routes require valid JWT
- ✅ Email validation and password strength requirements

### For Production
- [ ] Use environment variables for all secrets
- [ ] Enable HTTPS only
- [ ] Implement rate limiting
- [ ] Add token blacklisting for logout
- [ ] Use httpOnly cookies for refresh tokens
- [ ] Enable CSRF protection
- [ ] Add input sanitization
- [ ] Implement logging and monitoring
- [ ] Use a production-grade WSGI server (gunicorn, uwsgi)

## Database Models

### User
```python
- id: Integer (Primary Key)
- username: String(80) (Unique)
- email: String(120) (Unique)
- password_hash: String(255)
- created_at: DateTime
- projects: Relationship to Project
```

### Project
```python
- id: Integer (Primary Key)
- user_id: Foreign Key (users.id)
- name: String(120)
- description: Text
- datasets: Relationship to Dataset
- analyses: Relationship to Analysis
```

### Dataset
```python
- id: Integer (Primary Key)
- project_id: Foreign Key (projects.id)
- file_name: String(255)
- s3_key: String(255) (Unique)
- schema_info: JSON
```

### Analysis
```python
- id: Integer (Primary Key)
- project_id: Foreign Key (projects.id)
- dataset_id: Foreign Key (datasets.id)
- method: String(50)
- status: String(20)
- config: JSON
- results: JSON
- ai_summary: Text
```

## Token Configuration

- **Access Token**: 1 hour expiration
- **Refresh Token**: 30 days expiration

To modify, edit `app.py`:
```python
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=1)
app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(days=30)
```

## Protecting Routes

To protect a route, use the `@jwt_required()` decorator:

```python
from flask_jwt_extended import jwt_required, get_jwt_identity

@app.route('/protected')
@jwt_required()
def protected():
    current_user_id = get_jwt_identity()
    # Your code here
    return {"message": "Success"}
```

For custom protection (e.g., project ownership):

```python
from utils.auth_middleware import project_access_required

@app.route('/projects/<int:project_id>')
@jwt_required()
@project_access_required('project_id')
def get_project(project_id):
    # Only accessible by project owner
    return {"message": "Success"}
```

## Error Handling

All errors return JSON with this format:

```json
{
  "error": "Description of the error"
}
```

Common status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict (duplicate)
- `500` - Internal Server Error

## Troubleshooting

### Database Connection Error
- Ensure PostgreSQL is running
- Verify database credentials in `app.py`
- Check if database exists

### Token Expired Error
- Access tokens expire after 1 hour
- Use refresh token to get new access token
- If refresh token expired, log in again

### Import Errors
- Make sure you're in the virtual environment
- Run `pip install -r requirements.txt`

## Development

### Adding New Routes

1. Create a new blueprint in `routes/` directory
2. Import and register in `app.py`:
```python
from routes.my_route import my_bp
app.register_blueprint(my_bp)
```

### Adding New Models

1. Add model class to `models.py`
2. Run `python init_db.py` to create tables

## License

MIT License - see LICENSE file for details

## Support

For questions or issues, please open an issue on GitHub.


