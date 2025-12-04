// src/components/LoginPage.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const LoginPage: React.FC = () => {
  // Form state variables
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  
  // UI state variables
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Get authentication functions from context
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear errors when user starts typing
    if (errors.length > 0) {
      setErrors([]);
    }
  };

  // Validate form data
  const validateForm = (): string[] => {
    const newErrors: string[] = [];
    
    // Email validation
    if (!formData.email.trim()) {
      newErrors.push('Email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.push('Please enter a valid email address');
    }
    
    // Password validation
    if (!formData.password) {
      newErrors.push('Password is required');
    }
    
    return newErrors;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    
    setIsSubmitting(true);
    setErrors([]);
    
    try {
      // Call the login function from auth context
      await login(formData.email, formData.password);
      
      // Navigate to home page (dashboard) after successful login
      navigate('/dashboard');
      
    } catch (error: any) {
      // Handle login errors
      setErrors([error.message || 'Login failed. Please check your credentials.']);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.formContainer}>
        <h2 style={styles.title}>Welcome Back</h2>
        <p style={styles.subtitle}>Sign in to your account</p>
        
        {/* Error messages */}
        {errors.length > 0 && (
          <div style={styles.errorContainer}>
            {errors.map((error, index) => (
              <div key={index} style={styles.errorMessage}>
                {error}
              </div>
            ))}
          </div>
        )}
        
        {/* Login form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Email field */}
          <div style={styles.inputGroup}>
            <label htmlFor="email" style={styles.label}>
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="Enter your email"
              style={styles.input}
              disabled={isSubmitting || isLoading}
              required
            />
          </div>
          
          {/* Password field */}
          <div style={styles.inputGroup}>
            <label htmlFor="password" style={styles.label}>
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="Enter your password"
              style={styles.input}
              disabled={isSubmitting || isLoading}
              required
            />
          </div>
          
          {/* Submit button */}
          <button
            type="submit"
            style={{
              ...styles.submitButton,
              ...(isSubmitting || isLoading ? styles.submitButtonDisabled : {})
            }}
            disabled={isSubmitting || isLoading}
          >
            {isSubmitting ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
        
        {/* Switch to sign up */}
        <div style={styles.switchContainer}>
          <p style={styles.switchText}>
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => navigate('/signup')}
              style={styles.switchButton}
              disabled={isSubmitting || isLoading}
            >
              Sign Up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

// Styles object - keeping styles in the component for simplicity
const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    padding: '20px'
  },
  formContainer: {
    backgroundColor: 'white',
    padding: '40px',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
    width: '100%',
    maxWidth: '400px'
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '8px',
    textAlign: 'center' as const
  },
  subtitle: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '30px',
    textAlign: 'center' as const
  },
  errorContainer: {
    backgroundColor: '#fee',
    border: '1px solid #fcc',
    borderRadius: '4px',
    padding: '12px',
    marginBottom: '20px'
  },
  errorMessage: {
    color: '#c33',
    fontSize: '14px',
    marginBottom: '4px'
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px'
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333'
  },
  input: {
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '16px',
    transition: 'border-color 0.2s',
    outline: 'none'
  },
  submitButton: {
    backgroundColor: '#FFE492',
    color: '#043873',
    padding: '12px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
    cursor: 'not-allowed'
  },
  switchContainer: {
    marginTop: '20px',
    textAlign: 'center' as const
  },
  switchText: {
    fontSize: '14px',
    color: '#666',
    margin: 0
  },
  switchButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#007bff',
    cursor: 'pointer',
    textDecoration: 'underline',
    fontSize: '14px'
  }
};

export default LoginPage;
