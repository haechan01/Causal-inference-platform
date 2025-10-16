"""
Test script for authentication endpoints
Run the Flask app first, then run this script
"""

import requests
import json

BASE_URL = "http://localhost:5001"


def test_register():
    """Test user registration"""
    print("\n=== Testing User Registration ===")
    url = f"{BASE_URL}/api/auth/register"
    data = {
        "username": "testuser",
        "email": "test@example.com",
        "password": "TestPass123"
    }

    response = requests.post(url, json=data)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")

    if response.status_code == 201:
        return response.json()['access_token']
    return None


def test_login():
    """Test user login"""
    print("\n=== Testing User Login ===")
    url = f"{BASE_URL}/api/auth/login"
    data = {
        "email": "test@example.com",
        "password": "TestPass123"
    }

    response = requests.post(url, json=data)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")

    if response.status_code == 200:
        return response.json()['access_token'], response.json()['refresh_token']  # noqa: E501
    return None, None


def test_get_current_user(access_token):
    """Test getting current user info"""
    print("\n=== Testing Get Current User ===")
    url = f"{BASE_URL}/api/auth/me"
    headers = {"Authorization": f"Bearer {access_token}"}

    response = requests.get(url, headers=headers)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")


def test_refresh_token(refresh_token):
    """Test token refresh"""
    print("\n=== Testing Token Refresh ===")
    url = f"{BASE_URL}/api/auth/refresh"
    headers = {"Authorization": f"Bearer {refresh_token}"}

    response = requests.post(url, headers=headers)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")

    if response.status_code == 200:
        return response.json()['access_token']
    return None


def test_logout(access_token):
    """Test logout"""
    print("\n=== Testing Logout ===")
    url = f"{BASE_URL}/api/auth/logout"
    headers = {"Authorization": f"Bearer {access_token}"}

    response = requests.post(url, headers=headers)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")


if __name__ == "__main__":
    print("Starting Authentication Tests...")
    print("Make sure the Flask app is running on http://localhost:5001")

    # Test registration (may fail if user already exists)
    access_token = test_register()

    # Test login
    access_token, refresh_token = test_login()

    if access_token:
        # Test get current user
        test_get_current_user(access_token)

        # Test refresh token
        new_access_token = test_refresh_token(refresh_token)

        # Test logout
        test_logout(access_token)

    print("\n=== Tests Complete ===")


