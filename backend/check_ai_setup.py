#!/usr/bin/env python3
"""
Quick script to check if AI service is properly configured
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

print("=== AI Service Configuration Check ===\n")

# Check for GOOGLE_API_KEY
api_key = os.getenv('GOOGLE_API_KEY')
if api_key:
    print("✅ GOOGLE_API_KEY is set")
    print(f"   Key preview: {api_key[:10]}...{api_key[-5:] if len(api_key) > 15 else 'too short'}")
else:
    print("❌ GOOGLE_API_KEY is NOT set")
    print("   Please add GOOGLE_API_KEY=your_key to backend/.env")

# Check for other AI config
print(f"\nAI_MODEL_NAME: {os.getenv('AI_MODEL_NAME', 'gemini-pro (default)')}")
print(f"AI_TEMPERATURE: {os.getenv('AI_TEMPERATURE', '0.7 (default)')}")
print(f"AI_MAX_TOKENS: {os.getenv('AI_MAX_TOKENS', '2048 (default)')}")

# Try to import and initialize
print("\n=== Testing AI Service Import ===\n")
try:
    from services.ai_service import get_ai_service
    print("✅ AI service module imports successfully")
    
    if api_key:
        try:
            ai_service = get_ai_service()
            print("✅ AI service initializes successfully")
            print("✅ Ready to use!")
        except Exception as e:
            print(f"❌ Failed to initialize AI service: {str(e)}")
    else:
        print("⚠️  Cannot test initialization without GOOGLE_API_KEY")
except ImportError as e:
    print(f"❌ Failed to import AI service: {str(e)}")
    print("   Make sure google-generativeai is installed:")
    print("   pip install google-generativeai==0.3.2")
except Exception as e:
    print(f"❌ Unexpected error: {str(e)}")

print("\n=== Check Complete ===")

