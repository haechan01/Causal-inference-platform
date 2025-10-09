# API Testing Instructions

## Setup & Start Server

Open a **NEW terminal window** (fresh session to avoid Python cache issues):

```bash
cd "/Users/hcoh/Desktop/causal platform/backend"
source venv/bin/activate
python app.py
```

Server will start on **http://localhost:5001** (not 5000 - that's used by AirTunes)

You should see:
```
 * Running on http://127.0.0.1:5001
 * Running on http://192.168.x.x:5001
```

---

## Test 1: Health Check ✅

```bash
curl http://localhost:5001/health
```

**Expected:**
```json
{"message":"Causalytics API is running","status":"healthy"}
```

---

## Test 2: Register User ✅

```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john",
    "email": "john@example.com",
    "password": "Test1234"
  }'
```

**Expected (201):**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": 1,
    "username": "john",
    "email": "john@example.com"
  },
  "access_token": "eyJ0eXAi...",
  "refresh_token": "eyJ0eXAi..."
}
```

**Save the access_token!**

---

## Test 3: Login ✅

```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "Test1234"
  }'
```

**Expected (200):**
```json
{
  "message": "Login successful",
  "user": {...},
  "access_token": "...",
  "refresh_token": "..."
}
```

---

## Test 4: Get Current User (Protected Route) 🔐

Replace `YOUR_TOKEN` with the access_token from above:

```bash
curl http://localhost:5001/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected (200):**
```json
{
  "user": {
    "id": 1,
    "username": "john",
    "email": "john@example.com"
  }
}
```

---

## Test 5: Refresh Token ♻️

Replace `YOUR_REFRESH_TOKEN` with the refresh_token:

```bash
curl -X POST http://localhost:5001/api/auth/refresh \
  -H "Authorization: Bearer YOUR_REFRESH_TOKEN"
```

**Expected (200):**
```json
{
  "access_token": "eyJ0eXAi..."
}
```

---

## Test 6: Logout ✅

```bash
curl -X POST http://localhost:5001/api/auth/logout \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected (200):**
```json
{
  "message": "Logout successful. Please remove the token from client."
}
```

---

## Test 7: Error Cases ❌

### Invalid Password (too short)
```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test",
    "email": "test@example.com",
    "password": "weak"
  }'
```

**Expected (400):**
```json
{
  "error": "Password must be at least 8 characters long"
}
```

### Duplicate Email
```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john2",
    "email": "john@example.com",
    "password": "Test1234"
  }'
```

**Expected (409):**
```json
{
  "error": "Email already registered"
}
```

### Invalid Credentials
```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "WrongPassword"
  }'
```

**Expected (401):**
```json
{
  "error": "Invalid email or password"
}
```

### No Token (Protected Route)
```bash
curl http://localhost:5001/api/auth/me
```

**Expected (401):**
```json
{
  "msg": "Missing Authorization Header"
}
```

---

## Automated Test Script

Or run the automated test:

```bash
cd "/Users/hcoh/Desktop/causal platform/backend"
source venv/bin/activate
python test_auth.py
```

---

## Troubleshooting

### Port 5000 already in use
✅ Fixed! Now using port 5001

### Circular import error
✅ Fixed! Models imported within functions

### Database not initialized
```bash
python init_db.py
```

### Server won't start
1. Kill any existing processes:
   ```bash
   pkill -f "python app.py"
   ```

2. Clear Python cache:
   ```bash
   find . -type d -name "__pycache__" -exec rm -rf {} +
   ```

3. Start fresh:
   ```bash
   python app.py
   ```

---

## Success Checklist ✅

- [ ] Server starts on port 5001
- [ ] Health endpoint returns JSON
- [ ] Can register new user
- [ ] Can login with credentials
- [ ] Receive JWT tokens
- [ ] Protected routes require token
- [ ] Token refresh works
- [ ] Error handling works

---

## Quick Copy-Paste Test

```bash
# Terminal 1: Start server
cd "/Users/hcoh/Desktop/causal platform/backend" && source venv/bin/activate && python app.py

# Terminal 2: Test (wait for server to start)
sleep 3
curl http://localhost:5001/health
curl -X POST http://localhost:5001/api/auth/register -H "Content-Type: application/json" -d '{"username":"testuser","email":"test@test.com","password":"Test1234"}'
```

Store the access_token from the response and test protected routes!


