# Causalytics API Documentation

## Overview
This API provides authentication and causal analysis functionality using JWT tokens for secure access.

## Base URL
```
http://localhost:5001
```

## Authentication

All authenticated endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <your_access_token>
```

---

## Authentication Endpoints

### 1. Register User
Create a new user account.

**Endpoint:** `POST /api/auth/register`

**Request Body:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Password Requirements:**
- At least 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

**Success Response (201):**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": 1,
    "username": "johndoe",
    "email": "john@example.com"
  },
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

**Error Responses:**
- `400`: Invalid input or missing fields
- `409`: Username or email already exists
- `500`: Server error

---

### 2. Login
Authenticate an existing user.

**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Success Response (200):**
```json
{
  "message": "Login successful",
  "user": {
    "id": 1,
    "username": "johndoe",
    "email": "john@example.com"
  },
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

**Error Responses:**
- `400`: Missing email or password
- `401`: Invalid credentials
- `500`: Server error

---

### 3. Refresh Token
Get a new access token using a refresh token.

**Endpoint:** `POST /api/auth/refresh`

**Headers:**
```
Authorization: Bearer <refresh_token>
```

**Success Response (200):**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

**Error Responses:**
- `401`: Invalid or expired refresh token
- `404`: User not found
- `500`: Server error

---

### 4. Get Current User
Get information about the currently authenticated user.

**Endpoint:** `GET /api/auth/me`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Success Response (200):**
```json
{
  "user": {
    "id": 1,
    "username": "johndoe",
    "email": "john@example.com"
  }
}
```

**Error Responses:**
- `401`: Invalid or expired token
- `404`: User not found
- `500`: Server error

---

### 5. Logout
Logout the current user.

**Endpoint:** `POST /api/auth/logout`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Success Response (200):**
```json
{
  "message": "Logout successful. Please remove the token from client."
}
```

**Note:** The client should remove the stored tokens. For production, implement token blacklisting.

---

## Analysis Endpoints

### 1. Run DiD Analysis
Run a Difference-in-Differences analysis on uploaded data.

**Endpoint:** `POST /api/analysis/did`

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

**Form Data:**
- `file`: CSV file to analyze
- `treatment`: Name of treatment column
- `time`: Name of time column
- `outcome`: Name of outcome column
- `treatment_time`: Time when treatment was applied (integer)

**Success Response (200):**
```json
{
  "coefficient": 5.2,
  "p_value": 0.03,
  "confidence_interval": [1.2, 9.2],
  "user_id": 1
}
```

**Error Responses:**
- `401`: Invalid or missing token
- `400`: Invalid input or file
- `500`: Server error

---

## Token Information

### Access Token
- **Duration:** 1 hour
- **Purpose:** Used for authenticating API requests
- **Storage:** Store securely (e.g., memory, secure cookie)

### Refresh Token
- **Duration:** 30 days
- **Purpose:** Used to obtain new access tokens
- **Storage:** Store securely (e.g., httpOnly cookie)

### Token Flow
1. User logs in → receives both access and refresh tokens
2. Use access token for API requests
3. When access token expires → use refresh token to get new access token
4. When refresh token expires → user must log in again

---

## Example Usage

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

### Using Python

```python
import requests

# Register
response = requests.post('http://localhost:5001/api/auth/register', json={
    'username': 'johndoe',
    'email': 'john@example.com',
    'password': 'SecurePass123'
})
data = response.json()
access_token = data['access_token']

# Use the token for authenticated requests
headers = {'Authorization': f'Bearer {access_token}'}
response = requests.get('http://localhost:5001/api/auth/me', headers=headers)
print(response.json())
```

### Using JavaScript (Fetch)

```javascript
// Register
const response = await fetch('http://localhost:5001/api/auth/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    username: 'johndoe',
    email: 'john@example.com',
    password: 'SecurePass123'
  })
});

const data = await response.json();
const accessToken = data.access_token;

// Store token (e.g., in localStorage or memory)
localStorage.setItem('access_token', accessToken);

// Use token for authenticated requests
const userResponse = await fetch('http://localhost:5001/api/auth/me', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const userData = await userResponse.json();
console.log(userData);
```

---

## Security Best Practices

1. **HTTPS Only:** Always use HTTPS in production
2. **Secret Key:** Change JWT_SECRET_KEY to a strong random value
3. **Token Storage:** 
   - Store access tokens in memory (React state, Vuex, etc.)
   - Store refresh tokens in httpOnly cookies
4. **Password Security:** Enforce strong password requirements
5. **Rate Limiting:** Implement rate limiting for auth endpoints
6. **Token Blacklisting:** Implement token blacklisting for logout in production
7. **Environment Variables:** Store sensitive config in environment variables

---

## Error Handling

All errors follow this format:
```json
{
  "error": "Description of the error"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `409`: Conflict
- `500`: Internal Server Error


