# Frontend Authentication System

This is a complete authentication system built with React and TypeScript that connects to your Flask backend.

## 🏗️ **Architecture Overview**

### **1. Authentication Context (`AuthContext.tsx`)**
- **Purpose**: Manages global authentication state
- **Key Features**:
  - Stores user data, access tokens, and refresh tokens
  - Handles automatic token refresh
  - Provides login, register, and logout functions
  - Manages localStorage for persistent sessions

### **2. Authentication Pages**
- **`LoginPage.tsx`**: User login form
- **`SignUpPage.tsx`**: User registration form
- **`Authentication.tsx`**: Switches between login and signup

### **3. Protected Components**
- **`Dashboard.tsx`**: Main app interface for authenticated users
- **`App.tsx`**: Main app that handles authentication flow

## 🔧 **How It Works**

### **Authentication Flow**
1. **App starts** → Check localStorage for existing tokens
2. **If tokens exist** → Verify with backend (`/api/auth/me`)
3. **If valid** → User is logged in, show Dashboard
4. **If invalid/missing** → Show Authentication pages

### **Login Process**
1. User enters email/password
2. Frontend sends POST to `/api/auth/login`
3. Backend returns user data + tokens
4. Frontend stores tokens in localStorage
5. User is redirected to Dashboard

### **Registration Process**
1. User enters username/email/password
2. Frontend validates form data
3. Frontend sends POST to `/api/auth/register`
4. Backend creates user + returns tokens
5. User is automatically logged in

### **Token Management**
- **Access Token**: Short-lived, used for API requests
- **Refresh Token**: Long-lived, used to get new access tokens
- **Automatic Refresh**: When access token expires, automatically refresh it
- **Logout**: Clears all tokens and user data

## 🚀 **How to Use**

### **1. Start the Backend**
```bash
cd backend
source venv/bin/activate
python app.py
```

### **2. Start the Frontend**
```bash
cd frontend
npm start
```

### **3. Test the System**
1. Open `http://localhost:3000`
2. You'll see the login page
3. Click "Sign Up" to create an account
4. After registration, you'll be logged in automatically
5. Use the Dashboard to see your user info
6. Click "Logout" to sign out

## 📚 **Learning Points**

### **React Concepts Used**
- **Context API**: Global state management
- **Custom Hooks**: `useAuth()` for easy access to auth functions
- **useState**: Local component state
- **useEffect**: Side effects (API calls, localStorage)
- **TypeScript**: Type safety for props and state

### **Authentication Concepts**
- **JWT Tokens**: Stateless authentication
- **Token Refresh**: Automatic token renewal
- **Protected Routes**: Components that require authentication
- **Persistent Sessions**: Using localStorage

### **API Integration**
- **Axios**: HTTP client for API requests
- **Interceptors**: Automatic token attachment and refresh
- **Error Handling**: Graceful error management

## 🔒 **Security Features**

- **Password Validation**: Strong password requirements
- **Email Validation**: Proper email format checking
- **Token Storage**: Secure localStorage usage
- **Automatic Logout**: On token refresh failure
- **Error Handling**: User-friendly error messages

## 🎨 **Styling**

- **Inline Styles**: Simple, component-scoped styling
- **Responsive Design**: Mobile-friendly layouts
- **Loading States**: Visual feedback during API calls
- **Error Display**: Clear error message presentation

## 🔧 **Customization**

### **Adding New Protected Pages**
```tsx
import { useAuth } from '../contexts/AuthContext';

const MyProtectedPage = () => {
  const { isAuthenticated, user } = useAuth();
  
  if (!isAuthenticated) {
    return <div>Please log in</div>;
  }
  
  return <div>Welcome, {user?.username}!</div>;
};
```

### **Adding New API Calls**
```tsx
import axios from 'axios';

const fetchUserData = async () => {
  try {
    const response = await axios.get('/api/user/data');
    return response.data;
  } catch (error) {
    console.error('API call failed:', error);
  }
};
```

This system provides a solid foundation for building authenticated React applications!
