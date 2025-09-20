"""Database configuration and session management."""
import os
import shutil
from pathlib import Path
from sqlalchemy import create_engine, MetaData
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from loguru import logger

# For demo purposes, using SQLite instead of PostgreSQL
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./viqi.db")

if DATABASE_URL.startswith("sqlite:///"):
    raw_path = DATABASE_URL.replace("sqlite:///", "", 1)
    original_path = Path(raw_path)

    if not original_path.is_absolute():
        original_path = Path(__file__).resolve().parent.parent / raw_path

    if not original_path.exists():
        logger.warning(f"SQLite database not found at {original_path}, will create new one")

    target_dir = Path(os.getenv("SQLITE_WRITE_DIR", "/tmp"))
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / original_path.name

    try:
        if original_path.exists():
            shutil.copy2(original_path, target_path)
            logger.info(f"Copied SQLite database to writable location: {target_path}")
    except Exception as copy_error:
        logger.warning(f"Failed to copy SQLite database to {target_path}: {copy_error}")

    DATABASE_URL = f"sqlite:///{target_path}"

# Create engine with debugging enabled in development
engine = create_engine(
    DATABASE_URL,
    echo=os.getenv("DEBUG", "false").lower() == "true",
    # SQLite specific settings
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    pool_pre_ping=True,
    pool_recycle=300,
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for declarative models
Base = declarative_base()

# Metadata for migrations
metadata = MetaData()


def get_db():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        logger.debug("Database session created")
        yield db
    except Exception as e:
        logger.error(f"Database session error: {e}")
        db.rollback()
        raise
    finally:
        logger.debug("Database session closed")
        db.close()


def init_db():
    """Initialize database tables."""
    logger.info("Initializing database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created successfully")
