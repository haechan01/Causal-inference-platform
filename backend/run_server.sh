#!/bin/bash

# Clean Flask server startup script
# This ensures no cached modules interfere

echo "🧹 Cleaning Python cache..."
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null
find . -type f -name "*.pyc" -delete 2>/dev/null

echo "🔪 Killing any existing Flask processes..."
pkill -9 -f "python.*app.py" 2>/dev/null
sleep 1

echo "🚀 Starting Flask server..."
source venv/bin/activate
python -B app.py  # -B flag ignores .pyc files


