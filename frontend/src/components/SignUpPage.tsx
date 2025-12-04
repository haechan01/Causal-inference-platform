// src/components/SignUpPage.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const SignUpPage: React.FC = () => {
  // Form state variables
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  
  // UI state variables
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Get authentication functions from context
  const { register, isLoading } = useAuth();
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
    
    // Username validation
    if (!formData.username.trim()) {
      newErrors.push('Username is required');
    } else if (formData.username.length < 3) {
      newErrors.push('Username must be at least 3 characters long');
    }
    
    // Email validation
    if (!formData.email.trim()) {
      newErrors.push('Email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.push('Please enter a valid email address');
    }
    
    // Password validation
    if (!formData.password) {
      newErrors.push('Password is required');
    } else if (formData.password.length < 8) {
      newErrors.push('Password must be at least 8 characters long');
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.push('Password must contain at least one uppercase letter, one lowercase letter, and one number');
    }
    
    // Confirm password validation
    if (!formData.confirmPassword) {
      newErrors.push('Please confirm your password');
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.push('Passwords do not match');
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
      // Call the register function from auth context
      await register(formData.username, formData.email, formData.password);
      
      // Navigate to home page after successful registration
      navigate('/');
      
    } catch (error: any) {
      // Handle registration errors
      setErrors([error.message || 'Registration failed. Please try again.']);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.formContainer}>
        <h2 style={styles.title}>Create Account</h2>
        <p style={styles.subtitle}>Sign up to get started</p>
        
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
        
        {/* Sign up form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Username field */}
          <div style={styles.inputGroup}>
            <label htmlFor="username" style={styles.label}>
              Username
            </label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              placeholder="Enter your username"
              style={styles.input}
              disabled={isSubmitting || isLoading}
              required
            />
          </div>
          
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
          
          {/* Confirm password field */}
          <div style={styles.inputGroup}>
            <label htmlFor="confirmPassword" style={styles.label}>
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              placeholder="Confirm your password"
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
            {isSubmitting ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>
        
        {/* Switch to  */}
        <div style={styles.switchContainer}>
          <p style={styles.switchText}>
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => navigate('/login')}
              style={styles.switchButton}
              disabled={isSubmitting || isLoading}
            >
              Sign In
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
    backgroundColor: '#4F9CF9',
    color: 'white',
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

export default SignUpPage;
