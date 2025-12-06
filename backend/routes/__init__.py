"""
Routes package initialization.
Provides access to limiter for rate limiting in routes.
"""

# Limiter will be set by app.py after initialization
_limiter = None


def set_limiter(limiter_instance):
    """Set the limiter instance for use in routes."""
    global _limiter
    _limiter = limiter_instance


def get_limiter():
    """Get the limiter instance."""
    return _limiter

