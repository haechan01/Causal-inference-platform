# Backend Dockerfile - Flask API
FROM python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies (psycopg2 needs libpq)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN adduser --disabled-password --gecos '' appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 5001

# Run gunicorn (matches Procfile)
CMD ["sh", "-c", "python -c \"from app import app, db; app.app_context().push(); db.create_all(); print('Database tables ready')\" && python -m gunicorn -w 4 -b 0.0.0.0:${PORT:-5001} app:app"]
