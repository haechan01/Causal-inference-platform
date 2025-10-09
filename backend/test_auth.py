#!/usr/bin/env python3
"""
Simple test script for the authentication API endpoints.
"""
import requests
import json

BASE_URL = "http://localhost:5001"

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

def test_refresh_token(refresh_token):
    """Test token refresh."""
    print("\nTesting token refresh...")
    
    headers = {"Authorization": f"Bearer {refresh_token}"}
    response = requests.post(f"{BASE_URL}/api/auth/refresh", headers=headers)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    return response.json() if response.status_code == 200 else None

if __name__ == "__main__":
    print("Starting API tests...")
    print(f"Testing against: {BASE_URL}")
    
    # Test registration
    register_result = test_register()
    
    # Test login
    login_result = test_login()
    if login_result:
        access_token = login_result.get("access_token")
        refresh_token = login_result.get("refresh_token")
        
        # Test get user info
        test_get_user(access_token)
        
        # Test token refresh
        test_refresh_token(refresh_token)
    
    print("\nTests completed!")
