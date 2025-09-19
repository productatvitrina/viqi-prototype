"""Initialize database tables."""
import os
import sys
import logging
from loguru import logger

# Add the parent directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from config.database import init_db, engine
from models.models import create_indexes

# Configure logging
logger.add("logs/database.log", rotation="500 MB", level="DEBUG" if os.getenv("DEBUG") else "INFO")


def main():
    """Initialize the database."""
    try:
        logger.info("Starting database initialization...")
        
        # Create all tables
        init_db()
        
        # Create custom indexes
        create_indexes()
        
        logger.info("Database initialization completed successfully!")
        
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
