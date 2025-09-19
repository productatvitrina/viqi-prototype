"""Migration script to add subscription fields to User table."""
import os
import sys
import sqlite3
from loguru import logger

# Add the parent directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from config.database import engine


def check_column_exists(cursor, table_name, column_name):
    """Check if a column exists in a table."""
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = [column[1] for column in cursor.fetchall()]
    return column_name in columns


def migrate_user_subscription_fields():
    """Add subscription fields to User table if they don't exist."""
    try:
        # Get SQLite connection
        connection = engine.connect().connection
        cursor = connection.cursor()
        
        logger.info("Starting User table migration for subscription fields...")
        
        # List of new columns to add
        new_columns = [
            ("stripe_customer_id", "VARCHAR(255)"),
            ("stripe_subscription_id", "VARCHAR(255)"),
            ("subscription_status", "VARCHAR(50)"),
            ("subscription_plan_id", "INTEGER"),
            ("subscription_expires_at", "DATETIME"),
            ("subscription_created_at", "DATETIME")
        ]
        
        migration_needed = False
        
        for column_name, column_type in new_columns:
            if not check_column_exists(cursor, "users", column_name):
                logger.info(f"Adding column {column_name} to users table...")
                
                # Add the column
                alter_sql = f"ALTER TABLE users ADD COLUMN {column_name} {column_type}"
                cursor.execute(alter_sql)
                
                migration_needed = True
                logger.info(f"✅ Added column: {column_name}")
            else:
                logger.info(f"⏭️  Column {column_name} already exists, skipping")
        
        if migration_needed:
            # Create indexes for new columns
            try:
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription_id ON users(stripe_subscription_id)")
                logger.info("✅ Created indexes for new columns")
            except Exception as e:
                logger.warning(f"Index creation warning: {e}")
        
        # Commit the changes
        connection.commit()
        
        if migration_needed:
            logger.info("🎉 User table migration completed successfully!")
        else:
            logger.info("🔄 No migration needed - all columns already exist")
        
        # Verify the migration
        cursor.execute("PRAGMA table_info(users)")
        columns = cursor.fetchall()
        logger.info(f"Users table now has {len(columns)} columns:")
        for column in columns:
            logger.info(f"  - {column[1]} ({column[2]})")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Migration failed: {e}")
        return False
    finally:
        if 'connection' in locals():
            connection.close()


def rollback_migration():
    """Rollback the subscription fields migration (SQLite doesn't support DROP COLUMN easily)."""
    logger.warning("⚠️  SQLite doesn't support DROP COLUMN easily.")
    logger.warning("To rollback this migration, you would need to:")
    logger.warning("1. Export data with: .dump users")
    logger.warning("2. Drop table: DROP TABLE users")
    logger.warning("3. Recreate table without subscription fields")
    logger.warning("4. Import data back")
    logger.warning("Or use the backup database if available.")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Migrate User table for subscription fields")
    parser.add_argument("--rollback", action="store_true", help="Show rollback instructions")
    args = parser.parse_args()
    
    if args.rollback:
        rollback_migration()
    else:
        success = migrate_user_subscription_fields()
        sys.exit(0 if success else 1)