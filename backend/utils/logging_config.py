"""
Logging configuration for the application.
"""
import logging
import os
from logging.handlers import RotatingFileHandler
from datetime import datetime


def setup_logging(app):
    """
    Configure logging for the Flask application.
    
    Args:
        app: Flask application instance
    """
    # Don't set up file logging if in testing mode
    if app.config.get('TESTING'):
        logging.basicConfig(level=logging.DEBUG)
        return
    
    # Get log level from config
    log_level = getattr(logging, app.config.get('LOG_LEVEL', 'INFO').upper())
    
    # Set root logger level
    app.logger.setLevel(log_level)
    
    # Remove default handler
    if app.logger.handlers:
        app.logger.handlers.clear()
    
    # Console handler (always)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    console_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    console_handler.setFormatter(console_formatter)
    app.logger.addHandler(console_handler)
    
    # File handler (production)
    if not app.debug:
        log_file = app.config.get('LOG_FILE', 'logs/causalytics.log')
        log_dir = os.path.dirname(log_file)
        
        # Create logs directory if it doesn't exist
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir, exist_ok=True)
        
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=10240000,  # 10MB
            backupCount=10
        )
        file_handler.setLevel(log_level)
        file_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - '
            '%(message)s [in %(pathname)s:%(lineno)d]',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        file_handler.setFormatter(file_formatter)
        app.logger.addHandler(file_handler)
    
    # SQLAlchemy logging (development only)
    if app.debug:
        sql_logger = logging.getLogger('sqlalchemy.engine')
        sql_logger.setLevel(logging.INFO)
    
    app.logger.info('Logging configured successfully')
    app.logger.info(f'Environment: {app.config.get("ENV", "unknown")}')
    app.logger.info(f'Debug mode: {app.debug}')

