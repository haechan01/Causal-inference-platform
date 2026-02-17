# Railway Deployment Guide

This guide helps you deploy and connect your frontend to the Railway backend.

## Backend Deployment (Railway)

### 1. Verify Backend is Running

Test your backend health endpoint:
```bash
curl https://causal-studio-production.up.railway.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "message": "Causalytics API is running"
}
```

### 2. Configure CORS in Railway Backend

**Important:** You must update the `CORS_ORIGINS` environment variable in Railway to allow your frontend domain.

1. Go to your Railway project dashboard
2. Select your backend service
3. Go to the **Variables** tab
4. Add or update `CORS_ORIGINS` with your frontend URL(s):
   ```
   CORS_ORIGINS=https://your-frontend-domain.com,http://localhost:3000
   ```
   - Replace `your-frontend-domain.com` with your actual frontend domain
   - Include `http://localhost:3000` if you want to test locally
   - Multiple origins should be comma-separated (no spaces)

5. Railway will automatically redeploy after you save the variable

### 3. Required Backend Environment Variables

Ensure these are set in Railway backend service:

- `SECRET_KEY` - Flask secret key
- `JWT_SECRET_KEY` - JWT signing key
- `JWT_ACCESS_TOKEN_EXPIRES` - Access token expiration (seconds)
- `JWT_REFRESH_TOKEN_EXPIRES` - Refresh token expiration (seconds)
- `DATABASE_URL` - Supabase PostgreSQL connection string
- `PORT` - Railway sets this automatically
- `CORS_ORIGINS` - Frontend domain(s) allowed to make requests

## Frontend Deployment

### Option 1: Deploy Frontend to Railway

1. Create a new service in Railway for your frontend
2. Connect your GitHub repository
3. Set the root directory to `frontend`
4. Railway will detect the Dockerfile automatically
5. The `.env.production` file will be used during build

### Option 2: Deploy Frontend Locally or to Another Platform

#### Using Docker Compose (Local Development)

Update `docker-compose.yml`:
```yaml
frontend:
  build:
    context: ./frontend
    dockerfile: Dockerfile
    args:
      REACT_APP_API_URL: https://causal-studio-production.up.railway.app/api
```

Then build and run:
```bash
docker-compose build frontend
docker-compose up frontend
```

#### Using npm (Local Development)

1. Create a `.env` file in the `frontend` directory:
   ```
   REACT_APP_API_URL=https://causal-studio-production.up.railway.app/api
   ```

2. Run the development server:
   ```bash
   cd frontend
   npm install
   npm start
   ```

#### Building for Production

The `.env.production` file is automatically used when building:
```bash
cd frontend
npm run build
```

## Testing the Connection

### 1. Test Backend Health
```bash
curl https://causal-studio-production.up.railway.app/health
```

### 2. Test Backend Root
```bash
curl https://causal-studio-production.up.railway.app/
```

### 3. Test from Frontend

Open your browser's developer console and check:
- Network tab for API requests
- Console for any CORS errors
- Verify requests are going to `https://causal-studio-production.up.railway.app/api`

## Troubleshooting

### CORS Errors

If you see CORS errors in the browser console:
1. Verify `CORS_ORIGINS` in Railway includes your frontend domain
2. Check that the domain matches exactly (including `https://` or `http://`)
3. Restart the backend service in Railway after updating CORS_ORIGINS

### Backend Not Responding

1. Check Railway deployment logs
2. Verify all required environment variables are set
3. Check that the service shows "Active" status
4. Verify the PORT environment variable (Railway sets this automatically)

### Frontend Can't Connect

1. Verify `REACT_APP_API_URL` is set correctly
2. Check browser console for network errors
3. Ensure the backend URL is accessible (test with curl)
4. Verify CORS configuration allows your frontend domain

## Quick Verification Checklist

- [ ] Backend health endpoint returns `{"status": "healthy"}`
- [ ] `CORS_ORIGINS` includes your frontend domain
- [ ] Frontend `.env.production` has correct `REACT_APP_API_URL`
- [ ] All backend environment variables are set in Railway
- [ ] Backend service shows "Active" in Railway dashboard
- [ ] Frontend can make API requests without CORS errors
