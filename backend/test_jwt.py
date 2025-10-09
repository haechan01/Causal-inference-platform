#!/usr/bin/env python3
"""
Simple test script for JWT authentication.
"""
import requests
import json

BASE_URL = "http://localhost:5000"

def test_register():
    """Test user registration."""
    print("Testing user registration...")
    
    data = {
        "username": "testuser",
        "email": "test@example.com",
        "password": "testpassword123"
    }
    
    response = requests.post(f"{BASE_URL}/api/auth/register", json=data)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    return response.json() if response.status_code == 201 else None

def test_login():
    """Test user login."""
    print("\nTesting user login...")
    
    data = {
        "username": "testuser",
        "password": "testpassword123"
    }
    
    response = requests.post(f"{BASE_URL}/api/auth/login", json=data)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    return response.json() if response.status_code == 200 else None

def test_get_user(token):
    """Test getting current user info."""
    print("\nTesting get current user...")
    
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")

if __name__ == "__main__":
    print("Starting JWT authentication tests...")
    print(f"Testing against: {BASE_URL}")
    
    # Test registration
    register_result = test_register()
    
    # Test login
    login_result = test_login()
    if login_result:
        access_token = login_result.get("access_token")
        
        # Test get user info
        test_get_user(access_token)
    
    print("\nTests completed!")
